#include "Group.hpp"

#include "Utilities.hpp"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

json Group::asJson() {
    json gItem;

    gItem["i"] = i;
    gItem["name"] = name;

    gItem["fixtures"] = {};
    for (auto &fi : fixtures) {
        gItem["fixtures"].push_back(fi);
    }
    return gItem;
};

Group::Group() {
}

Group::Group(json profile) {
    if (profile.contains("i")) {
        i = profile["i"];
    } else {
        i = random_string(10);
    }

    if (profile.contains("name")) {
        name = profile["name"];
    } else {
        name = "Group";
    }

    if (profile.contains("fixtures")) {
        for (auto &fi : profile["fixtures"]) {
            fixtures.push_back(fi);
        }
    }
}
