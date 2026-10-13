#include <unity.h>

#include "pulse_filter.h"

static constexpr uint32_t MIN_LOW_US = 100;
static constexpr uint32_t DEBOUNCE_US = 200000;  // 200 ms

static PulseVerdict edge(PulseFilter &filter, bool pinLow, uint64_t nowUs, uint32_t minLowUs = MIN_LOW_US) {
  return pulseFilterEdge(filter, pinLow, nowUs, minLowUs, DEBOUNCE_US);
}

void setUp() {}
void tearDown() {}

void test_pulse_filter_counts_a_real_tip() {
  PulseFilter filter;
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::None, (int)edge(filter, true, 1000000));
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::Counted, (int)edge(filter, false, 1000600));  // closed 600 us
  TEST_ASSERT_EQUAL_UINT32(600, filter.lastLowUs);
}

void test_pulse_filter_rejects_a_noise_spike() {
  PulseFilter filter;
  edge(filter, true, 1000000);
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::TooShort, (int)edge(filter, false, 1000003));  // 3 us
  TEST_ASSERT_EQUAL_UINT32(3, filter.lastLowUs);
}

void test_pulse_filter_accepts_a_low_at_the_minimum() {
  PulseFilter filter;
  edge(filter, true, 1000000);
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::Counted, (int)edge(filter, false, 1000100));
}

void test_pulse_filter_with_no_minimum_counts_any_closure() {
  PulseFilter filter;
  edge(filter, true, 1000000, 0);
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::Counted, (int)edge(filter, false, 1000000, 0));
}

void test_pulse_filter_ignores_a_rise_with_no_fall_seen() {
  // Pin low at boot (reed closed) and then released: its low time is unknown.
  PulseFilter filter;
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::None, (int)edge(filter, false, 1000000));
}

void test_pulse_filter_ignores_a_second_rise() {
  PulseFilter filter;
  edge(filter, true, 1000000);
  edge(filter, false, 1000600);
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::None, (int)edge(filter, false, 1000700));
}

void test_pulse_filter_times_from_the_latest_fall() {
  // Bounce on closing: the short high in between was missed, so two lows in a row.
  PulseFilter filter;
  edge(filter, true, 1000000);
  edge(filter, true, 1000550);
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::TooShort, (int)edge(filter, false, 1000600));
}

void test_pulse_filter_two_closures_in_one_tip_count_once() {
  // The bench showed two short closures per hand tip: the debounce merges them.
  PulseFilter filter;
  edge(filter, true, 1000000);
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::Counted, (int)edge(filter, false, 1000600));
  edge(filter, true, 1050000);
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::TooSoon, (int)edge(filter, false, 1050600));  // 50 ms later
  edge(filter, true, 1300000);
  TEST_ASSERT_EQUAL_INT((int)PulseVerdict::Counted, (int)edge(filter, false, 1300600));  // next tip
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_pulse_filter_counts_a_real_tip);
  RUN_TEST(test_pulse_filter_rejects_a_noise_spike);
  RUN_TEST(test_pulse_filter_accepts_a_low_at_the_minimum);
  RUN_TEST(test_pulse_filter_with_no_minimum_counts_any_closure);
  RUN_TEST(test_pulse_filter_ignores_a_rise_with_no_fall_seen);
  RUN_TEST(test_pulse_filter_ignores_a_second_rise);
  RUN_TEST(test_pulse_filter_times_from_the_latest_fall);
  RUN_TEST(test_pulse_filter_two_closures_in_one_tip_count_once);
  return UNITY_END();
}
