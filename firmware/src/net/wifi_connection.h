#pragma once

#include <Arduino.h>

// Starts the WiFi station on the network saved by the setup portal and keeps it connected.
void wifiBegin();

// Call from loop(): restarts the connection if it has been down for too long.
void wifiLoop();

// Back to station mode on the saved network, e.g. after the setup portal closes.
void wifiRestart();

bool wifiIsConnected();
int wifiRssi();
