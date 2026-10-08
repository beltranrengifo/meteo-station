#include "vane_math.h"

#include <math.h>
#include <stdlib.h>

static constexpr float DEG_TO_RAD_F = 3.14159265358979f / 180.0f;

int vaneNearestIndex(int adc, const int *adcTable, int count) {
  int best = -1;
  int bestDistance = 0;
  for (int i = 0; i < count; i++) {
    int distance = abs(adc - adcTable[i]);
    if (best == -1 || distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

float circularMeanDeg(const float *degrees, int count) {
  if (count <= 0) {
    return NAN;
  }
  float sumSin = 0.0f;
  float sumCos = 0.0f;
  for (int i = 0; i < count; i++) {
    sumSin += sinf(degrees[i] * DEG_TO_RAD_F);
    sumCos += cosf(degrees[i] * DEG_TO_RAD_F);
  }
  float mean = atan2f(sumSin, sumCos) / DEG_TO_RAD_F;
  if (mean < 0.0f) {
    mean += 360.0f;
  }
  if (mean >= 360.0f) {
    mean -= 360.0f;
  }
  return mean;
}

float applyOffsetDeg(float degrees, float offsetDeg) {
  float result = fmodf(degrees + offsetDeg, 360.0f);
  if (result < 0.0f) {
    result += 360.0f;
  }
  return result;
}
