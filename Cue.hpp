#ifndef CUE_HPP_INCLUDED
#define CUE_HPP_INCLUDED

#include <string>
#include <unordered_map>

#include "Fixture.hpp"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

struct Cue;

struct Cue {
    string i;
    string name;
    string lastCue = "";
    string nextCue = "";
    int order;
    int totalProgress = 0;
    double displayProgress = 100.0;
    double progressTime = 3.0;
    int playing = 0;
    unordered_map<string, SmallFixture> fixtures;

    Cue();
    Cue(json profile);
    Cue(unordered_map<string, Fixture> fixtureItems, bool blind, string userID);
    json asJson();
    void go();
};

#endif