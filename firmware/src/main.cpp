#include <Arduino.h>

#include "config.h"
#include "net/time_sync.h"
#include "net/wifi_connection.h"
#include "sensors/bme280_sensor.h"

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
}

void loop() {
  wifiLoop();
  timeLoop();

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
  }
}
