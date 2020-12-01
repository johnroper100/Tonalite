#ifndef FIXTURE_HPP_INCLUDED
#define FIXTURE_HPP_INCLUDED

#include <string>
#include <unordered_map>

#include "json.hpp"

using namespace std;
using json = nlohmann::json;

class FixtureParameter {
   public:
    string i;
    int coarse;
    int fine = -1;
    bool fadeWithIntensity = false;
    int highlight;
    int home;
    bool invert;
    string name;
    int size;
    int type;

    double value = 0.0;
    int getDMXValue();
};

class Fixture {
   public:
    string i;
    string name;
    int universe = 1;
    int address = 1;
    int x = 0;
    int y = 0;
    int w = 2;
    int h = 1;

    bool hasIntensity;
    string manufacturerName;
    int maxOffset;
    string modeName;
    string modelName;
    unordered_map<string, FixtureParameter> parameters;
    Fixture();
    Fixture(json profile, int universe, int address, int createIndex);
    json asJson();
};

#endif