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
    cItem["order"] = order;
    cItem["nextCue"] = nextCue;
    cItem["lastCue"] = lastCue;
    cItem["fixtures"] = {};

    for (auto &it : fixtures) {
        cItem["fixtures"].push_back(it.second.asJson());
    }
    sort(cItem["fixtures"].begin(), cItem["fixtures"].end(), compareByAddress);

    return cItem;
};

bool Cue::shouldChange(unordered_map<string, Cue> &cues, string fixtureID, FixtureParameter &param) {
    bool result = false;
    if (lastCue != "") {
        result = cues[lastCue].shouldChange(cues, fixtureID, param);
    } else {
        if (fixtures.contains(fixtureID) && fixtures[fixtureID].parameters.contains(param.i)) {
            result = fixtures[fixtureID].parameters[param.i].liveValue != param.liveValue;
        } else {
            result = param.getDMXValue() != param.home;
        }
    }
    return result;
};

Cue::Cue(){};

Cue::Cue(json profile) {
    if (profile.contains("i") && profile["i"] != NULL) {
        i = profile["i"];
    } else {
        i = random_string(10);
    }

    if (profile.contains("name") && profile["name"] != NULL) {
        name = profile["name"];
    } else {
        name = "Cue";
    }
};
