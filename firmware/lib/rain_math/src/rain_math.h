#pragma once

#include <stdint.h>

// Pure rain calculations. No Arduino dependency, so they run in native unit tests.

// Millimetres of rain for a number of bucket tips.
float rainMmFromTips(uint32_t tips, float mmPerTip);

// True if a minute's tips cannot be rain: more tips than a cloudburst gives (maxTips), or
// more than maxShortGaps tips that came sooner after the previous one than a bucket can fill.
// Electrical noise on the gauge cable does both; see config.h for the limits.
bool rainLooksLikeNoise(uint32_t tips, uint32_t shortGaps, uint32_t maxTips, uint32_t maxShortGaps);
