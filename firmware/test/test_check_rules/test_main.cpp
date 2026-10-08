#include <math.h>
#include <unity.h>

#include "check_rules.h"

void setUp() {}
void tearDown() {}

// ---- BME280 ----

void test_bme280_normal_values_ok() {
  TEST_ASSERT_EQUAL_INT(CHECK_OK, checkBme280(23.1f, 58.0f, 942.3f));
}

void test_bme280_no_response_fails() {
  TEST_ASSERT_EQUAL_INT(CHECK_FAIL, checkBme280(NAN, NAN, NAN));
}

void test_bme280_values_outside_sensor_range_fail() {
  TEST_ASSERT_EQUAL_INT(CHECK_FAIL, checkBme280(90.0f, 58.0f, 942.3f));   // temp max 85 C
  TEST_ASSERT_EQUAL_INT(CHECK_FAIL, checkBme280(23.1f, 101.0f, 942.3f));  // humidity max 100 %
  TEST_ASSERT_EQUAL_INT(CHECK_FAIL, checkBme280(23.1f, 58.0f, 200.0f));   // pressure min 300 hPa
}

// ---- Vane ----

void test_vane_lowest_real_position_ok() {
  TEST_ASSERT_EQUAL_INT(CHECK_OK, checkVaneAdc(170, 80));  // W, the lowest calibrated value
}

void test_vane_near_zero_means_disconnected() {
  // Without the vane, the 10k resistor pulls GPIO 34 to GND.
  TEST_ASSERT_EQUAL_INT(CHECK_FAIL, checkVaneAdc(0, 80));
  TEST_ASSERT_EQUAL_INT(CHECK_FAIL, checkVaneAdc(79, 80));
}

void test_vane_at_threshold_ok() {
  TEST_ASSERT_EQUAL_INT(CHECK_OK, checkVaneAdc(80, 80));
}

// ---- Reed switches (anemometer, rain gauge) ----

void test_reed_idle_high_ok() {
  TEST_ASSERT_EQUAL_INT(CHECK_OK, checkReedIdle(true));
}

void test_reed_idle_low_warns() {
  // Short circuit, or the magnet resting right on the reed: worth a look, not a hard failure.
  TEST_ASSERT_EQUAL_INT(CHECK_WARN, checkReedIdle(false));
}

// ---- Names ----

void test_status_names() {
  TEST_ASSERT_EQUAL_STRING("OK", checkStatusName(CHECK_OK));
  TEST_ASSERT_EQUAL_STRING("WARN", checkStatusName(CHECK_WARN));
  TEST_ASSERT_EQUAL_STRING("FAIL", checkStatusName(CHECK_FAIL));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_bme280_normal_values_ok);
  RUN_TEST(test_bme280_no_response_fails);
  RUN_TEST(test_bme280_values_outside_sensor_range_fail);
  RUN_TEST(test_vane_lowest_real_position_ok);
  RUN_TEST(test_vane_near_zero_means_disconnected);
  RUN_TEST(test_vane_at_threshold_ok);
  RUN_TEST(test_reed_idle_high_ok);
  RUN_TEST(test_reed_idle_low_warns);
  RUN_TEST(test_status_names);
  return UNITY_END();
}
