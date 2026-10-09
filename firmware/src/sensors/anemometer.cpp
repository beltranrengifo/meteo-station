#include "anemometer.h"

#include <debounce.h>
#include <esp_timer.h>
#include <wind_math.h>

#include "config.h"

// Room for the 60 s reading period plus slack if the summary is taken late.
static constexpr int MAX_SECONDS = 120;

static volatile uint32_t isrPulses = 0;
static volatile uint32_t isrLastAcceptedMs = 0;
static portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;

// Written by the 1 s timer, read by anemometerTakeSummary(): guarded by secondsMux.
static uint16_t pulsesPerSecond[MAX_SECONDS];
static int secondCount = 0;
static uint32_t totalPulses = 0;
static portMUX_TYPE secondsMux = portMUX_INITIALIZER_UNLOCKED;

static esp_timer_handle_t secondTimer = nullptr;

static void IRAM_ATTR onAnemometerPulse() {
  uint32_t now = millis();
  portENTER_CRITICAL_ISR(&isrMux);
  if (debounceAccept(now, isrLastAcceptedMs, ANEMOMETER_DEBOUNCE_MS)) {
    isrPulses++;
    isrLastAcceptedMs = now;
  }
  portEXIT_CRITICAL_ISR(&isrMux);
}

// Runs every second in the esp_timer task: moves the pulses of that second into its bin.
static void onSecond(void *) {
  portENTER_CRITICAL(&isrMux);
  uint32_t pulses = isrPulses;
  isrPulses = 0;
  portEXIT_CRITICAL(&isrMux);

  uint16_t bin = pulses > UINT16_MAX ? UINT16_MAX : pulses;
  portENTER_CRITICAL(&secondsMux);
  totalPulses += pulses;
  if (secondCount < MAX_SECONDS) {
    pulsesPerSecond[secondCount++] = bin;
  } else {
    // Bins full (summary not taken in time): fold into the last second.
    uint32_t last = pulsesPerSecond[MAX_SECONDS - 1] + bin;
    pulsesPerSecond[MAX_SECONDS - 1] = last > UINT16_MAX ? UINT16_MAX : last;
  }
  portEXIT_CRITICAL(&secondsMux);
}

void anemometerBegin() {
  pinMode(PIN_ANEMOMETER, INPUT_PULLUP);  // plus the external 10k pull-up
  attachInterrupt(digitalPinToInterrupt(PIN_ANEMOMETER), onAnemometerPulse, FALLING);

  esp_timer_create_args_t args = {};
  args.callback = onSecond;
  args.name = "anemometer";
  esp_timer_create(&args, &secondTimer);
  esp_timer_start_periodic(secondTimer, 1000000);  // 1 s, in microseconds

  Serial.printf("[wind] anemometer ready on GPIO %d\n", PIN_ANEMOMETER);
}

uint32_t anemometerTotalPulses() {
  portENTER_CRITICAL(&secondsMux);
  uint32_t total = totalPulses;
  portEXIT_CRITICAL(&secondsMux);
  return total;
}

WindSummary anemometerTakeSummary() {
  // Copy the bins and start a new period in one short critical section.
  uint16_t bins[MAX_SECONDS];
  portENTER_CRITICAL(&secondsMux);
  int count = secondCount;
  memcpy(bins, pulsesPerSecond, count * sizeof(uint16_t));
  secondCount = 0;
  portEXIT_CRITICAL(&secondsMux);

  WindSummary summary = {0, count, 0.0f, 0.0f};
  for (int i = 0; i < count; i++) {
    summary.pulses += bins[i];
  }
  summary.avgMs = windSpeedMs(summary.pulses, (float)count, WIND_MS_PER_HZ);
  summary.gustMs = windGustMs(bins, count, GUST_WINDOW_S, WIND_MS_PER_HZ);
  return summary;
}
