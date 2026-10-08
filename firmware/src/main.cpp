#include <Arduino.h>

#include "config.h"
#include "net/time_sync.h"
#include "net/wifi_connection.h"
#include "sensors/anemometer.h"
#include "sensors/bme280_sensor.h"
#include "sensors/rain_gauge.h"

static constexpr uint32_t STATUS_PRINT_INTERVAL_MS = 5000;
static uint32_t lastStatusPrint = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\n%s fw %s\n", DEVICE_ID, FW_VERSION);

  pinMode(PIN_STATUS_LED, OUTPUT);
  wifiBegin();
  timeBegin();
  bme280Begin();
  anemometerBegin();
  rainGaugeBegin();
}

void loop() {
  wifiLoop();
  timeLoop();
  anemometerTick();

  // LED: solid when connected, blinking while not.
  bool led = wifiIsConnected() || (millis() / 250) % 2 == 0;
  digitalWrite(PIN_STATUS_LED, led ? HIGH : LOW);

  if (millis() - lastStatusPrint >= STATUS_PRINT_INTERVAL_MS) {
    lastStatusPrint = millis();
    char iso[25] = "no valid time";
    timeNowIso(iso, sizeof(iso));
    if (wifiIsConnected()) {
      Serial.printf("[status] wifi OK, RSSI %d dBm, uptime %lu s, UTC %s\n", wifiRssi(), millis() / 1000, iso);
    } else {
      Serial.println("[status] wifi NOT connected");
    }

    // Bench test: every 5 s. The station will read once per minute.
    Bme280Reading bme = bme280Read();
    if (bme.ok) {
      Serial.printf("[bme280] %.1f C, %.1f %%, %.1f hPa\n", bme.tempC, bme.humidityPct, bme.pressureHpa);
    }

    // Bench test: summary every 5 s. The station will use 60 s periods.
    WindSummary wind = anemometerTakeSummary();
    Serial.printf("[wind] %lu pulses in %d s, avg %.2f m/s (%.1f km/h), gust %.2f m/s (%.1f km/h)\n",
                  (unsigned long)wind.pulses, wind.seconds, wind.avgMs, wind.avgMs * 3.6f, wind.gustMs, wind.gustMs * 3.6f);

    RainSummary rain = rainGaugeTakeSummary();
    Serial.printf("[rain] %lu tips in 5 s, %.4f mm\n", (unsigned long)rain.tips, rain.mm);
  }
}
