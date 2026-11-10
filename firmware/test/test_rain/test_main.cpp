#include <unity.h>

#include "rain_math.h"

static constexpr float MM_PER_TIP = 0.2794f;  // same as RAIN_MM_PER_TIP in config.h
static constexpr uint32_t MAX_TIPS = 10;      // same as RAIN_MAX_TIPS_PER_MINUTE
static constexpr uint32_t MAX_SHORT_GAPS = 1; // same as RAIN_MAX_SHORT_GAPS

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

void test_noise_quiet_minute_is_rain() {
  TEST_ASSERT_FALSE(rainLooksLikeNoise(0, 0, MAX_TIPS, MAX_SHORT_GAPS));
}

void test_noise_cloudburst_at_the_limit_is_rain() {
  TEST_ASSERT_FALSE(rainLooksLikeNoise(10, 0, MAX_TIPS, MAX_SHORT_GAPS));
}

void test_noise_more_tips_than_a_cloudburst() {
  // 2026-11-10 on the mast: up to 172 tips in one minute.
  TEST_ASSERT_TRUE(rainLooksLikeNoise(11, 0, MAX_TIPS, MAX_SHORT_GAPS));
}

void test_noise_one_short_gap_is_tolerated() {
  // The bucket may rock back once after a tip.
  TEST_ASSERT_FALSE(rainLooksLikeNoise(3, 1, MAX_TIPS, MAX_SHORT_GAPS));
}

void test_noise_tips_faster_than_the_bucket_fills() {
  TEST_ASSERT_TRUE(rainLooksLikeNoise(3, 2, MAX_TIPS, MAX_SHORT_GAPS));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_rain_no_tips_is_zero);
  RUN_TEST(test_rain_one_tip);
  RUN_TEST(test_rain_many_tips);
  RUN_TEST(test_noise_quiet_minute_is_rain);
  RUN_TEST(test_noise_cloudburst_at_the_limit_is_rain);
  RUN_TEST(test_noise_more_tips_than_a_cloudburst);
  RUN_TEST(test_noise_one_short_gap_is_tolerated);
  RUN_TEST(test_noise_tips_faster_than_the_bucket_fills);
  return UNITY_END();
}
