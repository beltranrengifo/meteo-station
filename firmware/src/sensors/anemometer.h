#pragma once

#include <Arduino.h>

struct WindSummary {
  uint32_t pulses;
  int seconds;
  float avgMs;
  float gustMs;
};

// Pin, interrupt and 1 s timer setup. Pulses are counted and binned per second in the
// background from here on, independent of loop(), so a slow upload cannot distort the gust.
void anemometerBegin();

// Pulses since boot (for the self-check).
uint32_t anemometerTotalPulses();

// Average and gust over the seconds since the previous call, then starts a new period.
WindSummary anemometerTakeSummary();
