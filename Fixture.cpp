#include "Fixture.hpp"

#include <cmath>
#include <iostream>

#include "Utilities.hpp"
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

void FixtureParameterValue::calculateManAndSneak() {
    outputValue = backgroundValue;
    if (manualInput == 1) {
        outputValue = manualValue;
    } else {
        if (sneak == 1) {
            if (manualValue != outputValue) {
                manualValue += (backgroundValue - manualValue) / totalSneakProgress;
                outputValue = manualValue;
                if (--totalSneakProgress == 0) {
                    sneak = 0;
                }
            } else {
                sneak = 0;
            }
        }
    }
};

json FixtureParameterValue::asJson() {
    json vItem;

    vItem["outputValue"] = outputValue;
    vItem["modifiedOutputValue"] = modifiedOutputValue;
    vItem["backgroundValue"] = backgroundValue;
    vItem["manualValue"] = manualValue;
    vItem["manualUser"] = manualUser;
    vItem["manualInput"] = manualInput;
    vItem["sneak"] = sneak;
    vItem["totalSneakProgress"] = totalSneakProgress;

    return vItem;
};

FixtureParameterRange::FixtureParameterRange(){};

FixtureParameterRange::FixtureParameterRange(json profile) {
    if (profile.contains("i") && profile["i"] != nullptr) {
        i = profile["i"];
    } else {
        i = random_string(10);
    }
    if (profile.contains("begin") && profile["begin"] != nullptr) {
        beginVal = profile["begin"];
    }
    if (profile.contains("default") && profile["default"] != nullptr) {
        defaultVal = profile["default"];
    }
    if (profile.contains("end") && profile["end"] != nullptr) {
        endVal = profile["end"];
    }
    if (profile.contains("label") && profile["label"] != nullptr) {
        label = profile["label"];
    }
    if (profile.contains("media") && profile["media"] != nullptr) {
        if (profile["media"].contains("dcid") && profile["media"]["dcid"] != nullptr) {
            media.dcid = profile["media"]["dcid"];
        }
        if (profile["media"].contains("name") && profile["media"]["name"] != nullptr) {
            media.name = profile["media"]["name"];
        }
    }
};

json FixtureParameterRange::asJson() {
    json rItem;

    rItem["i"] = i;
    rItem["begin"] = beginVal;
    rItem["default"] = defaultVal;
    rItem["end"] = endVal;
    rItem["label"] = label;
    rItem["media"] = {};
    rItem["media"]["dcid"] = media.dcid;
    rItem["media"]["name"] = media.name;

    return rItem;
};

FixtureParameter::FixtureParameter() {
    i = random_string(10);
    FixtureParameterValue newValue;
    value = newValue;
    home = 0;
    type = 1;
};

FixtureParameter::FixtureParameter(json profile) {
    if (profile.contains("i") && profile["i"] != nullptr) {
        i = profile["i"];
    } else {
        i = random_string(10);
    }

    coarse = profile["coarse"];
    if (profile.contains("fine") && profile["fine"] != nullptr) {
        fine = profile["fine"];
    }
    fadeWithIntensity = profile["fadeWithIntensity"];
    highlight = profile["highlight"];
    home = profile["home"];
    invert = profile["invert"];
    name = profile["name"];
    size = profile["size"];
    type = profile["type"];
    if (profile.contains("white") && profile["white"] != nullptr) {
        if (profile["white"].contains("val") && profile["white"]["val"] != nullptr) {
            white.val = profile["white"]["val"];
        }
        if (profile["white"].contains("temp") && profile["white"]["temp"] != nullptr) {
            white.temp = profile["white"]["temp"];
        }
    }
    if (profile.contains("ranges") && profile["ranges"] != nullptr) {
        for (auto &ri : profile["ranges"]) {
            FixtureParameterRange newRange(ri);
            ranges[newRange.i] = newRange;
        }
    }
    FixtureParameterValue newValue;
    value = newValue;
};

int FixtureParameter::getDMXValue() {
    return ceil(65535.0 * (value.modifiedOutputValue / 100.0));
};

int FixtureParameter::getDMXValue(string userID) {
    return ceil(65535.0 * (blindManualValues.at(userID).modifiedOutputValue / 100.0));
};

