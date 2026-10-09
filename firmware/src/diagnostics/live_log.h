#pragma once

#include <Arduino.h>

// Bench only (LIVE_LOG_INTERVAL_MS set by the bench env): prints the sensors on serial every
// interval without touching the one-minute reading periods. Nothing is uploaded.
void liveLogLoop();
