#include "check_rules.h"

#include <math.h>

const char *checkStatusName(CheckStatus status) {
  switch (status) {
    case CHECK_OK: return "OK";
    case CHECK_WARN: return "WARN";
    default: return "FAIL";
  }
}

static bool inRange(float value, float min, float max) { return !isnan(value) && value >= min && value <= max; }

CheckStatus checkBme280(float tempC, float humidityPct, float pressureHpa) {
  bool ok = inRange(tempC, -40.0f, 85.0f) && inRange(humidityPct, 0.0f, 100.0f) &&
            inRange(pressureHpa, 300.0f, 1100.0f);
  return ok ? CHECK_OK : CHECK_FAIL;
}

CheckStatus checkVaneAdc(int adc, int minConnectedAdc) { return adc >= minConnectedAdc ? CHECK_OK : CHECK_FAIL; }

CheckStatus checkReedIdle(bool pinHigh) { return pinHigh ? CHECK_OK : CHECK_WARN; }
