#include "ota_update.h"

#include <HTTPClient.h>
#include <Preferences.h>
#include <Update.h>
#include <WiFiClientSecure.h>
#include <esp_ota_ops.h>
#include <esp_task_wdt.h>
#include <mbedtls/sha256.h>
#include <ota_policy.h>

#include "config.h"
#include "net/setup_portal.h"
#include "net/uploader.h"
#include "root_ca.h"

// The core marks the image the bootloader just started as valid in initArduino()
// (esp32-hal-misc.c) unless this returns true. Then this file decides, after the first
// delivered upload; until then the bootloader goes back to the previous image on any reboot.
extern "C" bool verifyRollbackLater() { return true; }

static constexpr const char *NAMESPACE = "ota";
static constexpr const char *KEY_INSTALLED = "installed";  // version rebooted into, until it is kept
static constexpr const char *KEY_FAILED = "failed";        // version that rolled back

static char failedVersion[FW_VERSION_MAX_LENGTH] = "";
static bool verifying = false;

static char lastAttempt[FW_VERSION_MAX_LENGTH] = "";
static uint32_t lastAttemptMs = 0;
static char lastSkipped[FW_VERSION_MAX_LENGTH] = "";  // logged once, not on every upload

static UpdateOffer candidate;
static UpdateOffer accepted;
static bool hasAccepted = false;

static uint8_t chunk[1024];

void otaBegin() {
  char installed[FW_VERSION_MAX_LENGTH] = "";
  Preferences prefs;
  prefs.begin(NAMESPACE, false);
  prefs.getString(KEY_INSTALLED, installed, sizeof(installed));
  prefs.getString(KEY_FAILED, failedVersion, sizeof(failedVersion));

  esp_ota_img_states_t state;
  bool pendingVerify = esp_ota_get_state_partition(esp_ota_get_running_partition(), &state) == ESP_OK &&
                       state == ESP_OTA_IMG_PENDING_VERIFY;

  switch (bootOutcome(installed, FW_VERSION)) {
    case BootOutcome::Verifying:
      if (pendingVerify) {
        verifying = true;
        Serial.printf("[ota] first boot of %s: kept after its first upload, else back to the previous firmware in %lu min\n",
                      FW_VERSION, (unsigned long)(OTA_VERIFY_TIMEOUT_MS / 60000));
      } else {
        prefs.remove(KEY_INSTALLED);  // flashed by USB since: nothing to verify
      }
      break;
    case BootOutcome::RolledBack:
      Serial.printf("[ota] %s did not work, back on %s: it will not be installed again\n", installed, FW_VERSION);
      strlcpy(failedVersion, installed, sizeof(failedVersion));
      prefs.putString(KEY_FAILED, failedVersion);
      prefs.remove(KEY_INSTALLED);
      break;
    case BootOutcome::Normal:
      // Only an image installed by this file is ever left unverified; keep any other.
      if (pendingVerify) {
        esp_ota_mark_app_valid_cancel_rollback();
      }
      break;
  }
  prefs.end();
}

void otaOnDelivered(const char *responseBody) {
  if (verifying) {
    esp_ota_mark_app_valid_cancel_rollback();
    verifying = false;
    Preferences prefs;
    prefs.begin(NAMESPACE, false);
    prefs.remove(KEY_INSTALLED);
    prefs.end();
    Serial.printf("[ota] %s delivered its first upload: kept\n", FW_VERSION);
  }

  if (!parseUpdateOffer(responseBody, candidate)) {
    return;
  }
  OtaMemory memory = {failedVersion, lastAttempt, millis() - lastAttemptMs};
  switch (decideOffer(candidate, FW_VERSION, memory)) {
    case OfferDecision::Install:
      // A later offer replaces an earlier one: its signed URL is fresher.
      accepted = candidate;
      hasAccepted = true;
      break;
    case OfferDecision::FailedBefore:
      if (strcmp(lastSkipped, candidate.version) != 0) {
        strlcpy(lastSkipped, candidate.version, sizeof(lastSkipped));
        Serial.printf("[ota] %s offered, skipped: it rolled back before\n", candidate.version);
      }
      break;
    case OfferDecision::AlreadyRunning:
    case OfferDecision::WaitRetry:
      break;
  }
}

