#include "Fixture.hpp"

#include <cmath>

#include "Utilities.hpp"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

int FixtureParameter::getDMXValue() {
    return ceil(65535.0 * value);
};

json Fixture::asJson() {
    json fItem;
    json pItem;
    fItem["i"] = i;
    fItem["name"] = name;
    fItem["universe"] = universe;
    fItem["address"] = address;
    fItem["x"] = x;
    fItem["y"] = y;
    fItem["w"] = w;
    fItem["h"] = h;

    fItem["hasIntensity"] = hasIntensity;
    fItem["manufacturerName"] = manufacturerName;
    fItem["maxOffset"] = maxOffset;
    fItem["modeName"] = modeName;
    fItem["modelName"] = modelName;
    fItem["parameters"] = {};
    for (auto &pi : parameters) {
        pItem["i"] = pi.first;
        pItem["value"] = pi.second.value;
        fItem["parameters"].push_back(pItem);
    }
    return fItem;
};

Fixture::Fixture() {
}

Fixture::Fixture(json profile, int universe, int address, int createIndex) {
    i = random_string(5);
    name = profile["modelName"];
    universe = universe;
    address = address + ((profile["maxOffset"].get<int>() + 1) * createIndex);

    hasIntensity = profile["hasIntensity"];
    manufacturerName = profile["manufacturerName"];
    maxOffset = profile["maxOffset"];
    modeName = profile["modeName"];
    modelName = profile["modelName"];
}