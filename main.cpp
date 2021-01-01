#include <ola/Callback.h>
#include <ola/DmxBuffer.h>
#include <ola/Logging.h>
#include <ola/client/ClientWrapper.h>
#include <ola/io/SelectServer.h>

#include <algorithm>
#include <unistd.h>
#include <atomic>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <queue>
#include <random>
#include <streambuf>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <vector>
#include <zipper/unzipper.h>
#include <zipper/zipper.h>

#include "App.h"
#include "Fixture.hpp"
#include "Group.hpp"
#include "Cue.hpp"
#include "Utilities.hpp"
#include "concurrentqueue.h"
#include "json.hpp"
#include "base64.hpp"

using namespace std;
using json = nlohmann::json;
namespace fs = std::filesystem;
using namespace zipper;

struct PerSocketData {
    uWS::WebSocket<0, 1> *socketItem;
    string userID;
};

struct SendMessage {
    string content;
    string type;
    string to;
    string recipient = "";
};

atomic<int> finished;
mutex door;
mutex sendMessagesDoor;
mutex userDoor;
unordered_map<string, Fixture> fixtures;
unordered_map<string, Group> groups;
unordered_map<string, Cue> cues;
string currentCue = "";
string lastCue = "";
bool cuePlaying = false;
unordered_map<string, PerSocketData *> users;
moodycamel::ConcurrentQueue<json> tasks;
vector<SendMessage> sendMessages;
json fixtureProfiles;

ola::client::OlaClientWrapper wrapper;

uint8_t frames[2048] = {0};

void sendToAllMessage(string content, string type) {
    SendMessage newSendMessage;
    newSendMessage.content = content;
    newSendMessage.type = type;
    newSendMessage.to = "all";
    bool needsPush = true;
    lock_guard<mutex> lg(sendMessagesDoor);
    for (auto &tm : sendMessages) {
        if (tm.type == newSendMessage.type && tm.to == newSendMessage.to && tm.recipient == newSendMessage.recipient) {
            tm.content = newSendMessage.content;
            needsPush = false;
        }
    }
    if (needsPush == true) {
        sendMessages.push_back(newSendMessage);
    }
    sendMessagesDoor.unlock();
}

void sendToAllExceptMessage(string content, string socketID, string type) {
    SendMessage newSendMessage;
    newSendMessage.content = content;
    newSendMessage.type = type;
    newSendMessage.to = "allExcept";
    newSendMessage.recipient = socketID;
    bool needsPush = true;
    lock_guard<mutex> lg(sendMessagesDoor);
    for (auto &tm : sendMessages) {
        if (tm.type == newSendMessage.type && tm.to == newSendMessage.to && tm.recipient == newSendMessage.recipient) {
            tm.content = newSendMessage.content;
            needsPush = false;
        }
    }
    if (needsPush == true) {
        sendMessages.push_back(newSendMessage);
    }
    sendMessagesDoor.unlock();
}

void sendToMessage(string content, string socketID, string type) {
    SendMessage newSendMessage;
    newSendMessage.content = content;
    newSendMessage.type = type;
    newSendMessage.to = "single";
    newSendMessage.recipient = socketID;
    bool needsPush = true;
    lock_guard<mutex> lg(sendMessagesDoor);
    for (auto &tm : sendMessages) {
        if (tm.type == newSendMessage.type && tm.to == newSendMessage.to && tm.recipient == newSendMessage.recipient) {
            tm.content = newSendMessage.content;
            needsPush = false;
        }
    }
    if (needsPush == true) {
        sendMessages.push_back(newSendMessage);
    }
    sendMessagesDoor.unlock();
}

void sendToAll(string content) {
    lock_guard<mutex> lg(userDoor);
    for (auto &it : users) {
        it.second->socketItem->send(content, uWS::OpCode::TEXT, true);
    }
    userDoor.unlock();
}

void sendToAllExcept(string content, string socketID) {
    lock_guard<mutex> lg(userDoor);
    for (auto &it : users) {
        if (it.first != socketID) {
            it.second->socketItem->send(content, uWS::OpCode::TEXT, true);
        }
    }
    userDoor.unlock();
}

