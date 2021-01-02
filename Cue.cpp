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

void Cue::go() {
    totalProgress = 40 * progressTime;
}

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
