#ifndef CUE_HPP_INCLUDED
#define CUE_HPP_INCLUDED

#include <string>
#include <vector>

#include "json.hpp"

using namespace std;
using json = nlohmann::json;

struct Cue {
    string i;
    string name;
    string lastCue = "";
    string nextCue = "";
    int order;

    Cue();
    Cue(json profile);
    json asJson();
};

#endif