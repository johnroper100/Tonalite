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
        users.at(socketID)->socketItem->send(content, uWS::OpCode::TEXT, true);
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

void recalculateOutputValues(int animate) {
    for (auto &it : fixtures) {
        if (it.second.hasIntensity == false) {
            it.second.intensityParam.resetOutputValue();
        }
        for (auto &fp : it.second.parameters) {
            fp.second.resetOutputValue();
        }
    }
    /*if (cuePlaying == true) {
        Cue &currentCueItem = cues.at(currentCue);
        for (auto &fi : currentCueItem.fixtures) {
            for (auto &pi : fi.second.parameters) {
                if (currentCueItem.lastCue == "" || cues.at(currentCueItem.lastCue).fixtures.at(fi.first).parameters.at(pi.first).liveValue != pi.second.liveValue) {
                    int outputValue = (pi.second.getDMXValue() + (((fixtures.at(fi.first).parameters.at(pi.first).getDMXValue() - pi.second.getDMXValue()) / (currentCueItem.progressTime * 40.0)) * currentCueItem.totalProgress));
                    fixtures.at(fi.first).parameters.at(pi.first).displayValue = (outputValue / 65535.0) * 100.0;
                    if (currentCueItem.totalProgress - 1 < 0) {
                        fixtures.at(fi.first).parameters.at(pi.first).liveValue = fixtures.at(fi.first).parameters.at(pi.first).displayValue;
                    }
                    setFrames(fixtures.at(fi.first).universe, fixtures.at(fi.first).address, pi.second.coarse, pi.second.fine, outputValue);
                }
            }
        }
        currentCueItem.displayProgress = (((currentCueItem.progressTime * 40.0) - currentCueItem.totalProgress) / (currentCueItem.progressTime * 40.0)) * 100.0;
        currentCueItem.displayProgress = ceil(currentCueItem.displayProgress);
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
        msg = {};
        msg["msgType"] = "currentCue";
        msg["currentCue"] = currentCue;
        msg["cuePlaying"] = cuePlaying;
        sendToAllMessage(msg.dump(), msg["msgType"]);
    }*/
    for (auto &it : fixtures) {
        if (it.second.hasIntensity == false) {
            it.second.intensityParam.calculateManAndSneak(animate);
        }

        // Non-main-intensity params
        for (auto &fp : it.second.parameters) {
            fp.second.calculateManAndSneak(animate);
            if (it.second.hasIntensity == false) {
                fp.second.value.modifiedOutputValue = fp.second.value.outputValue * it.second.intensityParam.value.outputValue;
            } else {
                 fp.second.value.modifiedOutputValue = fp.second.value.outputValue;
            }
            for (auto &ui: fp.second.blindManualValues) {
                if (it.second.hasIntensity == false) {
                    ui.second.modifiedOutputValue = ui.second.outputValue * it.second.intensityParam.blindManualValues.at(ui.first).outputValue;
                } else {
                    ui.second.modifiedOutputValue = ui.second.outputValue;
                }
            }
        }
    }
    json msg = {};
    msg["msgType"] = "fixtures";
    msg["fixtures"] = getFixtures();
    sendToAllMessage(msg.dump(), msg["msgType"]);
};

