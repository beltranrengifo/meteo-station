#include <stdio.h>
#include <string.h>
#include <unity.h>

#include "ota_policy.h"

static constexpr uint32_t MINUTE_MS = 60000;
static const char *SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
static const char *URL = "https://ref.supabase.co/storage/v1/object/sign/firmware/0.3.0.bin?token=abc";

static UpdateOffer offer;

void setUp() { memset(&offer, 0, sizeof(offer)); }
void tearDown() {}

static void makeBody(char *body, size_t size, const char *version, const char *url, const char *sha256,
                     const char *sizeJson) {
  snprintf(body, size,
           "{\"accepted\":1,\"rejected\":[],\"update\":{\"version\":\"%s\",\"url\":\"%s\",\"sha256\":\"%s\","
           "\"size\":%s}}",
           version, url, sha256, sizeJson);
}

// ---- reading the offer ----

void test_reads_a_valid_offer() {
  char body[512];
  makeBody(body, sizeof(body), "0.3.0", URL, SHA, "1093353");
  TEST_ASSERT_TRUE(parseUpdateOffer(body, offer));
  TEST_ASSERT_EQUAL_STRING("0.3.0", offer.version);
  TEST_ASSERT_EQUAL_STRING(URL, offer.url);
  TEST_ASSERT_EQUAL_STRING(SHA, offer.sha256);
  TEST_ASSERT_EQUAL_UINT32(1093353, offer.size);
}

void test_no_offer_in_a_plain_response() {
  TEST_ASSERT_FALSE(parseUpdateOffer("{\"accepted\":1,\"rejected\":[]}", offer));
  TEST_ASSERT_FALSE(parseUpdateOffer("not json", offer));
  TEST_ASSERT_FALSE(parseUpdateOffer("", offer));
  TEST_ASSERT_FALSE(parseUpdateOffer(nullptr, offer));
}

void test_rejects_bad_versions() {
  const char *bad[] = {"", "0.3", "0.3.0.1", "v0.3.0", "0..3", "0.3.", "1234567.1234567.1"};
  char body[512];
  for (const char *version : bad) {
    makeBody(body, sizeof(body), version, URL, SHA, "1000");
    TEST_ASSERT_FALSE_MESSAGE(parseUpdateOffer(body, offer), version);
  }
}

void test_rejects_plain_http_and_bad_sha256() {
  char body[512];
  makeBody(body, sizeof(body), "0.3.0", "http://ref.supabase.co/x.bin", SHA, "1000");
  TEST_ASSERT_FALSE(parseUpdateOffer(body, offer));
  makeBody(body, sizeof(body), "0.3.0", URL, "0123456789ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef", "1000");
  TEST_ASSERT_FALSE(parseUpdateOffer(body, offer));
  makeBody(body, sizeof(body), "0.3.0", URL, "abc", "1000");
  TEST_ASSERT_FALSE(parseUpdateOffer(body, offer));
}

void test_rejects_bad_sizes() {
  char body[512];
  const char *bad[] = {"0", "-1", "\"1000\"", "1.5"};
  for (const char *size : bad) {
    makeBody(body, sizeof(body), "0.3.0", URL, SHA, size);
    TEST_ASSERT_FALSE_MESSAGE(parseUpdateOffer(body, offer), size);
  }
}

void test_rejects_a_url_too_long_for_the_buffer() {
  static char url[OTA_URL_MAX_LENGTH + 1];
  memset(url, 'a', OTA_URL_MAX_LENGTH);
  memcpy(url, "https://", 8);
  url[OTA_URL_MAX_LENGTH] = '\0';
  static char body[OTA_URL_MAX_LENGTH + 256];
  makeBody(body, sizeof(body), "0.3.0", url, SHA, "1000");
  TEST_ASSERT_FALSE(parseUpdateOffer(body, offer));
}

// ---- whether to install it ----

static UpdateOffer offerFor(const char *version) {
  UpdateOffer result = {};
  strcpy(result.version, version);
  return result;
}

