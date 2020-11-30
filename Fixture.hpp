#ifndef FIXTURE_HPP_INCLUDED
#define FIXTURE_HPP_INCLUDED

#include <string>
#include <unordered_map>

using namespace std;

struct FixtureParameter {
    int coarse = 0;
    int fine = -1;
    double value = 0.0;
    int getDMXValue();
};

struct Fixture {
    int universe = 1;
    int address = 1;
    string i;
    int x = 0;
    int y = 0;
    int w = 2;
    int h = 1;
    string name;
    unordered_map<string, FixtureParameter> parameters;
};

#endif