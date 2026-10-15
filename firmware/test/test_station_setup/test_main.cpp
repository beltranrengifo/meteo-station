#include <string.h>
#include <unity.h>

#include "station_setup.h"

static constexpr uint32_t MINUTE_MS = 60000;

void setUp() {}
void tearDown() {}

// ---- device id: same rule as public.devices ----

void test_device_id_accepts_lowercase_digits_and_dashes() {
  TEST_ASSERT_TRUE(isValidDeviceId("meteo-station-bench"));
  TEST_ASSERT_TRUE(isValidDeviceId("meteo-station-1"));
  TEST_ASSERT_TRUE(isValidDeviceId("a"));
}

void test_device_id_rejects_other_characters_and_bad_starts() {
  TEST_ASSERT_FALSE(isValidDeviceId(""));
  TEST_ASSERT_FALSE(isValidDeviceId("Meteo"));
  TEST_ASSERT_FALSE(isValidDeviceId("meteo station"));
  TEST_ASSERT_FALSE(isValidDeviceId("meteo_station"));
  TEST_ASSERT_FALSE(isValidDeviceId("-meteo"));
  TEST_ASSERT_FALSE(isValidDeviceId(nullptr));
}

void test_device_id_is_at_most_64_characters() {
  char id[66];
  memset(id, 'a', 64);
  id[64] = '\0';
  TEST_ASSERT_TRUE(isValidDeviceId(id));
  id[64] = 'a';
  id[65] = '\0';
  TEST_ASSERT_FALSE(isValidDeviceId(id));
}

// ---- device key ----

void test_device_key_accepts_printable_text_without_spaces() {
  TEST_ASSERT_TRUE(isValidDeviceKey("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"));
  TEST_ASSERT_TRUE(isValidDeviceKey("Older-Key_2026.x"));
}

void test_device_key_rejects_empty_spaces_and_too_long() {
  TEST_ASSERT_FALSE(isValidDeviceKey(""));
  TEST_ASSERT_FALSE(isValidDeviceKey(nullptr));
  TEST_ASSERT_FALSE(isValidDeviceKey("with space"));
  TEST_ASSERT_FALSE(isValidDeviceKey("tab\tkey"));
  char key[DEVICE_KEY_MAX_LENGTH + 2];
  memset(key, 'k', DEVICE_KEY_MAX_LENGTH + 1);
  key[DEVICE_KEY_MAX_LENGTH + 1] = '\0';
  TEST_ASSERT_FALSE(isValidDeviceKey(key));
  key[DEVICE_KEY_MAX_LENGTH] = '\0';
  TEST_ASSERT_TRUE(isValidDeviceKey(key));
}

// ---- when the setup portal opens ----

void test_portal_opens_when_the_station_is_not_set_up() {
  PortalState state = {false, false, false, 0};
  TEST_ASSERT_EQUAL(PortalReason::NotSetUp, portalReason(state));
}

void test_portal_opens_when_asked_even_if_connected() {
  PortalState state = {true, true, true, 5 * MINUTE_MS};
  TEST_ASSERT_EQUAL(PortalReason::Asked, portalReason(state));
}

void test_portal_opens_after_10_minutes_trying_wifi_without_ever_connecting() {
  PortalState state = {true, false, false, PORTAL_AFTER_NO_WIFI_MS - 1};
  TEST_ASSERT_EQUAL(PortalReason::None, portalReason(state));
  state.msTryingWifi = PORTAL_AFTER_NO_WIFI_MS;
  TEST_ASSERT_EQUAL(PortalReason::NoWifi, portalReason(state));
}

void test_a_later_outage_never_opens_the_portal() {
  // Connected once since boot: the router is down, not the settings wrong.
  PortalState state = {true, false, true, 60 * MINUTE_MS};
  TEST_ASSERT_EQUAL(PortalReason::None, portalReason(state));
}

void test_portal_for_no_wifi_or_asked_closes_after_10_minutes() {
  TEST_ASSERT_FALSE(portalShouldClose(PortalReason::NoWifi, PORTAL_OPEN_MAX_MS - 1));
  TEST_ASSERT_TRUE(portalShouldClose(PortalReason::NoWifi, PORTAL_OPEN_MAX_MS));
  TEST_ASSERT_TRUE(portalShouldClose(PortalReason::Asked, PORTAL_OPEN_MAX_MS));
}

void test_portal_for_a_station_not_set_up_never_closes() {
  TEST_ASSERT_FALSE(portalShouldClose(PortalReason::NotSetUp, 24 * 60 * MINUTE_MS));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_device_id_accepts_lowercase_digits_and_dashes);
  RUN_TEST(test_device_id_rejects_other_characters_and_bad_starts);
  RUN_TEST(test_device_id_is_at_most_64_characters);
  RUN_TEST(test_device_key_accepts_printable_text_without_spaces);
  RUN_TEST(test_device_key_rejects_empty_spaces_and_too_long);
  RUN_TEST(test_portal_opens_when_the_station_is_not_set_up);
  RUN_TEST(test_portal_opens_when_asked_even_if_connected);
  RUN_TEST(test_portal_opens_after_10_minutes_trying_wifi_without_ever_connecting);
  RUN_TEST(test_a_later_outage_never_opens_the_portal);
  RUN_TEST(test_portal_for_no_wifi_or_asked_closes_after_10_minutes);
  RUN_TEST(test_portal_for_a_station_not_set_up_never_closes);
  return UNITY_END();
}
