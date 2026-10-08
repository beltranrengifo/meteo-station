#include "anemometer.h"

#include <debounce.h>
#include <wind_math.h>

#include "config.h"

// Room for the 60 s reading period plus slack if loop() runs late.
static constexpr int MAX_SECONDS = 120;

static volatile uint32_t isrPulses = 0;
static volatile uint32_t isrLastAcceptedMs = 0;
static portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;

static uint16_t pulsesPerSecond[MAX_SECONDS];
static int secondCount = 0;
static uint32_t nextSecondMs = 0;
static uint32_t totalPulses = 0;

static void IRAM_ATTR onAnemometerPulse() {
  uint32_t now = millis();
  portENTER_CRITICAL_ISR(&isrMux);
  if (debounceAccept(now, isrLastAcceptedMs, ANEMOMETER_DEBOUNCE_MS)) {
    isrPulses++;
    isrLastAcceptedMs = now;
  }
  portEXIT_CRITICAL_ISR(&isrMux);
}

static uint32_t takeIsrPulses() {
  portENTER_CRITICAL(&isrMux);
  uint32_t pulses = isrPulses;
  isrPulses = 0;
  portEXIT_CRITICAL(&isrMux);
  return pulses;
}

void anemometerBegin() {
  pinMode(PIN_ANEMOMETER, INPUT_PULLUP);  // plus the external 10k pull-up
  attachInterrupt(digitalPinToInterrupt(PIN_ANEMOMETER), onAnemometerPulse, FALLING);
  nextSecondMs = millis() + 1000;
  Serial.printf("[wind] anemometer ready on GPIO %d\n", PIN_ANEMOMETER);
}

void anemometerTick() {
  uint32_t now = millis();
  if ((int32_t)(now - nextSecondMs) < 0) {
    return;
  }
  nextSecondMs += 1000;
  uint32_t pulses = takeIsrPulses();
  totalPulses += pulses;
  if (pulses > UINT16_MAX) {
    pulses = UINT16_MAX;
  }
  if (secondCount < MAX_SECONDS) {
    pulsesPerSecond[secondCount++] = pulses;
  } else {
    // Buffer full (summary not taken in time): fold into the last second.
    uint32_t last = pulsesPerSecond[MAX_SECONDS - 1] + pulses;
    pulsesPerSecond[MAX_SECONDS - 1] = last > UINT16_MAX ? UINT16_MAX : last;
  }
}

uint32_t anemometerTotalPulses() { return totalPulses; }

WindSummary anemometerTakeSummary() {
  WindSummary summary = {0, secondCount, 0.0f, 0.0f};
  for (int i = 0; i < secondCount; i++) {
    summary.pulses += pulsesPerSecond[i];
  }
  summary.avgMs = windSpeedMs(summary.pulses, (float)secondCount, WIND_MS_PER_HZ);
  summary.gustMs = windGustMs(pulsesPerSecond, secondCount, GUST_WINDOW_S, WIND_MS_PER_HZ);
  secondCount = 0;
  return summary;
}