// Streams the image into the other app slot, hashing it on the way. Update.end() only runs,
// and only then does the board boot into it, when size and sha256 match the offer.
static bool download(const UpdateOffer &offer) {
  WiFiClientSecure client;
  client.setCACert(ROOT_CA_PEM);
  client.setHandshakeTimeout(HTTP_TIMEOUT_MS / 1000);
  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, offer.url)) {
    Serial.println("[ota] download failed: bad URL");
    return false;
  }
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[ota] download failed (%s %d)\n", code < 0 ? "error" : "HTTP", code);
    http.end();
    return false;
  }
  if (http.getSize() != (int)offer.size) {
    Serial.printf("[ota] download failed: %d bytes, expected %lu\n", http.getSize(), (unsigned long)offer.size);
    http.end();
    return false;
  }
  if (!Update.begin(offer.size)) {
    Serial.printf("[ota] cannot install: %s\n", Update.errorString());
    http.end();
    return false;
  }

  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  mbedtls_sha256_starts_ret(&sha, 0);
  WiFiClient *stream = http.getStreamPtr();
  uint32_t received = 0;
  uint32_t lastDataMs = millis();
  bool ok = true;
  while (received < offer.size) {
    // The loop task is blocked here; a stall is caught by the timeout below, not the watchdog.
    esp_task_wdt_reset();
    size_t available = stream->available();
    if (available == 0) {
      if (!stream->connected() || millis() - lastDataMs > HTTP_TIMEOUT_MS) {
        Serial.printf("[ota] download stopped at %lu of %lu bytes\n", (unsigned long)received,
                      (unsigned long)offer.size);
        ok = false;
        break;
      }
      delay(10);
      continue;
    }
    size_t wanted = available < sizeof(chunk) ? available : sizeof(chunk);
    if (wanted > offer.size - received) {
      wanted = offer.size - received;
    }
    size_t got = stream->readBytes(chunk, wanted);
    if (got == 0) {
      continue;
    }
    lastDataMs = millis();
    if (Update.write(chunk, got) != got) {
      Serial.printf("[ota] write failed: %s\n", Update.errorString());
      ok = false;
      break;
    }
    mbedtls_sha256_update_ret(&sha, chunk, got);
    received += got;
  }
  http.end();

  uint8_t digest[32];
  mbedtls_sha256_finish_ret(&sha, digest);
  mbedtls_sha256_free(&sha);
  if (!ok) {
    Update.abort();
    return false;
  }
  char hex[SHA256_HEX_LENGTH + 1];
  sha256Hex(digest, hex);
  if (strcmp(hex, offer.sha256) != 0) {
    Serial.println("[ota] sha256 does not match the release: not installed");
    Update.abort();
    return false;
  }
  // Checks the image and sets it as the next boot.
  if (!Update.end()) {
    Serial.printf("[ota] not installed: %s\n", Update.errorString());
    return false;
  }
  return true;
}

void otaLoop() {
  if (verifying && millis() >= OTA_VERIFY_TIMEOUT_MS) {
    Serial.printf("[ota] %s delivered no upload in %lu min: back to the previous firmware\n", FW_VERSION,
                  (unsigned long)(OTA_VERIFY_TIMEOUT_MS / 60000));
    Serial.flush();
    // The previous firmware finds "installed" still set to this version and marks it failed.
    esp_ota_mark_app_invalid_rollback_and_reboot();
  }

  // Readings still in RAM would be lost on the reboot, and the portal owns the WiFi.
  if (!hasAccepted || uploaderPending() > 0 || setupPortalIsOpen()) {
    return;
  }
  hasAccepted = false;

  Serial.printf("[ota] installing %s (%lu bytes), readings pause meanwhile\n", accepted.version,
                (unsigned long)accepted.size);
  uint32_t startMs = millis();
  if (!download(accepted)) {
    strlcpy(lastAttempt, accepted.version, sizeof(lastAttempt));
    lastAttemptMs = millis();
    Serial.printf("[ota] %s will be tried again in %lu min\n", accepted.version,
                  (unsigned long)(OTA_RETRY_AFTER_MS / 60000));
    return;
  }

  Preferences prefs;
  prefs.begin(NAMESPACE, false);
  prefs.putString(KEY_INSTALLED, accepted.version);
  prefs.end();
  Serial.printf("[ota] %s installed in %lu s, restarting\n", accepted.version,
                (unsigned long)((millis() - startMs) / 1000));
  Serial.flush();
  ESP.restart();
}
