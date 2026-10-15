#pragma once

#include <stdint.h>

// Station settings checks and when to open the setup portal. Pure code: runs in native unit tests.

constexpr int DEVICE_ID_MAX_LENGTH = 64;
constexpr int DEVICE_KEY_MAX_LENGTH = 128;

// Trying the saved WiFi this long without ever connecting since boot means it is probably
// wrong (the station was moved, or the router changed): open the portal to set it again.
constexpr uint32_t PORTAL_AFTER_NO_WIFI_MS = 10UL * 60UL * 1000UL;

// A portal opened for NoWifi or Asked closes after this long without new settings, and the
// station tries its saved WiFi again (WiFiManager turns the WiFi station off while the portal
// is open and the station is not connected).
constexpr uint32_t PORTAL_OPEN_MAX_MS = 10UL * 60UL * 1000UL;

// Same rule as public.devices: lowercase letters, digits and dashes, not starting with a dash.
bool isValidDeviceId(const char *id);

// Any printable ASCII without spaces, up to DEVICE_KEY_MAX_LENGTH characters.
bool isValidDeviceKey(const char *key);

enum class PortalReason {
  None,
  NotSetUp,  // no device id or key saved yet
  Asked,     // BOOT button held, or 'w' on the serial monitor
  NoWifi,    // never connected since boot, for PORTAL_AFTER_NO_WIFI_MS
};

struct PortalState {
  bool setUp;            // device id and key saved
  bool asked;
  bool everConnected;    // connected to WiFi at least once since boot
  uint32_t msTryingWifi; // since boot, or since the portal last closed
};

// Why the setup portal should be open now, or None. Once the station has connected, a later
// outage never opens it: that is the router, and the portal would only get in the way.
PortalReason portalReason(const PortalState &state);

// Whether a portal open for `reason` for `msOpen` should close. Then msTryingWifi restarts
// from 0, so a station whose WiFi is wrong alternates 10 min trying and 10 min of portal. NotSetUp never closes: without
// settings the station cannot do anything else.
bool portalShouldClose(PortalReason reason, uint32_t msOpen);
