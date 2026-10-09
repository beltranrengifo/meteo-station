#pragma once

#include <Arduino.h>

// ---- Device ----
#define DEVICE_ID "meteo-station-bench"
#define FW_VERSION "0.1.0"

// ---- Pins (validated on the bench) ----
constexpr int PIN_I2C_SDA = 21;
constexpr int PIN_I2C_SCL = 22;
constexpr int PIN_ANEMOMETER = 32;  // external 10k pull-up to 3V3, FALLING interrupt
constexpr int PIN_RAIN = 33;        // external 10k pull-up to 3V3, FALLING interrupt
constexpr int PIN_VANE = 34;        // ADC1, 10k divider to GND
constexpr int PIN_STATUS_LED = 2;   // onboard blue LED (LED_BUILTIN is not defined)

// ---- Sensors ----
constexpr uint8_t BME280_I2C_ADDRESS = 0x77;

// ---- Timing ----
constexpr uint32_t READING_INTERVAL_MS = 60UL * 1000UL;  // one reading per minute
constexpr uint32_t GUST_WINDOW_S = 3;                    // gust = max of 3 s averages
constexpr uint32_t VANE_SAMPLE_INTERVAL_MS = 5000;       // sample the vane every few seconds
constexpr int VANE_ADC_SAMPLES = 20;                     // ADC reads averaged per vane sample
constexpr int VANE_DISCONNECTED_ADC = 80;                // below this the vane is not connected (W, the lowest, is 170)

// ---- Upload ----
constexpr int BUFFER_CAPACITY = 1440;           // readings kept in RAM while offline (24 h)
constexpr int UPLOAD_BATCH_MAX = 30;            // readings per POST (~8 KB of JSON)
constexpr uint32_t HTTP_TIMEOUT_MS = 10000;
constexpr uint32_t WATCHDOG_TIMEOUT_S = 60;     // reboot if loop() hangs this long

// ---- Debounce (ms) ----
constexpr uint32_t ANEMOMETER_DEBOUNCE_MS = 5;  // ~62 pulses/s at 150 km/h; reed bounce is 0.5-1 ms
constexpr uint32_t RAIN_DEBOUNCE_MS = 200;      // spec value; a tip every 10 s at 100 mm/h, so a long filter is safe

// ---- Calibration ----
constexpr float RAIN_MM_PER_TIP = 0.2794f;      // SparkFun SEN-15901 datasheet
constexpr float WIND_MS_PER_HZ = 0.667f;        // 1 pulse/s = 2.4 km/h = 0.667 m/s
constexpr float VANE_OFFSET_DEG = 0.0f;         // set after orienting the vane on the mast

// Vane: only 8 directions are reliably distinguishable.
// ADC values are 12-bit, measured with a 10k divider at 3.3 V.
// "N" is the mark engraved on the vane base. Minimum gap between positions: 230 (W-NW).
struct VanePosition {
  int adc;
  float degrees;
  const char *name;
};

constexpr int VANE_POSITION_COUNT = 8;
constexpr VanePosition VANE_POSITIONS[VANE_POSITION_COUNT] = {
    {800, 0.0f, "N"},
    {2096, 45.0f, "NE"},
    {3765, 90.0f, "E"},
    {3245, 135.0f, "SE"},
    {2795, 180.0f, "S"},
    {1420, 225.0f, "SW"},
    {170, 270.0f, "W"},
    {400, 315.0f, "NW"},
};
