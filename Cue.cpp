#include "Cue.hpp"

#include <string>
#include <unordered_map>

#include "Fixture.hpp"
#include "Utilities.hpp"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

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

    for (auto &it : fixtures) {
        cItem["fixtures"].push_back(it.second.asJson());
    }
    sort(cItem["fixtures"].begin(), cItem["fixtures"].end(), compareByAddress);

    return cItem;
};

void Cue::go() {
    totalProgress = 40 * progressTime;
}

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

Cue::Cue(unordered_map<string, Fixture> fixtureItems, bool blind, string userID) {
    for (auto &fi : fixtureItems) {
        SmallFixture newFixture;
        newFixture.i = fi.first;
        newFixture.parameters = fi.second.parameters;
        /*if (blind == true) {
            for (auto &pi : newFixture.parameters) {
                pi.second.manualValue = pi.second.blindManualValues.at(userID);
            }
        }*/
        fixtures[newFixture.i] = newFixture;
    }
}
