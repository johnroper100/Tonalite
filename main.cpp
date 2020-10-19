#include <iostream>
#include <ola/DmxBuffer.h>
#include <ola/io/SelectServer.h>
#include <ola/Logging.h>
#include <ola/client/ClientWrapper.h>
#include <ola/Callback.h>
#include <mutex>
#include <unordered_map>
#include <atomic>
#include <cmath>
#include <thread>
#include <fstream>
#include <streambuf>
#include <string>
#include <string_view>
#include <random>
#include <queue>
#include "json.hpp"
#include "App.h"

using namespace std;
using json = nlohmann::json;

template <typename T>
class ThreadsafeQueue
{
    queue<T> queue_;
    mutable mutex mutex_;

    // Moved out of public interface to prevent races between this
    // and pop().
    bool empty() const
    {
        return queue_.empty();
    }

public:
    ThreadsafeQueue() = default;
    ThreadsafeQueue(const ThreadsafeQueue<T> &) = delete;
    ThreadsafeQueue &operator=(const ThreadsafeQueue<T> &) = delete;

    ThreadsafeQueue(ThreadsafeQueue<T> &&other)
    {
        lock_guard<mutex> lock(mutex_);
        queue_ = move(other.queue_);
    }

    virtual ~ThreadsafeQueue() {}

    unsigned long size() const
    {
        lock_guard<mutex> lock(mutex_);
        return queue_.size();
    }

    optional<T> pop()
    {
        lock_guard<mutex> lock(mutex_);
        if (queue_.empty())
        {
            return {};
        }
        T tmp = queue_.front();
        queue_.pop();
        return tmp;
    }

    void push(const T &item)
    {
        lock_guard<mutex> lock(mutex_);
        queue_.push(item);
    }
};

string random_string(size_t length)
{
    const string CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    random_device random_device;
    mt19937 generator(random_device());
    uniform_int_distribution<> distribution(0, CHARACTERS.size() - 1);

    string random_string;

    for (size_t i = 0; i < length; ++i)
    {
        random_string += CHARACTERS[distribution(generator)];
    }

    return random_string;
}

struct PerSocketData
{
    uWS::WebSocket<0, 1> *socketItem;
    string userID;
};

struct Fixture
{
    double value = 0.0;
    int universe = 1;
    int channel = 1;
    int fine = 0;

    int getDMXValue()
    {
        return ceil(65535.0 * value);
    }
};

atomic<int> finished;
mutex door;
unordered_map<string, Fixture> fixtures;
unordered_map<string, PerSocketData *> users;
ThreadsafeQueue<json> tasks;

uint8_t frames[2048] = {0};

bool SendData(ola::client::OlaClientWrapper *wrapper)
{
    ola::DmxBuffer buffer1;
    ola::DmxBuffer buffer2;
    ola::DmxBuffer buffer3;
    ola::DmxBuffer buffer4;

    lock_guard<mutex> lg(door);
    for (auto &it : fixtures)
    {
        frames[((it.second.universe - 1) * 512) + (it.second.channel - 1)] = it.second.getDMXValue() >> 8;
        if (it.second.fine == 1)
        {
            frames[((it.second.universe - 1) * 512) + (it.second.channel)] = it.second.getDMXValue() & 0xff;
        }
    }
    door.unlock();

    buffer1.Blackout();
    buffer2.Blackout();
    buffer3.Blackout();
    buffer4.Blackout();
    for (int ii = 0; ii < 512; ii++)
    {
        buffer1.SetChannel(ii, frames[(0 * 512) + ii]);
        buffer2.SetChannel(ii, frames[(1 * 512) + ii]);
        buffer3.SetChannel(ii, frames[(2 * 512) + ii]);
        buffer4.SetChannel(ii, frames[(3 * 512) + ii]);
    }
    wrapper->GetClient()->SendDMX(1, buffer1, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(2, buffer2, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(3, buffer3, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(4, buffer4, ola::client::SendDMXArgs());

    if (finished == 1)
    {
        wrapper->GetSelectServer()->Terminate();
    }

    return true;
}

void webThread()
{
    uWS::App().get("/*", [](auto *res, auto *req) {
                  ifstream infile;
                  infile.open("index.html");
                  string str((istreambuf_iterator<char>(infile)), istreambuf_iterator<char>());
                  res->writeHeader("Content-Type", "text/html; charset=utf-8")->end(str);
              })
        .ws<PerSocketData>("/*", {.open = [](auto *ws) {
            PerSocketData *psd = (PerSocketData *) ws->getUserData();
            psd->socketItem = ws;
            psd->userID = random_string(5);
            users[psd->userID] = psd;
            ws->subscribe("all");
            json j;
            j["fixtures"] = {};
            j["msgType"] = "fixtures";
            lock_guard<mutex> lg(door);
            for (auto &it : fixtures)
            {
                j["fixtures"].push_back({{"id", it.first}, {"value", it.second.value}});
            }
            door.unlock();
            ws->send(j.dump(), uWS::OpCode::TEXT, true); }, .message = [](auto *ws, string_view message, uWS::OpCode opCode) {
            PerSocketData *psd = (PerSocketData *) ws->getUserData();
            json j = json::parse(message);
            j["socketID"] = psd->userID;
            tasks.push(j); }})
        .listen(8000, [](auto *listenSocket) {
            if (listenSocket)
            {
                cout << "Tonalite Lighting Control: Running on http://localhost:8000" << endl;
            }
        })
        .run();
}

void sendToAllExcept(string content, string socketID)
{
    for (auto &it : users)
    {
        if (it.second->userID != socketID)
        {
            it.second->socketItem->send(content, uWS::OpCode::TEXT, true);
        }
    }
}

void tasksThread()
{
    optional<json> tItem;
    json task;
    while (finished == 0)
    {
        tItem = tasks.pop();
        if (tItem)
        {
            task = *tItem;
            sendToAllExcept("hi", task["socketID"]);
            if (task["msgType"] == "fixtureValue")
            {
                lock_guard<mutex> lg(door);
                fixtures[task["id"]].value = task["value"];
                door.unlock();
            }
        }
    }
}

int main()
{
    finished = 0;

    Fixture newFixture;

    newFixture.channel = 1;
    fixtures[random_string(5)] = newFixture;
    newFixture.channel = 2;
    fixtures[random_string(5)] = newFixture;

    thread webThreading(webThread);
    thread tasksThreading(tasksThread);

    ola::InitLogging(ola::OLA_LOG_WARN, ola::OLA_LOG_STDERR);
    ola::client::OlaClientWrapper wrapper;
    if (!wrapper.Setup())
    {
        cerr << "Setup failed" << endl;
        exit(1);
    }
    ola::io::SelectServer *ss = wrapper.GetSelectServer();
    ss->RegisterRepeatingTimeout(25, ola::NewCallback(&SendData, &wrapper));
    ss->Run();
}