#pragma once

#include <stdint.h>

// Tells a real reed closure from electrical noise by how long the pin stays low.
// Fed with every edge (CHANGE interrupt) and the pin level read in the handler.
// A pulse is counted when the pin goes back high, once its whole low time is known.
// Times are in microseconds on a 64-bit clock (esp_timer_get_time()), so they never wrap:
// the bench showed hand tips whose closures last under 1 ms, too short for millis().
struct PulseFilter {
  bool low = false;            // low since a falling edge we saw (not since boot)
  uint64_t fellAtUs = 0;
  uint64_t lastCountedUs = 0;
  uint32_t lastLowUs = 0;      // low time of the latest pulse, counted or not (diagnostics)
};

enum class PulseVerdict {
  None,      // falling edge, or a rise with no fall seen before it
  TooShort,  // low for less than minLowUs: noise
  TooSoon,   // inside the debounce window of the previous counted pulse
  Counted,
};

// Inline so it compiles into the interrupt handler (ISR code must live in IRAM).
inline PulseVerdict pulseFilterEdge(PulseFilter &filter, bool pinLow, uint64_t nowUs,
                                    uint32_t minLowUs, uint32_t debounceUs) {
  if (pinLow) {
    // A second low in a row means a short high was missed: time from the latest one,
    // so only an unbroken low counts.
    filter.low = true;
    filter.fellAtUs = nowUs;
    return PulseVerdict::None;
  }
  if (!filter.low) {
    // Already high, or the pin was low at boot and we never saw it fall.
    return PulseVerdict::None;
  }
  filter.low = false;
  uint64_t lowUs = nowUs - filter.fellAtUs;
  filter.lastLowUs = lowUs > UINT32_MAX ? UINT32_MAX : (uint32_t)lowUs;
  if (filter.lastLowUs < minLowUs) {
    return PulseVerdict::TooShort;
  }
  if (nowUs - filter.lastCountedUs < debounceUs) {
    return PulseVerdict::TooSoon;
  }
  filter.lastCountedUs = nowUs;
  return PulseVerdict::Counted;
}
