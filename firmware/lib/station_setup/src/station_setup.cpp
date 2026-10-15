#include "station_setup.h"

static bool isIdChar(char c) { return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-'; }

bool isValidDeviceId(const char *id) {
  if (id == nullptr || id[0] == '\0' || id[0] == '-') {
    return false;
  }
  int length = 0;
  for (; id[length] != '\0'; length++) {
    if (length >= DEVICE_ID_MAX_LENGTH || !isIdChar(id[length])) {
      return false;
    }
  }
  return true;
}

bool isValidDeviceKey(const char *key) {
  if (key == nullptr || key[0] == '\0') {
    return false;
  }
  int length = 0;
  for (; key[length] != '\0'; length++) {
    // Printable ASCII without the space: '!' (0x21) to '~' (0x7e).
    if (length >= DEVICE_KEY_MAX_LENGTH || key[length] < '!' || key[length] > '~') {
      return false;
    }
  }
  return true;
}

PortalReason portalReason(const PortalState &state) {
  if (!state.setUp) {
    return PortalReason::NotSetUp;
  }
  if (state.asked) {
    return PortalReason::Asked;
  }
  if (!state.everConnected && state.msTryingWifi >= PORTAL_AFTER_NO_WIFI_MS) {
    return PortalReason::NoWifi;
  }
  return PortalReason::None;
}

bool portalShouldClose(PortalReason reason, uint32_t msOpen) {
  return reason != PortalReason::NotSetUp && msOpen >= PORTAL_OPEN_MAX_MS;
}