void sendTo(string content, string socketID) {
    lock_guard<mutex> lg(userDoor);
    if (users.find(socketID) != users.end()) {
        users[socketID]->socketItem->send(content, uWS::OpCode::TEXT, true);
    }
    userDoor.unlock();
}

void setFrames(int universe, int address, int coarse, int fine, int dmxValue) {
    frames[((universe - 1) * 512) + ((address - 1) + coarse)] = dmxValue >> 8;
    if (fine != -1) {
        frames[((universe - 1) * 512) + ((address - 1) + fine)] = dmxValue & 0xff;
    }
}

json getFixtures() {
    json j = {};
    for (auto &it : fixtures) {
        j.push_back(it.second.asJson());
    }
    sort(j.begin(), j.end(), compareByAddress);
    return j;
}

json getGroups() {
    json j = {};
    for (auto &it : groups) {
        j.push_back(it.second.asJson());
    }
    return j;
}

json getCues() {
    json j = {};
    for (auto &it : cues) {
        j.push_back(it.second.asJson());
    }
    sort(j.begin(), j.end(), compareByOrder);
    return j;
}

bool SendData() {
    ola::DmxBuffer buffer1;
    ola::DmxBuffer buffer2;
    ola::DmxBuffer buffer3;
    ola::DmxBuffer buffer4;

    lock_guard<mutex> lg(door);
    for (auto &it : fixtures) {
        for (auto &fp : it.second.parameters) {
            setFrames(it.second.universe, it.second.address, fp.second.coarse, fp.second.fine, fp.second.getDMXValue());
        }
    }
    if (cuePlaying == true) {
        Cue &currentCueItem = cues[currentCue];
        for (auto &fi : currentCueItem.fixtures) {
            for (auto &pi : fi.second.parameters) {
                int outputValue = (pi.second.getDMXValue() + (((fixtures[fi.first].parameters[pi.first].getDMXValue() - pi.second.getDMXValue()) / (currentCueItem.progressTime * 40)) * currentCueItem.totalProgress));
                fixtures[fi.first].parameters[pi.first].displayValue = (outputValue / 65535.0) * 100.0;
                if (currentCueItem.totalProgress - 1 < 0) {
                    fixtures[fi.first].parameters[pi.first].liveValue = fixtures[fi.first].parameters[pi.first].displayValue;
                }
                setFrames(fixtures[fi.first].universe, fixtures[fi.first].address, pi.second.coarse, pi.second.fine, outputValue);
            }
        }
        currentCueItem.totalProgress -= 1;
        if (currentCueItem.totalProgress < 0) {
            cuePlaying = false;
        }

        json msg = {};
        msg["msgType"] = "fixtures";
        msg["fixtures"] = getFixtures();
        sendToAllMessage(msg.dump(), msg["msgType"]);
        msg = {};
        msg["msgType"] = "cues";
        msg["cues"] = getCues();
        sendToAllMessage(msg.dump(), msg["msgType"]);
    }
    door.unlock();

    buffer1.Blackout();
    buffer2.Blackout();
    buffer3.Blackout();
    buffer4.Blackout();
    for (int ii = 0; ii < 512; ii++) {
        buffer1.SetChannel(ii, frames[(0 * 512) + ii]);
        buffer2.SetChannel(ii, frames[(1 * 512) + ii]);
        buffer3.SetChannel(ii, frames[(2 * 512) + ii]);
        buffer4.SetChannel(ii, frames[(3 * 512) + ii]);
    }
    wrapper.GetClient()->SendDMX(1, buffer1, ola::client::SendDMXArgs());
    wrapper.GetClient()->SendDMX(2, buffer2, ola::client::SendDMXArgs());
    wrapper.GetClient()->SendDMX(3, buffer3, ola::client::SendDMXArgs());
    wrapper.GetClient()->SendDMX(4, buffer4, ola::client::SendDMXArgs());

    if (finished == 1) {
        wrapper.GetSelectServer()->Terminate();
    }

    return true;
}

