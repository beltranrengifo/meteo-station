#pragma once

#include <Arduino.h>

struct VaneSample {
  int adc;          // averaged raw ADC value (0-4095)
  int index;        // position in VANE_POSITIONS
  float degrees;    // direction with VANE_OFFSET_DEG applied
};

struct VaneSummary {
  int samples;
  float meanDeg;    // circular mean of the period, NAN if no samples
  VaneSample last;  // most recent sample (useful on the bench)
};

void windVaneBegin();

// Call from loop(): takes a sample every VANE_SAMPLE_INTERVAL_MS.
void windVaneTick();

// Circular mean of the samples since the previous call, then starts a new period.
// Takes one sample on the spot if the period has none.
VaneSummary windVaneTakeSummary();
