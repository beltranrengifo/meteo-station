#pragma once

#include <stdint.h>

// Pure wind calculations. No Arduino dependency, so they run in native unit tests.

// Average speed in m/s from pulses counted over `seconds`. 0 if seconds is 0.
float windSpeedMs(uint32_t pulses, float seconds, float msPerHz);

// Gust in m/s: highest average over any `windowS` consecutive seconds (sliding window).
// With fewer seconds than the window, averages all of them. 0 if there is no data.
float windGustMs(const uint16_t *pulsesPerSecond, int count, int windowS, float msPerHz);
