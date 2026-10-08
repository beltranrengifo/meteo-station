#include "wind_math.h"

float windSpeedMs(uint32_t pulses, float seconds, float msPerHz) {
  if (seconds <= 0.0f) {
    return 0.0f;
  }
  return pulses / seconds * msPerHz;
}

float windGustMs(const uint16_t *pulsesPerSecond, int count, int windowS, float msPerHz) {
  if (count <= 0 || windowS <= 0) {
    return 0.0f;
  }
  int window = count < windowS ? count : windowS;
  uint32_t sum = 0;
  for (int i = 0; i < window; i++) {
    sum += pulsesPerSecond[i];
  }
  uint32_t best = sum;
  for (int i = window; i < count; i++) {
    sum += pulsesPerSecond[i];
    sum -= pulsesPerSecond[i - window];
    if (sum > best) {
      best = sum;
    }
  }
  return windSpeedMs(best, (float)window, msPerHz);
}
