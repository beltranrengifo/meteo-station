#pragma once

#include <stddef.h>
#include <stdint.h>
#include <time.h>

// Value for StationReading::rssi when there is no WiFi (sent as null).
constexpr int RSSI_UNKNOWN = INT32_MIN;

// One-minute station reading. Pure code: no Arduino dependency, so it runs in native unit tests.
struct StationReading {
  const char *deviceId;
  time_t ts;           // UTC, minute boundary at the end of the period
  float tempC;         // NAN if the BME280 failed
  float humidityPct;   // NAN if the BME280 failed
  float pressureHpa;   // NAN if the BME280 failed
  float windAvgMs;
  float windGustMs;
  float windDirDeg;    // NAN if unknown
  float rainMm;        // rain of this minute only, never a running total
  int rssi;            // RSSI_UNKNOWN without WiFi
  uint32_t uptimeS;
  const char *fw;
};

// Start of the minute that contains t.
time_t minuteFloor(time_t t);

// First minute boundary strictly after t.
time_t nextMinuteBoundary(time_t t);

// Writes the reading as one JSON object (the ingest payload format). NAN values become null.
// Returns the number of characters written, or -1 if `out` is too small.
int formatReadingJson(const StationReading &reading, char *out, size_t size);
