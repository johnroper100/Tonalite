#ifndef GROUP_HPP_INCLUDED
#define GROUP_HPP_INCLUDED

#include <string>
#include <vector>

#include "json.hpp"

using namespace std;
using json = nlohmann::json;

struct Group {
    string i;
    string name;
    vector<string> fixtures;

    Group();
    Group(json profile);
    json asJson();
    bool removeFixture(string fixtureID);
};

#endif