#include "Fixture.hpp"

#include <cmath>
#include <iostream>

#include "Utilities.hpp"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

FixtureParameterRange::FixtureParameterRange(){};

FixtureParameterRange::FixtureParameterRange(json profile) {
    if (profile.contains("i") && profile["i"] != NULL) {
        i = profile["i"];
    } else {
        i = random_string(10);
    }
    if (profile.contains("begin") && profile["begin"] != NULL) {
        beginVal = profile["begin"];
    }
    if (profile.contains("default") && profile["default"] != NULL) {
        defaultVal = profile["default"];
    }
    if (profile.contains("end") && profile["end"] != NULL) {
        endVal = profile["end"];
    }
    if (profile.contains("label") && profile["label"] != NULL) {
        label = profile["label"];
    }
    if (profile.contains("media") && profile["media"] != NULL) {
        if (profile["media"].contains("dcid") && profile["media"]["dcid"] != NULL) {
            media.dcid = profile["media"]["dcid"];
        }
        if (profile["media"].contains("name") && profile["media"]["name"] != NULL) {
            media.name = profile["media"]["name"];
        }
    }
};

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
    pItem["displayValue"] = displayValue;
    pItem["blindValues"] = {};
    for (auto &ri : blindValues) {
        pItem["blindValues"][ri.first] = ri.second;
    }
    return pItem;
};

FixtureParameter::FixtureParameter(){};

FixtureParameter::FixtureParameter(json profile) {
    if (profile.contains("i") && profile["i"] != NULL) {
        i = profile["i"];
    } else {
        i = random_string(10);
    }

    coarse = profile["coarse"];
    if (profile.contains("fine") && profile["fine"] != NULL) {
        fine = profile["fine"];
    }
    fadeWithIntensity = profile["fadeWithIntensity"];
    highlight = profile["highlight"];
    home = profile["home"];
    invert = profile["invert"];
    name = profile["name"];
    size = profile["size"];
    type = profile["type"];
    if (profile.contains("white") && profile["white"] != NULL) {
        if (profile["white"].contains("val") && profile["white"]["val"] != NULL) {
            white.val = profile["white"]["val"];
        }
        if (profile["white"].contains("temp") && profile["white"]["temp"] != NULL) {
            white.temp = profile["white"]["temp"];
        }
    }
    if (profile.contains("ranges") && profile["ranges"] != NULL) {
        for (auto &ri : profile["ranges"]) {
            FixtureParameterRange newRange(ri);
            ranges[newRange.i] = newRange;
        }
    }

    liveValue = (home / 65535.0) * 100.0;
    displayValue = liveValue;
};

json Fixture::asJson() {
    json fItem;

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
        pi.second.blindValues[socketID] = (pi.second.home / 65535.0) * 100.0;
    }
};

Fixture::Fixture(){};

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

    maxOffset = profile["maxOffset"];

    if (profile.contains("address") && profile["address"] != NULL) {
        address = profile["address"];
    } else {
        address = inputAddress + ((profile["maxOffset"].get<int>() + 1) * createIndex);
    }

    if (profile.contains("address") == false) {
        if (address > 512 || address + maxOffset > 512) {
            universe = (int)ceil((address + maxOffset) / 512.0);
            address = (address + maxOffset) - (512 * (universe - 1));
        }
    }

    if (profile.contains("x") && profile["x"] != NULL) {
        x = profile["x"];
    }

    if (profile.contains("y") && profile["y"] != NULL) {
        y = profile["y"];
    }

    if (profile.contains("w") && profile["w"] != NULL) {
        w = profile["w"];
    }

    if (profile.contains("h") && profile["h"] != NULL) {
        h = profile["h"];
    }

    if (profile.contains("colortable") && profile["colortable"] != NULL) {
        colortable = profile["colortable"];
    }
    dcid = profile["dcid"];
    hasIntensity = profile["hasIntensity"];
    manufacturerName = profile["manufacturerName"];
    modeName = profile["modeName"];
    modelName = profile["modelName"];

    for (auto &pi : profile["parameters"]) {
        FixtureParameter newParam(pi);
        parameters[newParam.i] = newParam;
    }
};