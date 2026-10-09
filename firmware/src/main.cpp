#include <Arduino.h>
#include <esp_task_wdt.h>
#include <reading.h>

#include "config.h"
#include "diagnostics/self_check.h"
#include "net/time_sync.h"
#include "net/uploader.h"
#include "net/wifi_connection.h"
#include "sensors/anemometer.h"
#include "sensors/bme280_sensor.h"
#include "sensors/rain_gauge.h"
#include "sensors/wind_vane.h"

// Next minute boundary (UTC) at which a reading is due. 0 until the clock is valid.
static time_t nextReadingAt = 0;

// Drops whatever the sensors counted so far, so the next period starts clean.
static void resetSensorPeriods() {
  anemometerTakeSummary();
  rainGaugeTakeSummary();
  windVaneTakeSummary();
}

static void emitReading(time_t ts) {
  Bme280Reading bme = bme280Read();
  WindSummary wind = anemometerTakeSummary();
  RainSummary rain = rainGaugeTakeSummary();
  VaneSummary vane = windVaneTakeSummary();

  StationReading reading;
  reading.deviceId = DEVICE_ID;
  reading.ts = ts;
  reading.tempC = bme.tempC;
  reading.humidityPct = bme.humidityPct;
  reading.pressureHpa = bme.pressureHpa;
  reading.windAvgMs = wind.avgMs;
  reading.windGustMs = wind.gustMs;
  reading.windDirDeg = vane.meanDeg;
  reading.rainMm = rain.mm;
  reading.rssi = wifiIsConnected() ? wifiRssi() : RSSI_UNKNOWN;
  reading.uptimeS = millis() / 1000;
  reading.fw = FW_VERSION;

  char json[400];
  if (formatReadingJson(reading, json, sizeof(json)) < 0) {
    Serial.println("[reading] JSON buffer too small");
    return;
  }
  Serial.printf("[reading] %s\n", json);
  uploaderEnqueue(reading);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\n%s fw %s\n", DEVICE_ID, FW_VERSION);

  // Reboots the board if loop() stops running for WATCHDOG_TIMEOUT_S (a hang, never a slow upload).
  esp_task_wdt_init(WATCHDOG_TIMEOUT_S, true);
  esp_task_wdt_add(nullptr);

  pinMode(PIN_STATUS_LED, OUTPUT);
  wifiBegin();
  timeBegin();
  bme280Begin();
  anemometerBegin();
  rainGaugeBegin();
  windVaneBegin();
  uploaderBegin();

  selfCheckPrint();
  Serial.println("Type 's' for a sensor self-check.");
}

void loop() {
  esp_task_wdt_reset();
  wifiLoop();
  timeLoop();
  windVaneTick();
  selfCheckPollSerial();
  uploaderLoop();

  // LED: solid when connected, blinking while not.
  bool led = wifiIsConnected() || (millis() / 250) % 2 == 0;
  digitalWrite(PIN_STATUS_LED, led ? HIGH : LOW);

  // Never emit readings without a valid UTC time.
  if (!timeIsValid()) {
    return;
  }
  time_t now = time(nullptr);

  if (nextReadingAt == 0) {
    // First valid time: drop what was counted before (no timestamp for it) and emit at the next boundary.
    // That first reading covers less than a minute; wind averages use the real seconds counted.
    nextReadingAt = nextMinuteBoundary(now);
    resetSensorPeriods();
    Serial.printf("[reading] clock valid, first reading in %ld s\n", (long)(nextReadingAt - now));
    return;
  }

  if (now >= nextReadingAt) {
    // Label with the boundary just passed (if loop() ran late, the latest one).
    emitReading(minuteFloor(now));
    nextReadingAt = nextMinuteBoundary(now);
  }
}
