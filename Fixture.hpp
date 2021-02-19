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

    json asJson();
    FixtureParameterRange();
    FixtureParameterRange(json profile);
};

struct FixtureParameterValue {
    double outputValue;
    double modifiedOutputValue;
    double backgroundValue;
    double manualValue = 0.0;
    string manualUser = "";
    int manualInput = 0;
    int sneak = 0;
    double totalSneakProgress;

    double cueOutputValue = 0.0;
    string controllingCue = "";
    string targetCue = "";
    int cueSneak = 0;
    double totalCueSneakProgress;

    void calculateManAndSneak(int animate);
    json asJson();
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

    FixtureParameterValue value;
    unordered_map<string, FixtureParameterValue> blindManualValues;
    int getDMXValue();
    int getDMXValue(string userID);
    void startSneak(double inputTime, string userID);
    void resetOutputValue();
    void calculateManAndSneak(int animate);
    json asJson();

    FixtureParameter();
    FixtureParameter(json profile);
};

struct Fixture {
    string i;
    string name;
    int channel;
    int universe;
    int address;
    int x = 0;
    int y = 0;
    int w = 1;
    int h = 1;

    string colortable;
    string dcid;
    bool hasIntensity;
    string manufacturerName;
    int maxOffset;
    string modeName;
    string modelName;
    unordered_map<string, FixtureParameter> parameters;
    FixtureParameter intensityParam;
    Fixture();
    Fixture(json profile, int inputUniverse, int inputAddress, int createIndex);
    json asJson();
    void addUserBlind(string socketID);
    void removeUserBlind(string socketID);
};

struct SmallFixture {
    string i;
    unordered_map<string, FixtureParameter> parameters;
    SmallFixture();
    SmallFixture(json profile);
    json asJson();
};

#endif