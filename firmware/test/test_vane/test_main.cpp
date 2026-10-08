#include <math.h>
#include <unity.h>

#include "vane_math.h"

// Same ADC values as VANE_POSITIONS in config.h: N, NE, E, SE, S, SW, W, NW.
static const int VANE_ADC[8] = {800, 2096, 3765, 3245, 2795, 1420, 170, 400};

// Smallest difference between two angles, in degrees (0..180).
static float angleDiff(float a, float b) {
  float d = fmodf(fabsf(a - b), 360.0f);
  return d > 180.0f ? 360.0f - d : d;
}

void setUp() {}
void tearDown() {}

void test_vane_exact_values_map_to_their_position() {
  for (int i = 0; i < 8; i++) {
    TEST_ASSERT_EQUAL_INT(i, vaneNearestIndex(VANE_ADC[i], VANE_ADC, 8));
  }
}

void test_vane_picks_the_closest_position() {
  TEST_ASSERT_EQUAL_INT(6, vaneNearestIndex(280, VANE_ADC, 8));   // W (170) is 110 away, NW (400) is 120
  TEST_ASSERT_EQUAL_INT(7, vaneNearestIndex(290, VANE_ADC, 8));   // NW is closer now
  TEST_ASSERT_EQUAL_INT(2, vaneNearestIndex(4095, VANE_ADC, 8));  // ADC max goes to E
  TEST_ASSERT_EQUAL_INT(6, vaneNearestIndex(0, VANE_ADC, 8));     // ADC min goes to W
}

void test_vane_empty_table_returns_minus_one() {
  TEST_ASSERT_EQUAL_INT(-1, vaneNearestIndex(1000, VANE_ADC, 0));
}

void test_circular_mean_across_north_is_north() {
  const float deg[] = {350.0f, 10.0f};
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, angleDiff(circularMeanDeg(deg, 2), 0.0f));
}

void test_circular_mean_of_two_neighbours() {
  const float deg[] = {90.0f, 180.0f};
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 135.0f, circularMeanDeg(deg, 2));
}

void test_circular_mean_result_is_in_range() {
  const float deg[] = {270.0f, 315.0f};
  float mean = circularMeanDeg(deg, 2);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 292.5f, mean);
  TEST_ASSERT_TRUE(mean >= 0.0f && mean < 360.0f);
}

void test_circular_mean_of_nothing_is_nan() {
  TEST_ASSERT_TRUE(isnan(circularMeanDeg(nullptr, 0)));
}

void test_offset_zero_keeps_direction() {
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 225.0f, applyOffsetDeg(225.0f, 0.0f));
}

void test_offset_wraps_past_north() {
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 10.0f, applyOffsetDeg(350.0f, 20.0f));
}

void test_negative_offset_wraps_below_north() {
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 350.0f, applyOffsetDeg(10.0f, -20.0f));
}

void test_offset_result_never_reaches_360() {
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, applyOffsetDeg(315.0f, 45.0f));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_vane_exact_values_map_to_their_position);
  RUN_TEST(test_vane_picks_the_closest_position);
  RUN_TEST(test_vane_empty_table_returns_minus_one);
  RUN_TEST(test_circular_mean_across_north_is_north);
  RUN_TEST(test_circular_mean_of_two_neighbours);
  RUN_TEST(test_circular_mean_result_is_in_range);
  RUN_TEST(test_circular_mean_of_nothing_is_nan);
  RUN_TEST(test_offset_zero_keeps_direction);
  RUN_TEST(test_offset_wraps_past_north);
  RUN_TEST(test_negative_offset_wraps_below_north);
  RUN_TEST(test_offset_result_never_reaches_360);
  return UNITY_END();
}
