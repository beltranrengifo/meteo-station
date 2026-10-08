#include <unity.h>

#include "rain_math.h"

static constexpr float MM_PER_TIP = 0.2794f;  // same as RAIN_MM_PER_TIP in config.h

void setUp() {}
void tearDown() {}

void test_rain_no_tips_is_zero() {
  TEST_ASSERT_FLOAT_WITHIN(0.0001f, 0.0f, rainMmFromTips(0, MM_PER_TIP));
}

void test_rain_one_tip() {
  TEST_ASSERT_FLOAT_WITHIN(0.0001f, 0.2794f, rainMmFromTips(1, MM_PER_TIP));
}

void test_rain_many_tips() {
  // Torrential 100 mm/h is ~6 tips per minute.
  TEST_ASSERT_FLOAT_WITHIN(0.0001f, 1.6764f, rainMmFromTips(6, MM_PER_TIP));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_rain_no_tips_is_zero);
  RUN_TEST(test_rain_one_tip);
  RUN_TEST(test_rain_many_tips);
  return UNITY_END();
}
