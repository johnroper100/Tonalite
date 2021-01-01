#ifndef CUE_HPP_INCLUDED
#define CUE_HPP_INCLUDED

#include <string>
#include <vector>

#include "json.hpp"

using namespace std;
using json = nlohmann::json;

struct Cue;

struct Cue {
    string i;
    string name;
    Cue *lastCue;
    Cue *nextCue;

    Cue();
    Cue(json profile);
    json asJson();
};

#endif