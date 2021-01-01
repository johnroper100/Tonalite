#ifndef UTILITIES_HPP_INCLUDED
#define UTILITIES_HPP_INCLUDED

#include <string>
#include "json.hpp"

using namespace std;
using json = nlohmann::json;

string random_string(size_t length);
bool compareByAddress(const json &a, const json &b);
bool compareByOrder(const json &a, const json &b);

#endif