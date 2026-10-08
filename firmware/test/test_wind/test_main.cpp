#include <unity.h>

#include "wind_math.h"

static constexpr float MS_PER_HZ = 0.667f;  // same as WIND_MS_PER_HZ in config.h

void setUp() {}
void tearDown() {}

// ---- windSpeedMs ----

void test_speed_one_pulse_per_second() {
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.667f, windSpeedMs(60, 60.0f, MS_PER_HZ));
}

void test_speed_calm() {
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, windSpeedMs(0, 60.0f, MS_PER_HZ));
}

void test_speed_zero_seconds_is_zero_not_infinity() {
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, windSpeedMs(10, 0.0f, MS_PER_HZ));
}

// ---- windGustMs ----

void test_gust_is_max_three_second_average() {
  const uint16_t perSecond[] = {1, 1, 1, 10, 10, 10, 1, 1};
  // Best 3 s window: 10+10+10 = 30 pulses / 3 s = 10 Hz.
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 10 * MS_PER_HZ, windGustMs(perSecond, 8, 3, MS_PER_HZ));
}

void test_gust_window_slides_one_second_at_a_time() {
  const uint16_t burst[] = {0, 0, 9, 9, 9, 0};
  // Fixed blocks {0,0,9} {9,9,0} would give 6 Hz; sliding finds {9,9,9} = 9 Hz.
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 9 * MS_PER_HZ, windGustMs(burst, 6, 3, MS_PER_HZ));
}

void test_gust_with_fewer_seconds_than_window_uses_all() {
  const uint16_t perSecond[] = {3, 3};
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 3 * MS_PER_HZ, windGustMs(perSecond, 2, 3, MS_PER_HZ));
}

void test_gust_with_no_data_is_zero() {
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, windGustMs(nullptr, 0, 3, MS_PER_HZ));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_speed_one_pulse_per_second);
  RUN_TEST(test_speed_calm);
  RUN_TEST(test_speed_zero_seconds_is_zero_not_infinity);
  RUN_TEST(test_gust_is_max_three_second_average);
  RUN_TEST(test_gust_window_slides_one_second_at_a_time);
  RUN_TEST(test_gust_with_fewer_seconds_than_window_uses_all);
  RUN_TEST(test_gust_with_no_data_is_zero);
  return UNITY_END();
}
