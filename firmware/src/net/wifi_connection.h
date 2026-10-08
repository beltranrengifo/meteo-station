#pragma once

#include <Arduino.h>

// Starts the WiFi station and keeps it connected (auto-reconnect).
void wifiBegin();

// Call from loop(): restarts the connection if it has been down for too long.
void wifiLoop();

bool wifiIsConnected();
int wifiRssi();