void getFixtureProfiles() {
    json file;
    ifstream infile;
    string manName;
    string modeName;
    string modName;

    infile.open("fixtures/fixtureList.json");
    if (infile.fail() != true) {
        infile >> file;
        infile.close();

        fixtureProfiles = file;

        if (fs::exists("custom-fixtures")) {
            for (const auto &entry : fs::directory_iterator("custom-fixtures")) {
                infile.open(entry.path());
                if (infile.fail() == true) {
                    infile.close();
                    continue;
                }
                infile >> file;
                infile.close();
                for (auto &it : file["personalities"]) {
                    manName = it["manufacturerName"];
                    modeName = it["modelName"];
                    modName = it["modeName"];
                    fixtureProfiles[manName][modeName][modName] = {};
                    fixtureProfiles[manName][modeName][modName]["file"] = entry.path().filename();
                    fixtureProfiles[manName][modeName][modName]["dcid"] = it["dcid"];
                    fixtureProfiles[manName][modeName][modName]["modeName"] = modName;
                    fixtureProfiles[manName][modeName][modName]["channels"] = it["maxOffset"].get<int>() + 1;
                    fixtureProfiles[manName][modeName][modName]["manufacturerID"] = it["manufacturerID"];
                    fixtureProfiles[manName][modeName][modName]["deviceID"] = it["deviceID"];
                    fixtureProfiles[manName][modeName][modName]["custom"] = 1;
                }
            }
        }
    } else {
        infile.close();
    }
}

bool addFixture(int custom, string filename, string dcid, int universe, int address, int number, int isRDM) {
    json file;
    ifstream infile;
    bool conflicting = false;

    if (custom == 1) {
        infile.open("custom-fixtures/" + filename);
    } else {
        infile.open("fixtures/" + filename);
    }

    if (infile.fail() != true) {
        infile >> file;
        for (auto &it : file["personalities"]) {
            if (it["dcid"] == dcid) {
                for (int i = 0; i < number; i++) {
                    Fixture newFixture(it, universe, address, i);

                    if (newFixture.universe <= 4) {
                        for (auto &ui : users) {
                            newFixture.addUserBlind(ui.second->userID);
                        }

                        bool conflicts = false;
                        lock_guard<mutex> lg(door);
                        for (auto &fi : fixtures) {
                            if (newFixture.universe == fi.second.universe) {
                                if ((newFixture.address >= fi.second.address && newFixture.address <= fi.second.address + fi.second.maxOffset) || (newFixture.address + newFixture.maxOffset >= fi.second.address && newFixture.address + newFixture.maxOffset <= fi.second.address + fi.second.maxOffset) || (newFixture.address < fi.second.address && newFixture.address + newFixture.maxOffset > fi.second.address + fi.second.maxOffset)) {
                                    conflicts = true;
                                    conflicting = true;
                                }
                            }
                        }
                        if (conflicts == false) {
                            fixtures[newFixture.i] = newFixture;
                        }
                        door.unlock();
                    }
                }
            }
        }
    }
    infile.close();
    return conflicting;
}

void saveShow(string showName) {
    json j;
    lock_guard<mutex> lg(door);
    j["fixtures"] = getFixtures();
    j["groups"] = getGroups();
    j["cues"] = getCues();
    door.unlock();
    j["showName"] = showName;
    ofstream o;
    if (showName != "default") {
        o.open("shows/" + showName + ".tonalite");
        o << j;
        o.close();
    }
    o.open("default.tonalite");
    o << j;
    o.close();
}

void openShow() {
    std::ifstream i;
    bool exists = false;
    if (fs::exists("default.tonalite")) {
        i.open("default.tonalite");
        exists = true;
        json j;
        i >> j;
        lock_guard<mutex> lg(door);
        for (auto &fi : j["fixtures"]) {
            Fixture newFixture(fi, 0, 0, 0);
            fixtures[newFixture.i] = newFixture;
        }
        door.unlock();
    }
}

