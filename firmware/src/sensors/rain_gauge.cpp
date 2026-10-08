#include "rain_gauge.h"

#include <debounce.h>
#include <rain_math.h>

#include "config.h"

static volatile uint32_t isrTips = 0;
static volatile uint32_t isrLastAcceptedMs = 0;
static uint32_t totalTips = 0;
static portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;

static void IRAM_ATTR onRainTip() {
  uint32_t now = millis();
  portENTER_CRITICAL_ISR(&isrMux);
  if (debounceAccept(now, isrLastAcceptedMs, RAIN_DEBOUNCE_MS)) {
    isrTips++;
    isrLastAcceptedMs = now;
  }
  portEXIT_CRITICAL_ISR(&isrMux);
}

void rainGaugeBegin() {
  pinMode(PIN_RAIN, INPUT_PULLUP);  // plus the external 10k pull-up
  attachInterrupt(digitalPinToInterrupt(PIN_RAIN), onRainTip, FALLING);
  Serial.printf("[rain] gauge ready on GPIO %d\n", PIN_RAIN);
}

uint32_t rainGaugeTotalTips() {
  portENTER_CRITICAL(&isrMux);
  uint32_t pending = isrTips;
  portEXIT_CRITICAL(&isrMux);
  return totalTips + pending;
}

RainSummary rainGaugeTakeSummary() {
  portENTER_CRITICAL(&isrMux);
  uint32_t tips = isrTips;
  isrTips = 0;
  portEXIT_CRITICAL(&isrMux);
  totalTips += tips;
  return {tips, rainMmFromTips(tips, RAIN_MM_PER_TIP)};
}
