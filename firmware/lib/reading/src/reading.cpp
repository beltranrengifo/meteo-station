#include "reading.h"

#include <math.h>
#include <stdarg.h>
#include <stdio.h>

time_t minuteFloor(time_t t) { return t - (t % 60); }

time_t nextMinuteBoundary(time_t t) { return minuteFloor(t) + 60; }

namespace {

// Appends formatted text to a fixed buffer and remembers if it ever ran out of space.
struct JsonWriter {
  char *out;
  size_t size;
  size_t length;
  bool overflow;

  void append(const char *format, ...) {
    if (overflow) {
      return;
    }
    va_list args;
    va_start(args, format);
    int n = vsnprintf(out + length, size - length, format, args);
    va_end(args);
    if (n < 0 || (size_t)n >= size - length) {
      overflow = true;
      return;
    }
    length += n;
  }

  // Number with fixed decimals, or null when the value is missing.
  void number(const char *key, float value, int decimals) {
    if (isnan(value)) {
      append("\"%s\":null,", key);
    } else {
      append("\"%s\":%.*f,", key, decimals, value);
    }
  }
};

}  // namespace

int formatReadingJson(const StationReading &reading, char *out, size_t size) {
  if (size == 0) {
    return -1;
  }
  JsonWriter json = {out, size, 0, false};

  char ts[25];
  struct tm utc;
  gmtime_r(&reading.ts, &utc);
  strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", &utc);

  json.append("{\"device_id\":\"%s\",\"ts\":\"%s\",", reading.deviceId, ts);
  json.number("temp_c", reading.tempC, 1);
  json.number("humidity_pct", reading.humidityPct, 1);
  json.number("pressure_hpa", reading.pressureHpa, 1);
  json.number("wind_avg_ms", reading.windAvgMs, 2);
  json.number("wind_gust_ms", reading.windGustMs, 2);
  if (isnan(reading.windDirDeg)) {
    json.append("\"wind_dir_deg\":null,");
  } else {
    json.append("\"wind_dir_deg\":%d,", (int)lroundf(reading.windDirDeg) % 360);
  }
  json.number("rain_mm", reading.rainMm, 4);
  if (reading.rssi == RSSI_UNKNOWN) {
    json.append("\"rssi\":null,");
  } else {
    json.append("\"rssi\":%d,", reading.rssi);
  }
  json.append("\"uptime_s\":%lu,\"fw\":\"%s\"}", (unsigned long)reading.uptimeS, reading.fw);

  if (json.overflow) {
    out[0] = '\0';
    return -1;
  }
  return (int)json.length;
}
