#include "ota_policy.h"

#include <ArduinoJson.h>
#include <string.h>

static bool isDigit(char c) { return c >= '0' && c <= '9'; }

// Same rule as public.firmware_releases: three dot-separated numbers.
static bool isValidVersion(const char *version) {
  size_t length = strlen(version);
  if (length == 0 || length >= (size_t)FW_VERSION_MAX_LENGTH) {
    return false;
  }
  int parts = 1;
  bool digitBefore = false;
  for (size_t i = 0; i < length; i++) {
    if (isDigit(version[i])) {
      digitBefore = true;
    } else if (version[i] == '.' && digitBefore) {
      parts++;
      digitBefore = false;
    } else {
      return false;
    }
  }
  return parts == 3 && digitBefore;
}

static bool isValidSha256(const char *sha256) {
  if (strlen(sha256) != (size_t)SHA256_HEX_LENGTH) {
    return false;
  }
  for (int i = 0; i < SHA256_HEX_LENGTH; i++) {
    if (!isDigit(sha256[i]) && !(sha256[i] >= 'a' && sha256[i] <= 'f')) {
      return false;
    }
  }
  return true;
}

static bool isValidUrl(const char *url) {
  size_t length = strlen(url);
  return strncmp(url, "https://", 8) == 0 && length > 8 && length < (size_t)OTA_URL_MAX_LENGTH;
}

bool parseUpdateOffer(const char *responseBody, UpdateOffer &offer) {
  if (responseBody == nullptr) {
    return false;
  }
  // Keep only "update": the rest of the response (rejected readings) may be long.
  JsonDocument filter;
  filter["update"] = true;
  JsonDocument doc;
  if (deserializeJson(doc, responseBody, DeserializationOption::Filter(filter))) {
    return false;
  }
  JsonObjectConst update = doc["update"];
  if (update.isNull() || !update["size"].is<uint32_t>()) {
    return false;
  }
  const char *version = update["version"] | "";
  const char *url = update["url"] | "";
  const char *sha256 = update["sha256"] | "";
  uint32_t size = update["size"];
  if (!isValidVersion(version) || !isValidUrl(url) || !isValidSha256(sha256) || size == 0) {
    return false;
  }
  strcpy(offer.version, version);
  strcpy(offer.url, url);
  strcpy(offer.sha256, sha256);
  offer.size = size;
  return true;
}

OfferDecision decideOffer(const UpdateOffer &offer, const char *running, const OtaMemory &memory) {
  if (strcmp(offer.version, running) == 0) {
    return OfferDecision::AlreadyRunning;
  }
  if (strcmp(offer.version, memory.failed) == 0) {
    return OfferDecision::FailedBefore;
  }
  if (strcmp(offer.version, memory.lastAttempt) == 0 && memory.msSinceAttempt < OTA_RETRY_AFTER_MS) {
    return OfferDecision::WaitRetry;
  }
  return OfferDecision::Install;
}

BootOutcome bootOutcome(const char *installed, const char *running) {
  if (installed == nullptr || installed[0] == '\0') {
    return BootOutcome::Normal;
  }
  return strcmp(installed, running) == 0 ? BootOutcome::Verifying : BootOutcome::RolledBack;
}

void sha256Hex(const uint8_t digest[32], char *hex) {
  static const char DIGITS[] = "0123456789abcdef";
  for (int i = 0; i < 32; i++) {
    hex[2 * i] = DIGITS[digest[i] >> 4];
    hex[2 * i + 1] = DIGITS[digest[i] & 0x0f];
  }
  hex[SHA256_HEX_LENGTH] = '\0';
}
