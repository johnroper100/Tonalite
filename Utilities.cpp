#include "Utilities.hpp"
#include "json.hpp"

#include <random>

using namespace std;
using json = nlohmann::json;

string random_string(size_t length) {
    const string CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    random_device random_device;
    mt19937 generator(random_device());
    uniform_int_distribution<> distribution(0, CHARACTERS.size() - 1);

    string random_string;

    for (size_t i = 0; i < length; ++i) {
        random_string += CHARACTERS[distribution(generator)];
    }

    return random_string;
}

bool compareByAddress(const json &a, const json &b) {
    return (a["universe"] < b["universe"]) || ((a["universe"] == b["universe"]) && (a["address"] < b["address"]));
}

bool compareByOrder(const json &a, const json &b) {
    return a["order"] < b["order"];
}