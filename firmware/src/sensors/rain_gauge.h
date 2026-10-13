#pragma once

#include <Arduino.h>

struct RainSummary {
  uint32_t tips;
  float mm;
};

// Pin and interrupt setup. Tips are counted in the background from here on.
void rainGaugeBegin();

// Tips since boot (for the self-check).
uint32_t rainGaugeTotalTips();

// For the bench live log: tells noise from real tips and shows how long the reed closes.
struct RainDiagnostics {
  uint32_t tooShort;      // pulses rejected as noise since boot
  uint32_t lows;          // closures since the previous call, counted or not
  uint32_t longestLowUs;  // longest of those closures
  bool pinLow;            // reed closed right now
};

// Diagnostics since the previous call, then starts a new window.
RainDiagnostics rainGaugeTakeDiagnostics();

// Tips and millimetres since the previous call, then starts a new period.
// Always the rain of the period, never a running total, so a reboot cannot corrupt totals.
RainSummary rainGaugeTakeSummary();
