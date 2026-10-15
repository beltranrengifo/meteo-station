#include "station_settings.h"

#include <Preferences.h>
#include <station_setup.h>

static constexpr const char *NAMESPACE = "station";
static constexpr const char *KEY_DEVICE_ID = "device_id";
static constexpr const char *KEY_DEVICE_KEY = "device_key";

static char deviceId[DEVICE_ID_MAX_LENGTH + 1] = "";
static char deviceKey[DEVICE_KEY_MAX_LENGTH + 1] = "";

void stationSettingsBegin() {
  Preferences prefs;
  // Read-write: opening read-only fails while the namespace does not exist yet.
  prefs.begin(NAMESPACE, false);
  prefs.getString(KEY_DEVICE_ID, deviceId, sizeof(deviceId));
  prefs.getString(KEY_DEVICE_KEY, deviceKey, sizeof(deviceKey));
  prefs.end();
  // The key is never printed.
  if (stationIsSetUp()) {
    Serial.printf("[setup] station %s\n", deviceId);
  } else {
    Serial.println("[setup] station not set up yet");
  }
}

bool stationIsSetUp() { return isValidDeviceId(deviceId) && isValidDeviceKey(deviceKey); }

const char *stationDeviceId() { return deviceId; }

const char *stationDeviceKey() { return deviceKey; }

bool stationSettingsSave(const char *newId, const char *newKey) {
  const char *key = (newKey == nullptr || newKey[0] == '\0') ? deviceKey : newKey;
  if (!isValidDeviceId(newId) || !isValidDeviceKey(key)) {
    return false;
  }
  Preferences prefs;
  prefs.begin(NAMESPACE, false);
  bool saved = prefs.putString(KEY_DEVICE_ID, newId) > 0 && prefs.putString(KEY_DEVICE_KEY, key) > 0;
  prefs.end();
  return saved;
}
