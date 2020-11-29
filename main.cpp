#include <ola/Callback.h>
#include <ola/DmxBuffer.h>
#include <ola/Logging.h>
#include <ola/client/ClientWrapper.h>
#include <ola/io/SelectServer.h>

#include <algorithm>
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

#include "App.h"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;
namespace fs = std::filesystem;

template <typename T>
class ThreadsafeQueue {
    queue<T> queue_;
    mutable mutex mutex_;

    // Moved out of public interface to prevent races between this
    // and pop().
    bool empty() const {
        return queue_.empty();
    }

   public:
    ThreadsafeQueue() = default;
    ThreadsafeQueue(const ThreadsafeQueue<T> &) = delete;
    ThreadsafeQueue &operator=(const ThreadsafeQueue<T> &) = delete;

    ThreadsafeQueue(ThreadsafeQueue<T> &&other) {
        lock_guard<mutex> lock(mutex_);
        queue_ = move(other.queue_);
    }

    virtual ~ThreadsafeQueue() {}

    unsigned long size() const {
        lock_guard<mutex> lock(mutex_);
        return queue_.size();
    }

    optional<T> pop() {
        lock_guard<mutex> lock(mutex_);
        if (queue_.empty()) {
            return {};
        }
        T tmp = queue_.front();
        queue_.pop();
        return tmp;
    }

    void push(const T &item) {
        lock_guard<mutex> lock(mutex_);
        queue_.push(item);
    }
};

string random_string(size_t length) {
    const string CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    random_device random_device;
    mt19937 generator(random_device());
    uniform_int_distribution<> distribution(0, CHARACTERS.size() - 1);

    string random_string;

    for (size_t i = 0; i < length; ++i) {
        random_string += CHARACTERS[distribution(generator)];
    }

    return random_string;
}

struct PerSocketData {
    uWS::WebSocket<0, 1> *socketItem;
    string userID;
};

struct FixtureParameter {
    int coarse = 0;
    int fine = -1;
    double value = 0.0;

    int getDMXValue() {
        return ceil(65535.0 * value);
    }
};

struct Fixture {
    int universe = 4;
    int address = 512;
    int x = 0;
    int y = 0;
    int w = 2;
    int h = 1;
    string name = "Source Four";
    unordered_map<string, FixtureParameter> parameters;
};

atomic<int> finished;
mutex door;
unordered_map<string, Fixture> fixtures;
unordered_map<string, PerSocketData *> users;
ThreadsafeQueue<json> tasks;
json fixtureProfiles;

uint8_t frames[2048] = {0};

bool SendData(ola::client::OlaClientWrapper *wrapper) {
    ola::DmxBuffer buffer1;
    ola::DmxBuffer buffer2;
    ola::DmxBuffer buffer3;
    ola::DmxBuffer buffer4;

    lock_guard<mutex> lg(door);
    for (auto &it : fixtures) {
        for (auto &fp : it.second.parameters) {
            frames[((it.second.universe - 1) * 512) + ((it.second.address - 1) + fp.second.coarse)] = fp.second.getDMXValue() >> 8;
            if (fp.second.fine != -1) {
                frames[((it.second.universe - 1) * 512) + ((it.second.address - 1) + fp.second.fine)] = fp.second.getDMXValue() & 0xff;
            }
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
    wrapper->GetClient()->SendDMX(1, buffer1, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(2, buffer2, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(3, buffer3, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(4, buffer4, ola::client::SendDMXArgs());

    if (finished == 1) {
        wrapper->GetSelectServer()->Terminate();
    }

    return true;
}

json getFixtures() {
    json j = {};
    json fItem;
    json pItem;
    lock_guard<mutex> lg(door);
    for (auto &it : fixtures) {
        fItem["i"] = it.first;
        fItem["universe"] = it.second.universe;
        fItem["address"] = it.second.address;
        fItem["name"] = it.second.name;
        fItem["parameters"] = {};
        fItem["x"] = it.second.x;
        fItem["y"] = it.second.y;
        fItem["w"] = it.second.w;
        fItem["h"] = it.second.h;
        for (auto &pi : it.second.parameters) {
            pItem["i"] = pi.first;
            pItem["value"] = pi.second.value;
            fItem["parameters"].push_back(pItem);
        }
        j.push_back(fItem);
    }
    door.unlock();
    return j;
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
                manName = file["personalities"][0]["manufacturerName"];
                modeName = file["personalities"][0]["modelName"];
                modName = file["personalities"][0]["modeName"];
                fixtureProfiles[manName][modeName][modName] = entry.path().filename();
            }
        }
    } else {
        infile.close();
    }
}

void sendToAllExcept(string content, string socketID) {
    for (auto &it : users) {
        if (it.first != socketID) {
            it.second->socketItem->send(content, uWS::OpCode::TEXT, true);
        }
    }
}

void sendTo(string content, string socketID) {
    users[socketID]->socketItem->send(content, uWS::OpCode::TEXT, true);
}

void tasksThread() {
    optional<json> tItem;
    json task;
    while (finished == 0) {
        tItem = tasks.pop();
        if (tItem) {
            task = *tItem;
            if (task["msgType"] == "moveFixture") {
                lock_guard<mutex> lg(door);
                fixtures[task["i"]].x = task["x"];
                fixtures[task["i"]].y = task["y"];
                door.unlock();
                sendToAllExcept(task.dump(), task["socketID"]);
            } else if (task["msgType"] == "resizeFixture") {
                lock_guard<mutex> lg(door);
                fixtures[task["i"]].h = task["h"];
                fixtures[task["i"]].w = task["w"];
                door.unlock();
                sendToAllExcept(task.dump(), task["socketID"]);
            } else if (task["msgType"] == "getFixtureProfiles") {
                getFixtureProfiles();
                json item;
                item["msgType"] = "fixtureProfiles";
                item["profiles"] = fixtureProfiles;
                sendTo(item.dump(), task["socketID"]);
            }
        }
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
        .ws<PerSocketData>("/*", {.open = [](auto *ws) {
            PerSocketData *psd = (PerSocketData *) ws->getUserData();
            psd->socketItem = ws;
            psd->userID = random_string(5);
            users[psd->userID] = psd;
            ws->subscribe("all");
            json j;
            j["msgType"] = "fixtures";
            j["fixtures"] = getFixtures();
            ws->send(j.dump(), uWS::OpCode::TEXT, true); }, .message = [](auto *ws, string_view message, uWS::OpCode opCode) {
            PerSocketData *psd = (PerSocketData *) ws->getUserData();
            json j = json::parse(message);
            j["socketID"] = psd->userID;
            tasks.push(j); }})
        .listen(8000, [](auto *listenSocket) {
            if (listenSocket) {
                cout << "Tonalite Lighting Control: Running on http://localhost:8000" << endl;
            }
        })
        .run();
}

int main() {
    finished = 0;

    getFixtureProfiles();

    Fixture newFixture;
    FixtureParameter newParameter;
    newFixture.parameters[random_string(5)] = newParameter;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;
    fixtures[random_string(5)] = newFixture;

    thread webThreading(webThread);
    thread tasksThreading(tasksThread);

    ola::InitLogging(ola::OLA_LOG_WARN, ola::OLA_LOG_STDERR);
    ola::client::OlaClientWrapper wrapper;
    if (!wrapper.Setup()) {
        cerr << "Setup failed" << endl;
        exit(1);
    }
    ola::io::SelectServer *ss = wrapper.GetSelectServer();
    ss->RegisterRepeatingTimeout(25, ola::NewCallback(&SendData, &wrapper));
    ss->Run();
}