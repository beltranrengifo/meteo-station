#include <math.h>
#include <string.h>
#include <unity.h>

#include "reading.h"

// 2026-10-20T10:15:00Z
static constexpr time_t T_10_15_00 = 1792491300;

static StationReading sampleReading() {
  StationReading r;
  r.deviceId = "meteo-station-1";
  r.ts = T_10_15_00;
  r.tempC = 18.4f;
  r.humidityPct = 62.1f;
  r.pressureHpa = 1016.3f;
  r.windAvgMs = 2.1f;
  r.windGustMs = 4.6f;
  r.windDirDeg = 225.0f;
  r.rainMm = 0.2794f;
  r.rssi = -67;
  r.uptimeS = 86400;
  r.fw = "0.1.0";
  return r;
}

void setUp() {}
void tearDown() {}

// ---- minute alignment ----

void test_minute_floor_drops_seconds() {
  TEST_ASSERT_EQUAL_INT64(T_10_15_00, minuteFloor(T_10_15_00 + 59));
  TEST_ASSERT_EQUAL_INT64(T_10_15_00, minuteFloor(T_10_15_00));
}

void test_next_boundary_is_the_following_minute() {
  TEST_ASSERT_EQUAL_INT64(T_10_15_00 + 60, nextMinuteBoundary(T_10_15_00 + 1));
  TEST_ASSERT_EQUAL_INT64(T_10_15_00 + 60, nextMinuteBoundary(T_10_15_00 + 59));
}

void test_next_boundary_on_exact_minute_skips_ahead() {
  // A reading just taken at 10:15:00 must schedule the next one at 10:16:00, not again now.
  TEST_ASSERT_EQUAL_INT64(T_10_15_00 + 60, nextMinuteBoundary(T_10_15_00));
}

// ---- JSON ----

void test_json_matches_the_payload_format() {
  char out[400];
  int written = formatReadingJson(sampleReading(), out, sizeof(out));
  const char *expected =
      "{\"device_id\":\"meteo-station-1\",\"ts\":\"2026-10-20T10:15:00Z\","
      "\"temp_c\":18.4,\"humidity_pct\":62.1,\"pressure_hpa\":1016.3,"
      "\"wind_avg_ms\":2.10,\"wind_gust_ms\":4.60,\"wind_dir_deg\":225,"
      "\"rain_mm\":0.2794,\"rssi\":-67,\"uptime_s\":86400,\"fw\":\"0.1.0\"}";
  TEST_ASSERT_EQUAL_STRING(expected, out);
  TEST_ASSERT_EQUAL_INT((int)strlen(expected), written);
}

void test_json_failed_bme280_gives_nulls() {
  StationReading r = sampleReading();
  r.tempC = NAN;
  r.humidityPct = NAN;
  r.pressureHpa = NAN;
  char out[400];
  formatReadingJson(r, out, sizeof(out));
  TEST_ASSERT_NOT_NULL(strstr(out, "\"temp_c\":null,\"humidity_pct\":null,\"pressure_hpa\":null,"));
}

void test_json_unknown_direction_is_null() {
  StationReading r = sampleReading();
  r.windDirDeg = NAN;
  char out[400];
  formatReadingJson(r, out, sizeof(out));
  TEST_ASSERT_NOT_NULL(strstr(out, "\"wind_dir_deg\":null,"));
}

void test_json_direction_rounds_and_wraps_to_zero() {
  StationReading r = sampleReading();
  r.windDirDeg = 359.6f;
  char out[400];
  formatReadingJson(r, out, sizeof(out));
  TEST_ASSERT_NOT_NULL(strstr(out, "\"wind_dir_deg\":0,"));
}

void test_json_unknown_rssi_is_null() {
  // Without WiFi there is no signal to measure; 0 dBm would look like a perfect signal.
  StationReading r = sampleReading();
  r.rssi = RSSI_UNKNOWN;
  char out[400];
  formatReadingJson(r, out, sizeof(out));
  TEST_ASSERT_NOT_NULL(strstr(out, "\"rssi\":null,"));
}

void test_json_buffer_too_small_returns_minus_one() {
  char out[50];
  TEST_ASSERT_EQUAL_INT(-1, formatReadingJson(sampleReading(), out, sizeof(out)));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_minute_floor_drops_seconds);
  RUN_TEST(test_next_boundary_is_the_following_minute);
  RUN_TEST(test_next_boundary_on_exact_minute_skips_ahead);
  RUN_TEST(test_json_matches_the_payload_format);
  RUN_TEST(test_json_failed_bme280_gives_nulls);
  RUN_TEST(test_json_unknown_direction_is_null);
  RUN_TEST(test_json_direction_rounds_and_wraps_to_zero);
  RUN_TEST(test_json_unknown_rssi_is_null);
  RUN_TEST(test_json_buffer_too_small_returns_minus_one);
  return UNITY_END();
}
