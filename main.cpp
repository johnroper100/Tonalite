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
#include "json.hpp"
#include "App.h"

using namespace std;
using json = nlohmann::json;

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
    /* Fill with user data */
};

struct Fixture
{
    double value = 1.0;
    int universe = 1;
    int channel = 1;
    int fine = 1;

    int getDMXValue()
    {
        return ceil(65535.0 * value);
    }
};

atomic<int> finished;
mutex door;
unordered_map<string, Fixture> fixtures;

bool SendData(ola::client::OlaClientWrapper *wrapper)
{
    static uint8_t frames[6144] = {0};
    static ola::DmxBuffer buffer1;
    static ola::DmxBuffer buffer2;
    static ola::DmxBuffer buffer3;
    static ola::DmxBuffer buffer4;
    static ola::DmxBuffer buffer5;
    static ola::DmxBuffer buffer6;
    static ola::DmxBuffer buffer7;
    static ola::DmxBuffer buffer8;
    static ola::DmxBuffer buffer9;
    static ola::DmxBuffer buffer10;
    static ola::DmxBuffer buffer11;
    static ola::DmxBuffer buffer12;

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
    buffer5.Blackout();
    buffer6.Blackout();
    buffer7.Blackout();
    buffer8.Blackout();
    buffer9.Blackout();
    buffer10.Blackout();
    buffer11.Blackout();
    buffer12.Blackout();
    for (int ii = 0; ii < 512; ii++)
    {
        buffer1.SetChannel(ii, frames[(0 * 512) + ii]);
        buffer2.SetChannel(ii, frames[(1 * 512) + ii]);
        buffer3.SetChannel(ii, frames[(2 * 512) + ii]);
        buffer4.SetChannel(ii, frames[(3 * 512) + ii]);
        buffer5.SetChannel(ii, frames[(4 * 512) + ii]);
        buffer6.SetChannel(ii, frames[(5 * 512) + ii]);
        buffer7.SetChannel(ii, frames[(6 * 512) + ii]);
        buffer8.SetChannel(ii, frames[(7 * 512) + ii]);
        buffer9.SetChannel(ii, frames[(8 * 512) + ii]);
        buffer10.SetChannel(ii, frames[(9 * 512) + ii]);
        buffer11.SetChannel(ii, frames[(10 * 512) + ii]);
        buffer12.SetChannel(ii, frames[(11 * 512) + ii]);
    }
    wrapper->GetClient()->SendDMX(1, buffer1, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(2, buffer2, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(3, buffer3, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(4, buffer4, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(5, buffer5, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(6, buffer6, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(7, buffer7, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(8, buffer8, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(9, buffer9, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(10, buffer10, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(11, buffer11, ola::client::SendDMXArgs());
    wrapper->GetClient()->SendDMX(12, buffer12, ola::client::SendDMXArgs());

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
    }).ws<PerSocketData>("/*", {
        .open = [](auto *ws) {
            ws->subscribe("all");
            json j;
            j["fixtures"] = {};
            lock_guard<mutex> lg(door);
            for (auto &it : fixtures)
            {
                j["fixtures"].push_back({{"id", it.first}, {"value", it.second.value}});
            }
            door.unlock();
            ws->send(j.dump(), uWS::OpCode::TEXT, true);
        },
        .message = [](auto *ws, string_view message, uWS::OpCode opCode) {
            ws->send(message, opCode, true);
        }
    }).listen(8000, [](auto *listenSocket) {
        if (listenSocket) {
            cout << "Tonalite Lighting Control: Running on http://localhost:8000" << endl;
        }
    }).run();
}

int main()
{
    finished = 0;

    fixtures[random_string(5)] = Fixture();
    fixtures[random_string(5)] = Fixture();

    thread webThreading(webThread);

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