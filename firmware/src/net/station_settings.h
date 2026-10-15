#pragma once

#include <Arduino.h>

// The station's own settings, kept in NVS so they survive reboots and firmware updates, and
// so the firmware itself holds no secrets: the same build runs on every station.
// WiFi network and password are kept by the ESP32 WiFi driver (also NVS), set by the portal.

// Loads the saved settings. Call once in setup(), before anything reads them.
void stationSettingsBegin();

// Device id and key saved and valid.
bool stationIsSetUp();

// Empty strings until set up. Valid until the next reboot (saving restarts the board).
const char *stationDeviceId();
const char *stationDeviceKey();

// Saves new settings. An empty key keeps the saved one, so changing the WiFi does not mean
// typing the key again. Returns false (nothing saved) if a value is not valid.
bool stationSettingsSave(const char *deviceId, const char *deviceKey);
