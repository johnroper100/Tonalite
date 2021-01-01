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
    unordered_map<string, Fixture> fixtures;

    Cue();
    Cue(json profile);
    json asJson();
    bool shouldChange(unordered_map<string, Cue> &cues, string fixtureID, FixtureParameter &param);
};

#endif