void test_installs_a_version_other_than_the_running_one() {
  OtaMemory memory = {"", "", 0};
  TEST_ASSERT_EQUAL(OfferDecision::Install, decideOffer(offerFor("0.3.0"), "0.2.0", memory));
  // Going back to an older version is allowed: the server picks the target.
  TEST_ASSERT_EQUAL(OfferDecision::Install, decideOffer(offerFor("0.1.2"), "0.2.0", memory));
}

void test_skips_the_running_version() {
  OtaMemory memory = {"", "", 0};
  TEST_ASSERT_EQUAL(OfferDecision::AlreadyRunning, decideOffer(offerFor("0.2.0"), "0.2.0", memory));
}

void test_never_retries_a_version_that_rolled_back() {
  OtaMemory memory = {"0.3.0", "", 0};
  TEST_ASSERT_EQUAL(OfferDecision::FailedBefore, decideOffer(offerFor("0.3.0"), "0.2.0", memory));
  TEST_ASSERT_EQUAL(OfferDecision::Install, decideOffer(offerFor("0.3.1"), "0.2.0", memory));
}

void test_waits_an_hour_after_a_failed_download() {
  OtaMemory memory = {"", "0.3.0", OTA_RETRY_AFTER_MS - 1};
  TEST_ASSERT_EQUAL(OfferDecision::WaitRetry, decideOffer(offerFor("0.3.0"), "0.2.0", memory));
  memory.msSinceAttempt = OTA_RETRY_AFTER_MS;
  TEST_ASSERT_EQUAL(OfferDecision::Install, decideOffer(offerFor("0.3.0"), "0.2.0", memory));
  // Another version is not held back by that failure.
  memory.msSinceAttempt = MINUTE_MS;
  TEST_ASSERT_EQUAL(OfferDecision::Install, decideOffer(offerFor("0.3.1"), "0.2.0", memory));
}

// ---- boot after an update ----

void test_boot_without_an_update_is_normal() {
  TEST_ASSERT_EQUAL(BootOutcome::Normal, bootOutcome("", "0.2.0"));
  TEST_ASSERT_EQUAL(BootOutcome::Normal, bootOutcome(nullptr, "0.2.0"));
}

void test_first_boot_of_the_installed_version_is_verifying() {
  TEST_ASSERT_EQUAL(BootOutcome::Verifying, bootOutcome("0.3.0", "0.3.0"));
}

void test_booting_another_version_means_it_rolled_back() {
  TEST_ASSERT_EQUAL(BootOutcome::RolledBack, bootOutcome("0.3.0", "0.2.0"));
}

// ---- sha256 ----

void test_sha256_hex_is_lowercase() {
  uint8_t digest[32];
  for (int i = 0; i < 32; i++) {
    digest[i] = (uint8_t)i;
  }
  digest[31] = 0xfa;
  char hex[SHA256_HEX_LENGTH + 1];
  sha256Hex(digest, hex);
  TEST_ASSERT_EQUAL(SHA256_HEX_LENGTH, strlen(hex));
  TEST_ASSERT_EQUAL_STRING_LEN("000102030405060708090a0b", hex, 24);
  TEST_ASSERT_EQUAL_STRING("fa", hex + 62);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_reads_a_valid_offer);
  RUN_TEST(test_no_offer_in_a_plain_response);
  RUN_TEST(test_rejects_bad_versions);
  RUN_TEST(test_rejects_plain_http_and_bad_sha256);
  RUN_TEST(test_rejects_bad_sizes);
  RUN_TEST(test_rejects_a_url_too_long_for_the_buffer);
  RUN_TEST(test_installs_a_version_other_than_the_running_one);
  RUN_TEST(test_skips_the_running_version);
  RUN_TEST(test_never_retries_a_version_that_rolled_back);
  RUN_TEST(test_waits_an_hour_after_a_failed_download);
  RUN_TEST(test_boot_without_an_update_is_normal);
  RUN_TEST(test_first_boot_of_the_installed_version_is_verifying);
  RUN_TEST(test_booting_another_version_means_it_rolled_back);
  RUN_TEST(test_sha256_hex_is_lowercase);
  return UNITY_END();
}
