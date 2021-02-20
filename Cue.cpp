#include "Cue.hpp"

#include <string>
#include <unordered_map>

#include "Fixture.hpp"
#include "Utilities.hpp"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

Cue::Cue(){};

Cue::Cue(json profile) {
    i = profile["i"];
    name = profile["name"];
    lastCue = profile["lastCue"];
    nextCue = profile["nextCue"];
    order = profile["order"];
    totalProgress = profile["totalProgress"];
    displayProgress = profile["displayProgress"];
    progressTime = profile["progressTime"];
    for (auto &it : profile["fixtures"]) {
        SmallFixture newFixture(it);
        fixtures[newFixture.i] = newFixture;
    }
};

Cue::Cue(unordered_map<string, Fixture> &fixtureItems, bool blind, string userID) {
    i = random_string(10);
    for (auto &fi : fixtureItems) {
        bool needsAdd = false;
        SmallFixture newFixture;
        newFixture.i = fi.first;
        /*newFixture.parameters = fi.second.parameters;*/
        for (auto &pi : fi.second.parameters) {
            if (pi.second.value.manualInput == 1) {
                pi.second.value.cueOutputValue = pi.second.value.manualValue;
                pi.second.value.controllingCue = i;
                pi.second.value.manualInput = 0;
                FixtureParameter newParameterCopy = pi.second;
                newFixture.parameters[newParameterCopy.i] = newParameterCopy;
                needsAdd = true;
            }
        }
        /*if (blind == true) {
            for (auto &pi : newFixture.parameters) {
                pi.second.manualValue = pi.second.blindManualValues.at(userID);
            }
        }*/
        if (needsAdd == true) {
            fixtures[newFixture.i] = newFixture;
        }
    }
};

void Cue::go() {
    totalProgress = 40 * progressTime;
    playing = 1;
    onlyTargeted = 0;
};

void Cue::goTarget() {
    totalProgress = 40 * progressTime;
    playing = 1;
    onlyTargeted = 1;
};

json Cue::asJson() {
    json cItem;

    cItem["i"] = i;
    cItem["name"] = name;
    cItem["nextCue"] = nextCue;
    cItem["lastCue"] = lastCue;
    cItem["order"] = order;
    cItem["totalProgress"] = totalProgress;
    cItem["displayProgress"] = displayProgress;
    cItem["progressTime"] = progressTime;
    cItem["fixtures"] = {};

    /*for (auto &it : fixtures) {
        cItem["fixtures"].push_back(it.second.asJson());
    }*/
    sort(cItem["fixtures"].begin(), cItem["fixtures"].end(), compareByAddress);

    return cItem;
};