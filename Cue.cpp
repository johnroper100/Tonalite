#include "Cue.hpp"

#include "Utilities.hpp"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

json Cue::asJson() {
    json cItem;

    cItem["i"] = i;
    cItem["name"] = name;
    cItem["order"] = order;

    return cItem;
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
