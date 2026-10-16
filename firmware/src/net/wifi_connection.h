#pragma once

#include <Arduino.h>

// Starts the WiFi station on the network saved by the setup portal and keeps it connected.
void wifiBegin();

// Call from loop(): restarts the connection if it has been down for too long.
void wifiLoop();

// Back to station mode on the saved network, e.g. after the setup portal closes.
void wifiRestart();

// Call from loop(), also while the setup portal is open: logs the link going down and up
// to the remote log (diagnostics/events.h).
void wifiWatch();

// Drops of an established link since boot (sent with every reading).
uint32_t wifiDisconnects();

bool wifiIsConnected();
int wifiRssi();
