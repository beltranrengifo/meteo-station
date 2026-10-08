#include <Arduino.h>

#include "config.h"
#include "net/time_sync.h"
#include "net/wifi_connection.h"

static constexpr uint32_t STATUS_PRINT_INTERVAL_MS = 5000;
static uint32_t lastStatusPrint = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\n%s fw %s\n", DEVICE_ID, FW_VERSION);

  pinMode(PIN_STATUS_LED, OUTPUT);
  wifiBegin();
  timeBegin();
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
  }
}
