#include "rain_gauge.h"

#include <esp_timer.h>
#include <pulse_filter.h>
#include <rain_math.h>

#include "config.h"

static PulseFilter isrFilter;
static volatile uint32_t isrTips = 0;
static volatile uint32_t isrTooShort = 0;
// Closures seen since the last diagnostics read, and the longest of them.
static volatile uint32_t isrLows = 0;
static volatile uint32_t isrLongestLowUs = 0;
static uint32_t totalTips = 0;
static portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;

// Runs on both edges: a tip counts when the reed opens again, if it was closed long enough.
static void IRAM_ATTR onRainEdge() {
  bool pinLow = digitalRead(PIN_RAIN) == LOW;
  uint64_t now = esp_timer_get_time();
  portENTER_CRITICAL_ISR(&isrMux);
  PulseVerdict verdict = pulseFilterEdge(isrFilter, pinLow, now, RAIN_MIN_LOW_US, RAIN_DEBOUNCE_MS * 1000);
  if (verdict != PulseVerdict::None) {
    isrLows++;
    if (isrFilter.lastLowUs > isrLongestLowUs) {
      isrLongestLowUs = isrFilter.lastLowUs;
    }
  }
  if (verdict == PulseVerdict::Counted) {
    isrTips++;
  } else if (verdict == PulseVerdict::TooShort) {
    isrTooShort++;
  }
  portEXIT_CRITICAL_ISR(&isrMux);
}

void rainGaugeBegin() {
  pinMode(PIN_RAIN, INPUT_PULLUP);  // plus the external 10k pull-up
  attachInterrupt(digitalPinToInterrupt(PIN_RAIN), onRainEdge, CHANGE);
  Serial.printf("[rain] gauge ready on GPIO %d\n", PIN_RAIN);
}

uint32_t rainGaugeTotalTips() {
  portENTER_CRITICAL(&isrMux);
  uint32_t pending = isrTips;
  portEXIT_CRITICAL(&isrMux);
  return totalTips + pending;
}

RainDiagnostics rainGaugeTakeDiagnostics() {
  portENTER_CRITICAL(&isrMux);
  RainDiagnostics diagnostics = {isrTooShort, isrLows, isrLongestLowUs};
  isrLows = 0;
  isrLongestLowUs = 0;
  portEXIT_CRITICAL(&isrMux);
  diagnostics.pinLow = digitalRead(PIN_RAIN) == LOW;
  return diagnostics;
}

RainSummary rainGaugeTakeSummary() {
  portENTER_CRITICAL(&isrMux);
  uint32_t tips = isrTips;
  isrTips = 0;
  portEXIT_CRITICAL(&isrMux);
  totalTips += tips;
  return {tips, rainMmFromTips(tips, RAIN_MM_PER_TIP)};
}
