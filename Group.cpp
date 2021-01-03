#include "Group.hpp"

#include <algorithm>

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

Group::Group(){};

Group::Group(json profile) {
    if (profile.contains("i") && profile["i"] != nullptr) {
        i = profile["i"];
    } else {
        i = random_string(10);
    }

    if (profile.contains("name") && profile["name"] != nullptr) {
        name = profile["name"];
    } else {
        name = "Group";
    }

    if (profile.contains("fixtures") && profile["fixtures"] != nullptr) {
        for (auto &fi : profile["fixtures"]) {
            fixtures.push_back(fi);
        }
    }
};

bool Group::removeFixture(string fixtureID) {
    auto itr = std::find(fixtures.begin(), fixtures.end(), fixtureID);
    if (itr != fixtures.end()) {
        fixtures.erase(itr);
    }
    return fixtures.empty();
};
