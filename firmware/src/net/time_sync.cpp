#include "time_sync.h"

#include <time.h>

// Any date before this means the clock was never synced (2023-11-14).
static constexpr time_t MIN_VALID_EPOCH = 1700000000;

static bool syncLogged = false;

void timeBegin() {
  // UTC, no daylight offset: timestamps are always UTC.
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}

bool timeIsValid() { return time(nullptr) >= MIN_VALID_EPOCH; }

void timeLoop() {
  if (!syncLogged && timeIsValid()) {
    syncLogged = true;
    char iso[25];
    timeNowIso(iso, sizeof(iso));
    Serial.printf("[time] synced, UTC now %s\n", iso);
  }
}

bool timeNowIso(char *out, size_t size) {
  if (!timeIsValid()) {
    return false;
  }
  time_t now = time(nullptr);
  struct tm utc;
  gmtime_r(&now, &utc);
  strftime(out, size, "%Y-%m-%dT%H:%M:%SZ", &utc);
  return true;
}
