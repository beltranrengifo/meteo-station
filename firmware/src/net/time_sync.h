#pragma once

#include <Arduino.h>

// Starts SNTP. Sync happens in the background once WiFi is up. Time is kept in UTC.
void timeBegin();

// Call from loop(): logs once when the first sync completes.
void timeLoop();

// True once the clock holds a real date (never emit readings otherwise).
bool timeIsValid();

// Writes the current UTC time as "2026-10-20T10:15:00Z". Returns false if time is not valid.
bool timeNowIso(char *out, size_t size);
