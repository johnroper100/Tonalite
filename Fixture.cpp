#include "Fixture.hpp"

#include <cmath>
#include <iostream>

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
        pItem["coarse"] = pi.second.coarse;
        pItem["fine"] = pi.second.fine;
        pItem["fadeWithIntensity"] = pi.second.fadeWithIntensity;
        pItem["highlight"] = pi.second.highlight;
        pItem["home"] = pi.second.home;
        pItem["invert"] = pi.second.invert;
        pItem["name"] = pi.second.name;
        pItem["size"] = pi.second.size;
        pItem["type"] = pi.second.type;
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

    if (profile.contains("colortable")) {
        colortable = profile["colortable"];
    }
    dcid = profile["dcid"];
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
        if (pi.contains("white")) {
            newParam.white.val = pi["white"]["val"];
            newParam.white.temp = pi["white"]["temp"];
        }
        if (pi.contains("ranges")) {
            for (auto &ri : pi["ranges"]) {
                FixtureParameterRange newRange;
                newRange.i = random_string(10);
                newRange.beginVal = ri["begin"];
                newRange.defaultVal = ri["default"];
                newRange.endVal = ri["end"];
                newRange.label = ri["label"];
                if (ri.contains("media")) {
                    newRange.media.dcid = ri["media"]["dcid"];
                    newRange.media.name = ri["media"]["name"];
                }
                newParam.ranges[newRange.i] = newRange;
            }
        }

        parameters[newParam.i] = newParam;
    }
}