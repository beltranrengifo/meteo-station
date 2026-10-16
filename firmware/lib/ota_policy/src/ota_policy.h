#pragma once

#include <stddef.h>
#include <stdint.h>

// OTA decisions: reading the update offer, whether to install it, and what a boot after an
// update means. Pure code: runs in native unit tests. The download lives in src/net/ota_update.

constexpr int FW_VERSION_MAX_LENGTH = 16;  // "999.999.999" and the terminator fit
constexpr int SHA256_HEX_LENGTH = 64;
constexpr int OTA_URL_MAX_LENGTH = 1024;   // a Supabase signed URL is about 300 characters

// A new firmware must deliver one upload within this long after its first boot, or the board
// goes back to the previous firmware.
constexpr uint32_t OTA_VERIFY_TIMEOUT_MS = 10UL * 60UL * 1000UL;

// After a failed download, the same version is not tried again for this long. The ingest
// response offers it on every upload (once a minute).
constexpr uint32_t OTA_RETRY_AFTER_MS = 60UL * 60UL * 1000UL;

// The "update" object of the ingest response (backend/supabase/functions/ingest/update.ts).
struct UpdateOffer {
  char version[FW_VERSION_MAX_LENGTH];
  char url[OTA_URL_MAX_LENGTH];
  char sha256[SHA256_HEX_LENGTH + 1];  // lowercase hex
  uint32_t size;
};

// Reads the offer from an ingest response body. False when there is none or it is not valid.
bool parseUpdateOffer(const char *responseBody, UpdateOffer &offer);

// What the board remembers between offers. `failed` survives reboots (NVS); the attempt only
// lives in RAM.
struct OtaMemory {
  const char *failed;        // a version that was installed and rolled back, or ""
  const char *lastAttempt;   // the last version whose download failed, or ""
  uint32_t msSinceAttempt;
};

enum class OfferDecision {
  Install,
  AlreadyRunning,  // the server's newest reading is older than this boot; nothing to do
  FailedBefore,    // never retried: a broken version would loop install, rollback, install
  WaitRetry,       // its download failed less than OTA_RETRY_AFTER_MS ago
};

OfferDecision decideOffer(const UpdateOffer &offer, const char *running, const OtaMemory &memory);

enum class BootOutcome {
  Normal,      // no update was installed before this boot
  Verifying,   // first boot of the installed version: keep it after one delivered upload
  RolledBack,  // the installed version did not run, the bootloader went back to this one
};

// `installed` is the version saved just before rebooting into an update, or "".
BootOutcome bootOutcome(const char *installed, const char *running);

// Lowercase hex of a 32-byte SHA-256 digest into `hex` (SHA256_HEX_LENGTH + 1 bytes).
void sha256Hex(const uint8_t digest[32], char *hex);
