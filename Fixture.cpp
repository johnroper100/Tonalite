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
    i = random_string(10);
    name = profile["modelName"];
    universe = universe;
    address = address + ((profile["maxOffset"].get<int>() + 1) * createIndex);

    hasIntensity = profile["hasIntensity"];
    manufacturerName = profile["manufacturerName"];
    maxOffset = profile["maxOffset"];
    modeName = profile["modeName"];
    modelName = profile["modelName"];

    for (auto &pi : profile["parameters"]) {
        FixtureParameter newParam;
        newParam.i = random_string(10);

        newParam.coarse = pi["coarse"];
        if (pi.contains("fine")) {
            newParam.fine = pi["fine"];
        }
        newParam.fadeWithIntensity = pi["fadeWithIntensity"];
        newParam.highlight = pi["highlight"];
        newParam.home = pi["home"];
        newParam.invert = pi["invert"];
        newParam.name = pi["name"];
        newParam.size = pi["size"];
        newParam.type = pi["type"];

        parameters[newParam.i] = newParam;
    }
}