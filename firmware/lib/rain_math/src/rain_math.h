#pragma once

#include <stdint.h>

// Pure rain calculations. No Arduino dependency, so they run in native unit tests.

// Millimetres of rain for a number of bucket tips.
float rainMmFromTips(uint32_t tips, float mmPerTip);
