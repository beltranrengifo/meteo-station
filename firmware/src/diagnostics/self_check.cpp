#include "self_check.h"

#include <Arduino.h>
#include <check_rules.h>

#include "config.h"
#include "net/time_sync.h"
#include "net/wifi_connection.h"
#include "sensors/anemometer.h"
#include "sensors/bme280_sensor.h"
#include "sensors/rain_gauge.h"
#include "sensors/wind_vane.h"

static void printLine(const char *name, CheckStatus status, const char *detail) {
  Serial.printf("[check] %-7s %-4s  %s\n", name, checkStatusName(status), detail);
}

void selfCheckPrint() {
  char detail[96];
  Serial.println("[check] ---- sensor self-check ----");

  Bme280Reading bme = bme280Read();
  CheckStatus bmeStatus = checkBme280(bme.tempC, bme.humidityPct, bme.pressureHpa);
  if (isnan(bme.tempC)) {
    snprintf(detail, sizeof(detail), "no response at 0x%02X", BME280_I2C_ADDRESS);
  } else {
    snprintf(detail, sizeof(detail), "%.1f C, %.1f %%, %.1f hPa", bme.tempC, bme.humidityPct, bme.pressureHpa);
  }
  printLine("bme280", bmeStatus, detail);

  VaneSample vane = windVaneSampleNow();
  CheckStatus vaneStatus = checkVaneAdc(vane.adc, VANE_DISCONNECTED_ADC);
  if (vaneStatus == CHECK_OK) {
    snprintf(detail, sizeof(detail), "adc %d -> %s", vane.adc, VANE_POSITIONS[vane.index].name);
  } else {
    snprintf(detail, sizeof(detail), "adc %d, vane not connected?", vane.adc);
  }
  printLine("vane", vaneStatus, detail);

  bool windHigh = digitalRead(PIN_ANEMOMETER) == HIGH;
  snprintf(detail, sizeof(detail), "pin idle %s, %lu pulses since boot", windHigh ? "HIGH" : "LOW",
           (unsigned long)anemometerTotalPulses());
  printLine("wind", checkReedIdle(windHigh), detail);

  bool rainHigh = digitalRead(PIN_RAIN) == HIGH;
  snprintf(detail, sizeof(detail), "pin idle %s, %lu tips since boot", rainHigh ? "HIGH" : "LOW",
           (unsigned long)rainGaugeTotalTips());
  printLine("rain", checkReedIdle(rainHigh), detail);

  if (wifiIsConnected()) {
    snprintf(detail, sizeof(detail), "RSSI %d dBm", wifiRssi());
    printLine("wifi", CHECK_OK, detail);
  } else {
    printLine("wifi", CHECK_FAIL, "not connected");
  }

  char iso[25];
  if (timeNowIso(iso, sizeof(iso))) {
    printLine("time", CHECK_OK, iso);
  } else {
    printLine("time", CHECK_WARN, "not synced yet");
  }

  Serial.println("[check] (wind/rain: a loose cable also idles HIGH; spin or tip and check the counts go up)");
}

void selfCheckPollSerial() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 's' || c == 'S') {
      selfCheckPrint();
    }
  }
}
