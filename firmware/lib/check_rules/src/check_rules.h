#pragma once

// Pass/fail rules for the sensor self-check. No Arduino dependency, so they run in native unit tests.

enum CheckStatus { CHECK_OK, CHECK_WARN, CHECK_FAIL };

const char *checkStatusName(CheckStatus status);

// FAIL if there is no reading (NAN) or a value is outside the BME280 operating range
// (-40..85 C, 0..100 %, 300..1100 hPa).
CheckStatus checkBme280(float tempC, float humidityPct, float pressureHpa);

// FAIL below `minConnectedAdc`: without the vane the divider resistor pulls the pin to 0.
CheckStatus checkVaneAdc(int adc, int minConnectedAdc);

// Reed switches idle HIGH through the pull-up. LOW at rest is a WARN: a short,
// or the magnet resting on the reed. A disconnected cable also reads HIGH, so it
// cannot be detected here: check that the counts go up by spinning or tipping.
CheckStatus checkReedIdle(bool pinHigh);
