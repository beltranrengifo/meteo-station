#include <Arduino.h>

#include "config.h"
#include "net/wifi_connection.h"

static constexpr uint32_t STATUS_PRINT_INTERVAL_MS = 5000;
static uint32_t lastStatusPrint = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\n%s fw %s\n", DEVICE_ID, FW_VERSION);

  pinMode(PIN_STATUS_LED, OUTPUT);
  wifiBegin();
}

void loop() {
  wifiLoop();

  // LED: solid when connected, blinking while not.
  bool led = wifiIsConnected() || (millis() / 250) % 2 == 0;
  digitalWrite(PIN_STATUS_LED, led ? HIGH : LOW);

  if (millis() - lastStatusPrint >= STATUS_PRINT_INTERVAL_MS) {
    lastStatusPrint = millis();
    if (wifiIsConnected()) {
      Serial.printf("[status] wifi OK, RSSI %d dBm, uptime %lu s\n", wifiRssi(), millis() / 1000);
    } else {
      Serial.println("[status] wifi NOT connected");
    }
  }
}
