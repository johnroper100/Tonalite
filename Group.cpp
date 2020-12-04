#include "Group.hpp"

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
