#include "live_log.h"

#ifdef LIVE_LOG_INTERVAL_MS

#include <wind_math.h>

#include "config.h"
#include "net/wifi_connection.h"
#include "sensors/anemometer.h"
#include "sensors/bme280_sensor.h"
#include "sensors/rain_gauge.h"
#include "sensors/wind_vane.h"

static uint32_t lastLogMs = 0;
static uint32_t lastPulses = 0;
static uint32_t lastTips = 0;

void liveLogLoop() {
  uint32_t now = millis();
  if (now - lastLogMs < LIVE_LOG_INTERVAL_MS) {
    return;
  }
  float seconds = (now - lastLogMs) / 1000.0f;
  lastLogMs = now;

  // Only the running totals are read, so the minute summaries are not affected.
  uint32_t pulses = anemometerTotalPulses();
  uint32_t tips = rainGaugeTotalTips();
  uint32_t newPulses = pulses - lastPulses;
  uint32_t newTips = tips - lastTips;
  lastPulses = pulses;
  lastTips = tips;

  Bme280Reading bme = bme280Read();
  VaneSample vane = windVaneSampleNow();

  Serial.printf("[live] %.1f C  %.1f %%  %.1f hPa | wind %.2f m/s (%u pulses) | vane %s %.0f deg (adc %d)"
                " | rain +%u tips (total %u) | rssi %d\n",
                bme.tempC, bme.humidityPct, bme.pressureHpa,
                windSpeedMs(newPulses, seconds, WIND_MS_PER_HZ), (unsigned)newPulses,
                VANE_POSITIONS[vane.index].name, vane.degrees, vane.adc,
                (unsigned)newTips, (unsigned)tips,
                wifiIsConnected() ? wifiRssi() : 0);
}

#else

void liveLogLoop() {}

#endif
