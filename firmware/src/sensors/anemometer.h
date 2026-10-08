#pragma once

#include <Arduino.h>

struct WindSummary {
  uint32_t pulses;
  int seconds;
  float avgMs;
  float gustMs;
};

// Pin and interrupt setup. Pulses are counted in the background from here on.
void anemometerBegin();

// Call from loop(): stores the pulses of each completed second (needed for the gust).
void anemometerTick();

// Average and gust over the seconds since the previous call, then starts a new period.
WindSummary anemometerTakeSummary();
