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
        Fixture newFixture(it, 0, 0, 0);
        fixtures[newFixture.i] = newFixture;
    }
};
