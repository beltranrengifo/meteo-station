#include <stdio.h>
#include <string.h>
#include <unity.h>

#include "event_log.h"

// 2026-10-20T10:15:00Z
static constexpr time_t T_10_15_00 = 1792491300;

static EventLog events;

void setUp() { events = EventLog(); }
void tearDown() {}

void test_starts_empty() {
  TEST_ASSERT_TRUE(events.empty());
  TEST_ASSERT_EQUAL_INT(0, events.size());
}

void test_keeps_events_oldest_first() {
  events.push(1000, "boot", "fw 0.4.0, reset power_on");
  events.push(5000, "wifi", "connected, RSSI -64 dBm");
  TEST_ASSERT_EQUAL_INT(2, events.size());
  TEST_ASSERT_EQUAL_STRING("boot", events.at(0).kind);
  TEST_ASSERT_EQUAL_STRING("connected, RSSI -64 dBm", events.at(1).message);
  TEST_ASSERT_EQUAL_UINT32(5000, events.at(1).atMs);
}

void test_cuts_long_kinds_and_messages() {
  char message[EVENT_MESSAGE_MAX_LENGTH + 50];
  memset(message, 'm', sizeof(message) - 1);
  message[sizeof(message) - 1] = '\0';
  events.push(0, "a_kind_longer_than_sixteen", message);
  TEST_ASSERT_EQUAL_INT(EVENT_KIND_MAX_LENGTH, strlen(events.at(0).kind));
  TEST_ASSERT_EQUAL_INT(EVENT_MESSAGE_MAX_LENGTH, strlen(events.at(0).message));
}

void test_when_full_drops_the_oldest_and_counts_it() {
  for (int i = 0; i < EVENT_LOG_CAPACITY + 3; i++) {
    events.push(i, "wifi", "lost");
  }
  TEST_ASSERT_EQUAL_INT(EVENT_LOG_CAPACITY, events.size());
  TEST_ASSERT_EQUAL_UINT32(3, events.at(0).atMs);
  TEST_ASSERT_EQUAL_UINT32(3, events.takeDropped());
  TEST_ASSERT_EQUAL_UINT32(0, events.takeDropped());
}

void test_pop_front_removes_the_delivered_events() {
  events.push(1, "boot", "");
  events.push(2, "wifi", "");
  events.push(3, "ota", "");
  events.popFront(2);
  TEST_ASSERT_EQUAL_INT(1, events.size());
  TEST_ASSERT_EQUAL_STRING("ota", events.at(0).kind);
  events.popFront(5);
  TEST_ASSERT_TRUE(events.empty());
}

void test_json_dates_events_back_from_the_clock() {
  events.push(2000, "boot", "fw 0.4.0, reset power_on");
  events.push(62500, "wifi", "connected");
  char out[400];
  // At millis 65000 the clock reads 10:15:00: boot was 63 s earlier, WiFi 2.5 s earlier.
  int written = formatEventsJson(events, 2, T_10_15_00, 65000, out, sizeof(out));
  const char *expected =
      "[{\"ts\":\"2026-10-20T10:13:57Z\",\"kind\":\"boot\",\"message\":\"fw 0.4.0, reset power_on\"},"
      "{\"ts\":\"2026-10-20T10:14:58Z\",\"kind\":\"wifi\",\"message\":\"connected\"}]";
  TEST_ASSERT_EQUAL_STRING(expected, out);
  TEST_ASSERT_EQUAL_INT((int)strlen(expected), written);
}

void test_json_survives_the_millis_wrap() {
  events.push(0xFFFFF000u, "wifi", "lost");  // 4096 ms before the wrap
  char out[200];
  formatEventsJson(events, 1, T_10_15_00, 904, out, sizeof(out));  // 5 s later
  TEST_ASSERT_NOT_NULL(strstr(out, "\"ts\":\"2026-10-20T10:14:55Z\""));
}

void test_json_escapes_quotes() {
  events.push(0, "setup", "saved \"meteo\\x\"");
  char out[200];
  formatEventsJson(events, 1, T_10_15_00, 0, out, sizeof(out));
  TEST_ASSERT_NOT_NULL(strstr(out, "\"message\":\"saved \\\"meteo\\\\x\\\"\""));
}

void test_json_only_the_oldest_count_and_empty_array() {
  char out[200];
  TEST_ASSERT_EQUAL_INT(2, formatEventsJson(events, 5, T_10_15_00, 0, out, sizeof(out)));
  TEST_ASSERT_EQUAL_STRING("[]", out);
  events.push(0, "boot", "");
  events.push(0, "wifi", "");
  formatEventsJson(events, 1, T_10_15_00, 0, out, sizeof(out));
  TEST_ASSERT_NULL(strstr(out, "wifi"));
}

void test_json_too_big_returns_minus_one() {
  events.push(0, "boot", "fw 0.4.0, reset power_on");
  char out[20];
  TEST_ASSERT_EQUAL_INT(-1, formatEventsJson(events, 1, T_10_15_00, 0, out, sizeof(out)));
  TEST_ASSERT_EQUAL_STRING("", out);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_starts_empty);
  RUN_TEST(test_keeps_events_oldest_first);
  RUN_TEST(test_cuts_long_kinds_and_messages);
  RUN_TEST(test_when_full_drops_the_oldest_and_counts_it);
  RUN_TEST(test_pop_front_removes_the_delivered_events);
  RUN_TEST(test_json_dates_events_back_from_the_clock);
  RUN_TEST(test_json_survives_the_millis_wrap);
  RUN_TEST(test_json_escapes_quotes);
  RUN_TEST(test_json_only_the_oldest_count_and_empty_array);
  RUN_TEST(test_json_too_big_returns_minus_one);
  return UNITY_END();
}
