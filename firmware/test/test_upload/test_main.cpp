#include <math.h>
#include <string.h>
#include <unity.h>

#include "reading_buffer.h"
#include "upload_policy.h"

// 2026-10-20T10:15:00Z
static constexpr time_t T0 = 1792491300;

static StationReading readingAt(time_t ts) {
  StationReading r;
  r.deviceId = "meteo-station-1";
  r.ts = ts;
  r.tempC = 18.4f;
  r.humidityPct = 62.1f;
  r.pressureHpa = 1016.3f;
  r.windAvgMs = 2.1f;
  r.windGustMs = 4.6f;
  r.windDirDeg = 225.0f;
  r.rainMm = 0.0f;
  r.rssi = -67;
  r.uptimeS = 100;
  r.fw = "0.1.0";
  return r;
}

void setUp() {}
void tearDown() {}

// ---- ReadingBuffer ----

void test_buffer_starts_empty() {
  StationReading storage[3];
  ReadingBuffer buffer(storage, 3);
  TEST_ASSERT_TRUE(buffer.empty());
  TEST_ASSERT_EQUAL_INT(0, buffer.size());
}

void test_buffer_keeps_order_oldest_first() {
  StationReading storage[3];
  ReadingBuffer buffer(storage, 3);
  buffer.push(readingAt(T0));
  buffer.push(readingAt(T0 + 60));
  TEST_ASSERT_EQUAL_INT(2, buffer.size());
  TEST_ASSERT_EQUAL_INT64(T0, buffer.at(0).ts);
  TEST_ASSERT_EQUAL_INT64(T0 + 60, buffer.at(1).ts);
}

void test_buffer_full_drops_oldest_and_counts_it() {
  StationReading storage[3];
  ReadingBuffer buffer(storage, 3);
  for (int i = 0; i < 5; i++) {
    buffer.push(readingAt(T0 + i * 60));
  }
  TEST_ASSERT_EQUAL_INT(3, buffer.size());
  TEST_ASSERT_EQUAL_INT64(T0 + 2 * 60, buffer.at(0).ts);  // the two oldest were dropped
  TEST_ASSERT_EQUAL_INT64(T0 + 4 * 60, buffer.at(2).ts);
  TEST_ASSERT_EQUAL_UINT32(2, buffer.dropped());
}

void test_buffer_pop_front_removes_delivered_readings() {
  StationReading storage[3];
  ReadingBuffer buffer(storage, 3);
  for (int i = 0; i < 3; i++) {
    buffer.push(readingAt(T0 + i * 60));
  }
  buffer.popFront(2);
  TEST_ASSERT_EQUAL_INT(1, buffer.size());
  TEST_ASSERT_EQUAL_INT64(T0 + 2 * 60, buffer.at(0).ts);
  buffer.popFront(5);  // more than stored: just empties it
  TEST_ASSERT_TRUE(buffer.empty());
}

void test_buffer_wraps_around_the_storage() {
  StationReading storage[3];
  ReadingBuffer buffer(storage, 3);
  for (int i = 0; i < 3; i++) {
    buffer.push(readingAt(T0 + i * 60));
  }
  buffer.popFront(2);
  buffer.push(readingAt(T0 + 3 * 60));
  buffer.push(readingAt(T0 + 4 * 60));
  TEST_ASSERT_EQUAL_INT(3, buffer.size());
  TEST_ASSERT_EQUAL_INT64(T0 + 2 * 60, buffer.at(0).ts);
  TEST_ASSERT_EQUAL_INT64(T0 + 4 * 60, buffer.at(2).ts);
}

// ---- formatBatchJson ----

void test_batch_is_a_json_array_of_the_oldest_readings() {
  StationReading storage[3];
  ReadingBuffer buffer(storage, 3);
  for (int i = 0; i < 3; i++) {
    buffer.push(readingAt(T0 + i * 60));
  }
  char out[2000];
  int written = formatBatchJson(buffer, 2, out, sizeof(out));
  TEST_ASSERT_TRUE(written > 0);
  TEST_ASSERT_EQUAL_CHAR('[', out[0]);
  TEST_ASSERT_EQUAL_CHAR(']', out[written - 1]);
  TEST_ASSERT_NOT_NULL(strstr(out, "\"ts\":\"2026-10-20T10:15:00Z\""));
  TEST_ASSERT_NOT_NULL(strstr(out, "},{"));
  TEST_ASSERT_NULL(strstr(out, "\"ts\":\"2026-10-20T10:17:00Z\""));  // only 2 of 3
}

void test_batch_too_big_for_buffer_returns_minus_one() {
  StationReading storage[3];
  ReadingBuffer buffer(storage, 3);
  buffer.push(readingAt(T0));
  char out[100];
  TEST_ASSERT_EQUAL_INT(-1, formatBatchJson(buffer, 1, out, sizeof(out)));
}

// ---- upload policy ----

void test_success_delivers_the_batch() {
  TEST_ASSERT_EQUAL_INT((int)UploadOutcome::Delivered, (int)classifyResponse(200));
}

void test_bad_request_drops_the_batch_instead_of_blocking_forever() {
  TEST_ASSERT_EQUAL_INT((int)UploadOutcome::Rejected, (int)classifyResponse(400));
  TEST_ASSERT_EQUAL_INT((int)UploadOutcome::Rejected, (int)classifyResponse(413));
}

void test_network_auth_and_server_errors_are_retried() {
  TEST_ASSERT_EQUAL_INT((int)UploadOutcome::Retry, (int)classifyResponse(-1));   // no connection
  TEST_ASSERT_EQUAL_INT((int)UploadOutcome::Retry, (int)classifyResponse(401));  // wrong key: fix and keep data
  TEST_ASSERT_EQUAL_INT((int)UploadOutcome::Retry, (int)classifyResponse(429));
  TEST_ASSERT_EQUAL_INT((int)UploadOutcome::Retry, (int)classifyResponse(500));
  TEST_ASSERT_EQUAL_INT((int)UploadOutcome::Retry, (int)classifyResponse(503));
}

void test_backoff_doubles_up_to_five_minutes() {
  TEST_ASSERT_EQUAL_UINT32(10000, nextBackoffMs(0));
  TEST_ASSERT_EQUAL_UINT32(20000, nextBackoffMs(10000));
  TEST_ASSERT_EQUAL_UINT32(300000, nextBackoffMs(160000));
  TEST_ASSERT_EQUAL_UINT32(300000, nextBackoffMs(300000));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_buffer_starts_empty);
  RUN_TEST(test_buffer_keeps_order_oldest_first);
  RUN_TEST(test_buffer_full_drops_oldest_and_counts_it);
  RUN_TEST(test_buffer_pop_front_removes_delivered_readings);
  RUN_TEST(test_buffer_wraps_around_the_storage);
  RUN_TEST(test_batch_is_a_json_array_of_the_oldest_readings);
  RUN_TEST(test_batch_too_big_for_buffer_returns_minus_one);
  RUN_TEST(test_success_delivers_the_batch);
  RUN_TEST(test_bad_request_drops_the_batch_instead_of_blocking_forever);
  RUN_TEST(test_network_auth_and_server_errors_are_retried);
  RUN_TEST(test_backoff_doubles_up_to_five_minutes);
  return UNITY_END();
}
