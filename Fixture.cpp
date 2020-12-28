#include "Fixture.hpp"

#include <cmath>
#include <iostream>

#include "Utilities.hpp"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

int FixtureParameter::getDMXValue() {
    return ceil(65535.0 * (liveValue / 100.0));
};

int FixtureParameter::getDMXValue(string userID) {
    return ceil(65535.0 * (blindValues[userID] / 100.0));
};

json FixtureParameter::asJson() {
    json pItem;
    json rItem;

    pItem["i"] = i;
    pItem["coarse"] = coarse;
    pItem["fine"] = fine;
    pItem["fadeWithIntensity"] = fadeWithIntensity;
    pItem["highlight"] = highlight;
    pItem["home"] = home;
    pItem["invert"] = invert;
    pItem["name"] = name;
    pItem["size"] = size;
    pItem["type"] = type;
    pItem["ranges"] = {};
    for (auto &ri : ranges) {
        rItem["i"] = ri.second.i;
        rItem["begin"] = ri.second.beginVal;
        rItem["default"] = ri.second.defaultVal;
        rItem["end"] = ri.second.endVal;
        rItem["label"] = ri.second.label;
        rItem["media"] = {};
        rItem["media"]["dcid"] = ri.second.media.dcid;
        rItem["media"]["name"] = ri.second.media.name;
        pItem["ranges"].push_back(rItem);
    }
    pItem["white"] = {};
    pItem["white"]["val"] = white.val;
    pItem["white"]["temp"] = white.temp;

    pItem["liveValue"] = liveValue;
    pItem["blindValues"] = {};
    for (auto &ri : blindValues) {
        pItem["blindValues"][ri.first] = ri.second;
    }
    return pItem;
};

json Fixture::asJson() {
    json fItem;
    json pItem;
    json rItem;

    fItem["i"] = i;
    fItem["name"] = name;
    fItem["universe"] = universe;
    fItem["address"] = address;
    fItem["x"] = x;
    fItem["y"] = y;
    fItem["w"] = w;
    fItem["h"] = h;

    fItem["colortable"] = colortable;
    fItem["dcid"] = dcid;
    fItem["hasIntensity"] = hasIntensity;
    fItem["manufacturerName"] = manufacturerName;
    fItem["maxOffset"] = maxOffset;
    fItem["modeName"] = modeName;
    fItem["modelName"] = modelName;
    fItem["parameters"] = {};
    for (auto &pi : parameters) {
        fItem["parameters"].push_back(pi.second.asJson());
    }
    return fItem;
};

void Fixture::addUserBlind(string socketID) {
    for (auto &pi : parameters) {
        pi.second.blindValues[socketID] = pi.second.liveValue;
    }
}

Fixture::Fixture() {
}

Fixture::Fixture(json profile, int inputUniverse, int inputAddress, int createIndex) {
    if (profile.contains("i") && profile["i"] != NULL) {
        i = profile["i"];
    } else {
        i = random_string(10);
    }

    if (profile.contains("name") && profile["name"] != NULL) {
        name = profile["name"];
    } else {
        name = profile["modelName"];
    }

    if (profile.contains("universe") && profile["universe"] != NULL) {
        universe = profile["universe"];
    } else {
        universe = inputUniverse;
    }

    if (profile.contains("address") && profile["address"] != NULL) {
        address = profile["address"];
    } else {
        address = inputAddress + ((profile["maxOffset"].get<int>() + 1) * createIndex);
    }

    if (profile.contains("x") && profile["x"] != NULL) {
        x = profile["x"];
    }

    if (profile.contains("y") && profile["y"] != NULL) {
        x = profile["y"];
    }

    if (profile.contains("w") && profile["w"] != NULL) {
        x = profile["w"];
    }

    if (profile.contains("h") && profile["h"] != NULL) {
        x = profile["h"];
    }

    if (profile.contains("colortable") && profile["colortable"] != NULL) {
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

        if (pi.contains("i") && pi["i"] != NULL) {
            newParam.i = pi["i"];
        } else {
            newParam.i = random_string(10);
        }

        newParam.coarse = pi["coarse"];
        if (pi.contains("fine") && pi["fine"] != NULL) {
            newParam.fine = pi["fine"];
        }
        newParam.fadeWithIntensity = pi["fadeWithIntensity"];
        newParam.highlight = pi["highlight"];
        newParam.home = pi["home"];
        newParam.liveValue = (newParam.home / 65535.0) * 100.0;
        newParam.invert = pi["invert"];
        newParam.name = pi["name"];
        newParam.size = pi["size"];
        newParam.type = pi["type"];
        if (pi.contains("white") && pi["white"] != NULL) {
            newParam.white.val = pi["white"]["val"];
            newParam.white.temp = pi["white"]["temp"];
        }
        if (pi.contains("ranges") && pi["ranges"] != NULL) {
            for (auto &ri : pi["ranges"]) {
                FixtureParameterRange newRange;
                if (ri.contains("i") && ri["i"] != NULL) {
                    newRange.i = ri["i"];
                } else {
                    newRange.i = random_string(10);
                }
                newRange.beginVal = ri["begin"];
                newRange.defaultVal = ri["default"];
                newRange.endVal = ri["end"];
                newRange.label = ri["label"];
                if (ri.contains("media") && ri["media"] != NULL) {
                    newRange.media.dcid = ri["media"]["dcid"];
                    newRange.media.name = ri["media"]["name"];
                }
                newParam.ranges[newRange.i] = newRange;
            }
        }
        parameters[newParam.i] = newParam;
    }
}