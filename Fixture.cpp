#include "Fixture.hpp"

#include <cmath>

using namespace std;

int FixtureParameter::getDMXValue() {
    return ceil(65535.0 * value);
};