void RDMSearchCallback(const ola::client::Result &result, const ola::rdm::UIDSet &uids) {
    if (result.Success() == true) {
        ola::rdm::UIDSet::Iterator i;
        for (i = uids.Begin(); i != uids.End(); ++i) {
            for (auto &man : fixtureProfiles) {
                for (auto &mod : man) {
                    for (auto &mode : mod) {
                        if (mode["manufacturerID"] == (*i).ManufacturerId() && mode["deviceID"] == (*i).DeviceId()) {
                            addFixture(mode["custom"], mode["file"], mode["dcid"], 1, 1, 1, 1);  // Need to get universe and address
                        }
                    }
                }
            }
        }
    }
}

void processTask(json task) {
    if (task["msgType"] == "moveFixture") {
        lock_guard<mutex> lg(door);
        fixtures[task["i"]].x = task["x"];
        fixtures[task["i"]].y = task["y"];
        door.unlock();
        sendToAllExceptMessage(task.dump(), task["socketID"], task["msgType"]);
    } else if (task["msgType"] == "resizeFixture") {
        lock_guard<mutex> lg(door);
        fixtures[task["i"]].h = task["h"];
        fixtures[task["i"]].w = task["w"];
        door.unlock();
        sendToAllExceptMessage(task.dump(), task["socketID"], task["msgType"]);
    } else if (task["msgType"] == "getFixtureProfiles") {
        getFixtureProfiles();
        json item;
        item["msgType"] = "fixtureProfiles";
        item["profiles"] = fixtureProfiles;
        sendToMessage(item.dump(), task["socketID"], item["msgType"]);
    } else if (task["msgType"] == "addFixture") {
        addFixture(task["custom"], task["file"], task["dcid"], task["universe"], task["address"], task["number"], 0);
        json msg;
        msg["msgType"] = "fixtures";

        lock_guard<mutex> lg(door);
        msg["fixtures"] = getFixtures();
        door.unlock();

        sendToAllMessage(msg.dump(), msg["msgType"]);
    } else if (task["msgType"] == "removeFixtures") {
        json fixturesItem;
        json groupsItem;
        fixturesItem["msgType"] = "fixtures";
        groupsItem["msgType"] = "groups";

        lock_guard<mutex> lg(door);
        for (auto &id : task["fixtures"]) {
            if (fixtures.find(id) != fixtures.end()) {
                fixtures.erase(id);
            }
            vector<string> groupsToRemove;
            for (auto &gi : groups) {
                if (gi.second.removeFixture(id) == true) {
                    groupsToRemove.push_back(gi.first);
                }
            }
            // Remove any empty groups
            for (auto &gi : groupsToRemove) {
                if (groups.find(gi) != groups.end()) {
                    groups.erase(gi);
                }
            }
        }
        fixturesItem["fixtures"] = getFixtures();
        groupsItem["groups"] = getGroups();
        door.unlock();

        sendToAllMessage(fixturesItem.dump(), fixturesItem["msgType"]);
        sendToAllMessage(groupsItem.dump(), groupsItem["msgType"]);
    } else if (task["msgType"] == "editFixtureParameters") {
        json item;
        item["msgType"] = "fixtures";
        lock_guard<mutex> lg(door);
        for (auto &fi : task["fixtures"]) {
            for (auto &pi : task["parameters"]) {
                for (auto &p : fixtures[fi].parameters) {
                    if (p.second.coarse == pi["coarse"] && p.second.fine == pi["fine"] && p.second.type == pi["type"] && p.second.fadeWithIntensity == pi["fadeWithIntensity"] && p.second.home == pi["home"]) {
                        p.second.liveValue = pi["displayValue"];
                        p.second.displayValue = pi["displayValue"];
                        p.second.blindValues[task["socketID"]] = pi["blindValues"][task["socketID"].get<string>()];
                    }
                }
            }
        }
        item["fixtures"] = getFixtures();
        sendToAllExceptMessage(item.dump(), task["socketID"], item["msgType"]);
        door.unlock();
    } else if (task["msgType"] == "groupFixtures") {
        json item;
        item["msgType"] = "groups";

        Group newGroup(task);
        lock_guard<mutex> lg(door);
        groups[newGroup.i] = newGroup;
        item["groups"] = getGroups();
        door.unlock();

        sendToAllMessage(item.dump(), item["msgType"]);
    } else if (task["msgType"] == "removeGroups") {
        json item;
        item["msgType"] = "groups";

        lock_guard<mutex> lg(door);
        for (auto &id : task["groups"]) {
            if (groups.find(id) != groups.end()) {
                groups.erase(id);
            }
        }
        item["groups"] = getGroups();
        door.unlock();

        sendToAllMessage(item.dump(), item["msgType"]);
    } else if (task["msgType"] == "editGroups") {
        json item;
        item["msgType"] = "groups";

        lock_guard<mutex> lg(door);
        for (auto &id : task["groups"]) {
            if (groups.find(id) != groups.end()) {
                if (task["name"] != "Multiple") {
                    groups[id].name = task["name"];
                }
                if (task["fixturesChanged"] == true) {
                    groups[id].fixtures.clear();
                    for (auto &fi : task["fixtures"]) {
                        groups[id].fixtures.push_back(fi["id"]);
                    }
                }
            }
        }
        item["groups"] = getGroups();
        door.unlock();

        sendToAllMessage(item.dump(), item["msgType"]);
    } else if (task["msgType"] == "recordCue") {
        json item;
        item["msgType"] = "cues";
        Cue newCue;
        newCue.i = random_string(10);

        lock_guard<mutex> lg(door);
        newCue.name = "Cue " + to_string(cues.size() + 1);
        newCue.order = cues.size();
        if (cues.size() > 0) {
            for (auto &ci : cues) {
                if (ci.second.nextCue == "") {
                    newCue.lastCue = ci.first;
                    ci.second.nextCue = newCue.i;
                    break;
                }
            }
        }
        for (auto &fi : fixtures) {
            Fixture newCueFixture;
            newCueFixture.i = fi.first;
            bool addFixture = false;
            for (auto &pi : fi.second.parameters) {
                if (newCue.shouldChange(cues, fi.first, pi.second)) {
                    newCueFixture.parameters[pi.first] = pi.second;
                    addFixture = true;
                }
            }
            if (addFixture == true) {
                newCue.fixtures[newCueFixture.i] = newCueFixture;
            }
        }
        cues[newCue.i] = newCue;
        currentCue = newCue.i;
        item["cues"] = getCues();
        door.unlock();

        sendToAllMessage(item.dump(), item["msgType"]);
    } else if (task["msgType"] == "nextCue") {
        lock_guard<mutex> lg(door);
        if (currentCue == "" || cues[currentCue].nextCue == "") {
            for (auto &ci : cues) {
                if (ci.second.lastCue == "") {
                    currentCue = ci.first;
                    break;
                }
            }
        } else {
            currentCue = cues[currentCue].nextCue;
        }
        cues[currentCue].go();
        cuePlaying = true;
        door.unlock();
    } else if (task["msgType"] == "lastCue") {
        lock_guard<mutex> lg(door);
        if (currentCue == "" || cues[currentCue].lastCue == "") {
            for (auto &ci : cues) {
                if (ci.second.nextCue == "") {
                    currentCue = ci.first;
                    break;
                }
            }
        } else {
            currentCue = cues[currentCue].lastCue;
        }
        cues[currentCue].go();
        cuePlaying = true;
        door.unlock();
    } else if (task["msgType"] == "rdmSearch") {
        getFixtureProfiles();
        for (int i = 1; i <= 4; i++) {
            wrapper.GetClient()->RunDiscovery(i, ola::client::DISCOVERY_FULL, ola::NewSingleCallback(&RDMSearchCallback));
        }
    } else if (task["msgType"] == "saveShow") {
        saveShow("default");
    } else if (task["msgType"] == "updateFirmware") {
        auto s = base64::from_base64(task["data"]);
        ofstream newFile;
        newFile.open("firmware.zip", ios::out | ios::binary);
        newFile << s;
        newFile.close();
        Unzipper unzipper("firmware.zip");
        unzipper.extract();
        unzipper.close();
        char *argv[] = {"./run.sh", NULL};
        execvp(argv[0], argv);
    }
}