void FixtureParameter::startSneak(double inputTime, string userID) {
    if (userID == "") {
        if (value.manualInput == 1) {
            value.sneak = 1;
            value.manualInput = 0;
            value.manualUser = "";
            value.totalSneakProgress = 40.0 * inputTime;
        }
    } else {
        if (blindManualValues.at(userID).manualInput == 1) {
            blindManualValues.at(userID).sneak = 1;
            blindManualValues.at(userID).manualInput = 0;
            blindManualValues.at(userID).manualUser = "";
            blindManualValues.at(userID).totalSneakProgress = 40.0 * inputTime;
        }
    }
};

void FixtureParameter::resetOutputValue() {
    value.backgroundValue = (home / 65535.0) * 100.0;
    for (auto &ui : blindManualValues) {
        ui.second.backgroundValue = value.backgroundValue;
    }
};

void FixtureParameter::calculateManAndSneak() {
    value.calculateManAndSneak();
    for (auto &ui : blindManualValues) {
        ui.second.calculateManAndSneak();
    }
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
        pItem["ranges"].push_back(ri.second.asJson());
    }
    pItem["white"] = {};
    pItem["white"]["val"] = white.val;
    pItem["white"]["temp"] = white.temp;

    pItem["value"] = value.asJson();
    pItem["blindManualValues"] = {};
    for (auto &ri : blindManualValues) {
        pItem["blindManualValues"][ri.first] = ri.second.asJson();
    }
    return pItem;
};

Fixture::Fixture(){};

Fixture::Fixture(json profile, int inputUniverse, int inputAddress, int createIndex) {
    if (profile.contains("i") && profile["i"] != nullptr) {
        i = profile["i"];
    } else {
        i = random_string(10);
    }

    if (profile.contains("name") && profile["name"] != nullptr) {
        name = profile["name"];
    } else {
        name = profile["modelName"];
    }

    if (profile.contains("universe") && profile["universe"] != nullptr) {
        universe = profile["universe"];
    } else {
        universe = inputUniverse;
    }

    maxOffset = profile["maxOffset"];

    if (profile.contains("address") && profile["address"] != nullptr) {
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

    channel = address + (512 * (universe - 1));

    if (profile.contains("x") && profile["x"] != nullptr) {
        x = profile["x"];
    }

    if (profile.contains("y") && profile["y"] != nullptr) {
        y = profile["y"];
    }

    if (profile.contains("w") && profile["w"] != nullptr) {
        w = profile["w"];
    }

    if (profile.contains("h") && profile["h"] != nullptr) {
        h = profile["h"];
    }

    if (profile.contains("colortable") && profile["colortable"] != nullptr) {
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

    FixtureParameter newParam;
    newParam.name = "Intensity";
    intensityParam = newParam;
};

void Fixture::addUserBlind(string socketID) {
    for (auto &pi : parameters) {
        FixtureParameterValue newValue;
        pi.second.blindManualValues[socketID] = newValue;
    }
    FixtureParameterValue newValue;
    intensityParam.blindManualValues[socketID] = newValue;
};

void Fixture::removeUserBlind(string socketID) {
    for (auto &pi : parameters) {
        pi.second.blindManualValues.erase(socketID);
    }
    intensityParam.blindManualValues.erase(socketID);
};

json Fixture::asJson() {
    json fItem;

    fItem["i"] = i;
    fItem["name"] = name;
    fItem["universe"] = universe;
    fItem["address"] = address;
    fItem["channel"] = channel;
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
    fItem["intensityParam"] = intensityParam.asJson();
    return fItem;
};

SmallFixture::SmallFixture(){};

SmallFixture::SmallFixture(json profile) {
    i = profile["i"];

    for (auto &pi : profile["parameters"]) {
        FixtureParameter newParam(pi);
        parameters[newParam.i] = newParam;
    }
};

json SmallFixture::asJson() {
    json fItem;

    fItem["i"] = i;
    fItem["parameters"] = {};
    for (auto &pi : parameters) {
        fItem["parameters"].push_back(pi.second.asJson());
    }
    return fItem;
};