#include <unity.h>

#include "debounce.h"

void setUp() {}
void tearDown() {}

void test_debounce_rejects_pulse_inside_window() {
  TEST_ASSERT_FALSE(debounceAccept(1004, 1000, 5));
}

void test_debounce_accepts_pulse_at_window_edge() {
  TEST_ASSERT_TRUE(debounceAccept(1005, 1000, 5));
}

void test_debounce_accepts_pulse_after_window() {
  TEST_ASSERT_TRUE(debounceAccept(1086, 1000, 5));  // 100 km/h: one pulse every ~86 ms
}

void test_debounce_survives_millis_overflow() {
  // millis() wraps after ~49 days: last pulse just before the wrap, new one just after.
  TEST_ASSERT_TRUE(debounceAccept(0x00000010u, 0xFFFFFFF0u, 5));   // 32 ms apart
  TEST_ASSERT_FALSE(debounceAccept(0x00000001u, 0xFFFFFFFEu, 5));  // 3 ms apart
}

void test_debounce_long_window_for_rain() {
  // A slow tip bounces for tens of ms: all of it must collapse into one pulse.
  TEST_ASSERT_FALSE(debounceAccept(1150, 1000, 200));
  TEST_ASSERT_TRUE(debounceAccept(1200, 1000, 200));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_debounce_rejects_pulse_inside_window);
  RUN_TEST(test_debounce_accepts_pulse_at_window_edge);
  RUN_TEST(test_debounce_accepts_pulse_after_window);
  RUN_TEST(test_debounce_survives_millis_overflow);
  RUN_TEST(test_debounce_long_window_for_rain);
  return UNITY_END();
}