void messagesThread() {
    while (finished == 0) {
        lock_guard<mutex> lg(sendMessagesDoor);
        for (auto &tm : sendMessages) {
            if (tm.to == "all") {
                sendToAll(tm.content);
            } else if (tm.to == "allExcept") {
                sendToAllExcept(tm.content, tm.recipient);
            } else if (tm.to == "single") {
                sendTo(tm.content, tm.recipient);
            }
        }
        sendMessages.clear();
        sendMessagesDoor.unlock();
        this_thread::sleep_for(75ms);
    }
}

void webThread() {
    uWS::App().get("/*", [](auto *res, auto *req) {
            if (req->getUrl() == "/") {
                ifstream infile;
                infile.open("index.html");
                string str((istreambuf_iterator<char>(infile)), istreambuf_iterator<char>());
                res->writeHeader("Content-Type", "text/html; charset=utf-8")->end(str);
                infile.close();
            } else {
                string_view filename = req->getUrl();
                filename.remove_prefix(1);
                string s = {filename.begin(), filename.end()};
                ifstream infile;
                infile.open(s);
                if (infile.fail() == false) {
                    string str((istreambuf_iterator<char>(infile)), istreambuf_iterator<char>());
                    res->end(str);
                } else {
                    res->end("");
                }
                infile.close();
            }
        })
        .ws<PerSocketData>("/", {
            .compression = uWS::SHARED_COMPRESSOR,
            .maxPayloadLength = 1000 * 1000 * 1000,
            .open = [](auto *ws) {
                PerSocketData *psd = (PerSocketData *) ws->getUserData();
                psd->socketItem = ws;
                psd->userID = random_string(10);
                users[psd->userID] = psd;
                json j;
                lock_guard<mutex> lg(door);
                for (auto &fi : fixtures) {
                    fi.second.addUserBlind(psd->userID);
                }
                json fixtureItems = getFixtures();
                json groupItems = getGroups();
                json cueItems = getCues();
                door.unlock();
                j["msgType"] = "fixtures";
                j["fixtures"] = fixtureItems;
                ws->send(j.dump(), uWS::OpCode::TEXT, true);
                j = {};
                j["msgType"] = "groups";
                j["groups"] = groupItems;
                ws->send(j.dump(), uWS::OpCode::TEXT, true);
                j = {};
                j["msgType"] = "cues";
                j["cues"] = cueItems;
                ws->send(j.dump(), uWS::OpCode::TEXT, true);
                j = {};
                j["msgType"] = "socketID";
                j["socketID"] = psd->userID;
                ws->send(j.dump(), uWS::OpCode::TEXT, true);
            },
            .message = [](auto *ws, string_view message, uWS::OpCode opCode) {
                PerSocketData *psd = (PerSocketData *) ws->getUserData();
                json j = json::parse(message);
                j["socketID"] = psd->userID;
                processTask(j);
            },
            .close = [](auto *ws, int code, string_view message) {
                PerSocketData *psd = (PerSocketData *) ws->getUserData();
                lock_guard<mutex> lg(userDoor);
                users.erase(psd->userID);
                userDoor.unlock();
            }
        })
        .listen(8000, [](auto *listenSocket) {
            if (listenSocket) {
                cout << "Tonalite Lighting Control: Running on http://localhost:8000" << endl;
            }
        })
        .run();
}

int main() {
    finished = 0;

    fs::create_directory("shows");
    fs::create_directory("custom-fixtures");

    getFixtureProfiles();

    openShow();

    ola::InitLogging(ola::OLA_LOG_WARN, ola::OLA_LOG_STDERR);
    if (!wrapper.Setup()) {
        cerr << "Setup failed" << endl;
        exit(1);
    }

    thread webThreading(webThread);
    thread messagesThreading(messagesThread);

    ola::io::SelectServer *ss = wrapper.GetSelectServer();
    ss->RegisterRepeatingTimeout(25, ola::NewCallback(&SendData));
    ss->Run();
}