bool SendData() {
    ola::DmxBuffer buffer1;
    ola::DmxBuffer buffer2;
    ola::DmxBuffer buffer3;
    ola::DmxBuffer buffer4;
    int shouldUpdate = 0;

    lock_guard<mutex> lg(door);
    for (auto &it : fixtures) {
        if (it.second.hasIntensity == false) {
            if (it.second.intensityParam.value.sneak == 1) {
                shouldUpdate = 1;
            }
            for (auto &ui: it.second.intensityParam.blindManualValues) {
                if (ui.second.sneak == 1) {
                    shouldUpdate = 1;
                }
            }
        }
        for (auto &fp : it.second.parameters) {
            if (fp.second.value.sneak == 1) {
                shouldUpdate = 1;
            }
            for (auto &ui: fp.second.blindManualValues) {
                if (ui.second.sneak == 1) {
                    shouldUpdate = 1;
                }
            }
        }
    }
    if (shouldUpdate == 1) {
        recalculateOutputValues(1);
    }
    for (auto &it : fixtures) {
        for (auto &fp : it.second.parameters) {
            setFrames(it.second.universe, it.second.address, fp.second.coarse, fp.second.fine, fp.second.getDMXValue());   
        }
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
        for (auto &gi : j["groups"]) {
            Group newGroup(gi);
            groups[newGroup.i] = newGroup;
        }
        for (auto &ci : j["cues"]) {
            Cue newCue(ci);
            cues[newCue.i] = newCue;
        }
        recalculateOutputValues(0);
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
        fixtures.at(task["i"]).x = task["x"];
        fixtures.at(task["i"]).y = task["y"];
        door.unlock();
        sendToAllExceptMessage(task.dump(), task["socketID"], task["msgType"]);
    } else if (task["msgType"] == "resizeFixture") {
        lock_guard<mutex> lg(door);
        fixtures.at(task["i"]).h = task["h"];
        fixtures.at(task["i"]).w = task["w"];
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
        lock_guard<mutex> lg(door);
        recalculateOutputValues(0);
        door.unlock();
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
        lock_guard<mutex> lg(door);
        for (auto &fi : task["fixtures"]) {
            if (task["parameter"]["type"] != 1 || (task["parameter"]["type"] == 1 && fixtures.at(fi).hasIntensity == true)) {
                for (auto &p : fixtures.at(fi).parameters) {
                    if (p.second.size == task["parameter"]["size"] && p.second.type == task["parameter"]["type"] && p.second.fadeWithIntensity == task["parameter"]["fadeWithIntensity"] && p.second.name == task["parameter"]["name"]) {
                        if (task["blind"] == false) {
                            p.second.value.manualValue = task["parameter"]["value"]["outputValue"];
                            p.second.value.manualInput = 1;
                            p.second.value.sneak = 0;
                            p.second.value.manualUser = task["socketID"];
                        } else {
                            p.second.blindManualValues.at(task["socketID"]).manualValue = task["parameter"]["blindManualValues"][task["socketID"].get<string>()]["outputValue"];
                            p.second.blindManualValues.at(task["socketID"]).manualInput = 1;
                            p.second.blindManualValues.at(task["socketID"]).sneak = 0;
                            p.second.blindManualValues.at(task["socketID"]).manualUser = task["socketID"];
                        }
                    }
                }
            } else if (task["parameter"]["type"] == 1) {
                if (task["blind"] == false) {
                    fixtures.at(fi).intensityParam.value.manualValue = task["parameter"]["value"]["outputValue"];
                    fixtures.at(fi).intensityParam.value.manualInput = 1;
                    fixtures.at(fi).intensityParam.value.sneak = 0;
                    fixtures.at(fi).intensityParam.value.manualUser = task["socketID"];
                } else {
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).manualValue = task["parameter"]["blindManualValues"][task["socketID"].get<string>()]["outputValue"];
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).manualInput = 1;
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).sneak = 0;
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).manualUser = task["socketID"];
                }
            }
        }
        recalculateOutputValues(0);
        door.unlock();
    } else if (task["msgType"] == "sneak") {
        lock_guard<mutex> lg(door);
        for (auto &fi: fixtures) {
            if (fi.second.hasIntensity == false && (task["mode"] == -1 || task["mode"] == 1)) {
                if (task["blind"] == false) {
                    if (fi.second.intensityParam.value.manualUser == task["socketID"] || (users.find(fi.second.intensityParam.value.manualUser) == users.end())) {
                        fi.second.intensityParam.startSneak(3.0, "");
                    }
                } else {
                    fi.second.intensityParam.startSneak(3.0, task["socketID"]);
                }
            }
            for (auto &pi: fi.second.parameters) {
                if (task["mode"] == -1 || task["mode"] == pi.second.type) {
                    if (task["blind"] == false) {
                        if (pi.second.value.manualUser == task["socketID"] || (users.find(pi.second.value.manualUser) == users.end())) {
                            pi.second.startSneak(3.0, "");
                        }
                    } else {
                        pi.second.startSneak(3.0, task["socketID"]);
                    }
                }
            }
        }
        door.unlock();
    } else if (task["msgType"] == "fixturesFull") {
        lock_guard<mutex> lg(door);
        for (auto &fi : task["fixtures"]) {
            if (fixtures.at(fi).hasIntensity == 1) {
                for (auto &p : fixtures.at(fi).parameters) {
                    if (p.second.type == 1) {
                        if (task["blind"] == false) {
                            p.second.value.manualValue = 100.0;
                            p.second.value.manualInput = 1;
                            p.second.value.sneak = 0;
                            p.second.value.manualUser = task["socketID"];
                        } else {
                            p.second.blindManualValues.at(task["socketID"]).manualValue = 100.0;
                            p.second.blindManualValues.at(task["socketID"]).manualInput = 1;
                            p.second.blindManualValues.at(task["socketID"]).sneak = 0;
                            p.second.blindManualValues.at(task["socketID"]).manualUser = task["socketID"];
                        }
                    }
                }
            } else {
                if (task["blind"] == false) {
                    fixtures.at(fi).intensityParam.value.manualValue = 100.0;
                    fixtures.at(fi).intensityParam.value.manualInput = 1;
                    fixtures.at(fi).intensityParam.value.sneak = 0;
                    fixtures.at(fi).intensityParam.value.manualUser = task["socketID"];
                } else {
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).manualValue = 100.0;
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).manualInput = 1;
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).sneak = 0;
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).manualUser = task["socketID"];
                }
            }
        }
        recalculateOutputValues(0);
        door.unlock();
    } else if (task["msgType"] == "fixturesOut") {
        lock_guard<mutex> lg(door);
        for (auto &fi : task["fixtures"]) {
            if (fixtures.at(fi).hasIntensity == 1) {
                for (auto &p : fixtures.at(fi).parameters) {
                    if (p.second.type == 1) {
                        if (task["blind"] == false) {
                            p.second.value.manualValue = 0.0;
                            p.second.value.manualInput = 1;
                            p.second.value.sneak = 0;
                            p.second.value.manualUser = task["socketID"];
                        } else {
                            p.second.blindManualValues.at(task["socketID"]).manualValue = 0.0;
                            p.second.blindManualValues.at(task["socketID"]).manualInput = 1;
                            p.second.blindManualValues.at(task["socketID"]).sneak = 0;
                            p.second.blindManualValues.at(task["socketID"]).manualUser = task["socketID"];
                        }
                    }
                }
            } else {
                if (task["blind"] == false) {
                    fixtures.at(fi).intensityParam.value.manualValue = 0.0;
                    fixtures.at(fi).intensityParam.value.manualInput = 1;
                    fixtures.at(fi).intensityParam.value.sneak = 0;
                    fixtures.at(fi).intensityParam.value.manualUser = task["socketID"];
                } else {
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).manualValue = 0.0;
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).manualInput = 1;
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).sneak = 0;
                    fixtures.at(fi).intensityParam.blindManualValues.at(task["socketID"]).manualUser = task["socketID"];
                }
            }
        }
        recalculateOutputValues(0);
        door.unlock();
    } else if (task["msgType"] == "fixturesHome") {
        lock_guard<mutex> lg(door);
        for (auto &fi : task["fixtures"]) {
            for (auto &p : fixtures.at(fi).parameters) {
                if (p.second.type != 1) {
                    if (task["blind"] == false) {
                        p.second.value.manualInput = 0;
                        p.second.value.sneak = 0;
                    } else {
                        p.second.blindManualValues.at(task["socketID"]).manualInput = 0;
                        p.second.blindManualValues.at(task["socketID"]).sneak = 0;
                    }
                }
            }
        }
        recalculateOutputValues(0);
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
                    groups.at(id).name = task["name"];
                }
                if (task["fixturesChanged"] == true) {
                    groups.at(id).fixtures.clear();
                    for (auto &fi : task["fixtures"]) {
                        groups.at(id).fixtures.push_back(fi["id"]);
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

        lock_guard<mutex> lg(door);
        Cue newCue(fixtures, task["blind"], task["socketID"]);
        newCue.i = random_string(10);
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
        cues[newCue.i] = newCue;
        currentCue = newCue.i;
        item["cues"] = getCues();
        door.unlock();
        sendToAllMessage(item.dump(), item["msgType"]);
        item = {};
        item["msgType"] = "currentCue";
        item["currentCue"] = newCue.i;
        item["cuePlaying"] = cuePlaying;
        sendToAllMessage(item.dump(), item["msgType"]);
    } else if (task["msgType"] == "nextCue") {
        json item;
        item["msgType"] = "currentCue";
        lock_guard<mutex> lg(door);
        if (currentCue == "" || cues.at(currentCue).nextCue == "") {
            for (auto &ci : cues) {
                if (ci.second.lastCue == "") {
                    currentCue = ci.first;
                    break;
                }
            }
        } else {
            currentCue = cues.at(currentCue).nextCue;
        }
        cues.at(currentCue).go();
        cuePlaying = true;
        item["currentCue"] = currentCue;
        item["cuePlaying"] = cuePlaying;
        door.unlock();
        sendToAllMessage(item.dump(), item["msgType"]);
    } else if (task["msgType"] == "lastCue") {
        json item;
        item["msgType"] = "currentCue";
        lock_guard<mutex> lg(door);
        if (currentCue == "" || cues.at(currentCue).lastCue == "") {
            for (auto &ci : cues) {
                if (ci.second.nextCue == "") {
                    currentCue = ci.first;
                    break;
                }
            }
        } else {
            currentCue = cues.at(currentCue).lastCue;
        }
        cues.at(currentCue).go();
        cuePlaying = true;
        item["currentCue"] = currentCue;
        item["cuePlaying"] = cuePlaying;
        door.unlock();
        sendToAllMessage(item.dump(), item["msgType"]);
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
                j["msgType"] = "currentCue";

                lock_guard<mutex> lg(door);
                for (auto &fi : fixtures) {
                    fi.second.addUserBlind(psd->userID);
                }
                json fixtureItems = getFixtures();
                json groupItems = getGroups();
                json cueItems = getCues();
                
                j["currentCue"] = currentCue;
                j["cuePlaying"] = cuePlaying;
                door.unlock();
                ws->send(j.dump(), uWS::OpCode::TEXT, true);

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
                for (auto &fi : fixtures) {
                    fi.second.removeUserBlind(psd->userID);
                }
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