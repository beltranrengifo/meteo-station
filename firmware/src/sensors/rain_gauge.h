#pragma once

#include <Arduino.h>

struct RainSummary {
  uint32_t tips;
  float mm;
};

// Pin and interrupt setup. Tips are counted in the background from here on.
void rainGaugeBegin();

// Tips and millimetres since the previous call, then starts a new period.
// Always the rain of the period, never a running total, so a reboot cannot corrupt totals.
RainSummary rainGaugeTakeSummary();
