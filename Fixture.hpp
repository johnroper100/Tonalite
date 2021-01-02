#ifndef FIXTURE_HPP_INCLUDED
#define FIXTURE_HPP_INCLUDED

#include <string>
#include <unordered_map>
#include <vector>

#include "json.hpp"

using namespace std;
using json = nlohmann::json;

struct MediaItem {
    string dcid;
    string name;
};

struct WhiteItem {
    int val;
    string temp;
};

struct FixtureParameterRange {
    string i;
    int beginVal;
    int defaultVal;
    int endVal;
    string label;
    MediaItem media;

    FixtureParameterRange();
    FixtureParameterRange(json profile);
};

struct FixtureParameter {
    string i;
    int coarse;
    int fine = -1;
    bool fadeWithIntensity;
    int highlight;
    int home;
    bool invert;
    string name;
    int size;
    int type;
    WhiteItem white;
    unordered_map<string, FixtureParameterRange> ranges;

    double liveValue = 0.0;
    double displayValue = 0.0;
    unordered_map<string, double> blindValues;
    int getDMXValue();
    int getDMXValue(string userID);
    json asJson();

    FixtureParameter();
    FixtureParameter(json profile);
};

struct Fixture {
    string i;
    string name;
    int universe;
    int address;
    int x = 0;
    int y = 0;
    int w = 2;
    int h = 1;

    string colortable;
    string dcid;
    bool hasIntensity;
    string manufacturerName;
    int maxOffset;
    string modeName;
    string modelName;
    unordered_map<string, FixtureParameter> parameters;
    Fixture();
    Fixture(json profile, int inputUniverse, int inputAddress, int createIndex);
    json asJson();
    void addUserBlind(string socketID);
};

#endif