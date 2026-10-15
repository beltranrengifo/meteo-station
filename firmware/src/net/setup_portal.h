#pragma once

#include <Arduino.h>

// Setup portal (WiFiManager): the board opens its own WiFi network, "meteo-setup-XXXX", and a
// phone connected to it sets the station's WiFi, device id and key. It opens when the station
// is not set up, when asked (BOOT button held 3 s, or 'w' on the serial monitor) and when the
// saved WiFi never connects (station_setup.h). It never blocks: readings go on meanwhile.

void setupPortalBegin();

// Call from loop().
void setupPortalLoop();

// While the portal is open, the station's own WiFi reconnects are paused: they would fight
// the portal's connection attempts.
bool setupPortalIsOpen();

// Opens the portal on the next loop (serial 'w').
void setupPortalAsk();
