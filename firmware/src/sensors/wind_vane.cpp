#include "wind_vane.h"

#include <vane_math.h>

#include "config.h"

// Room for the 60 s reading period (12 samples at 5 s) plus slack.
static constexpr int MAX_SAMPLES = 32;

static int adcTable[VANE_POSITION_COUNT];
static float samples[MAX_SAMPLES];
static int sampleCount = 0;
static VaneSample lastSample = {0, -1, NAN};
static uint32_t lastSampleMs = 0;

static VaneSample takeSample() {
  uint32_t sum = 0;
  for (int i = 0; i < VANE_ADC_SAMPLES; i++) {
    sum += analogRead(PIN_VANE);
  }
  VaneSample sample;
  sample.adc = sum / VANE_ADC_SAMPLES;
  sample.index = vaneNearestIndex(sample.adc, adcTable, VANE_POSITION_COUNT);
  sample.degrees = applyOffsetDeg(VANE_POSITIONS[sample.index].degrees, VANE_OFFSET_DEG);
  return sample;
}

static void storeSample() {
  lastSample = takeSample();
  lastSampleMs = millis();
  if (sampleCount < MAX_SAMPLES) {
    samples[sampleCount++] = lastSample.degrees;
  }
}

void windVaneBegin() {
  for (int i = 0; i < VANE_POSITION_COUNT; i++) {
    adcTable[i] = VANE_POSITIONS[i].adc;
  }
  // Same settings used to measure the calibration table: 12 bits, 11 dB (0-3.3 V range).
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_VANE, ADC_11db);
  storeSample();
  Serial.printf("[vane] ready on GPIO %d\n", PIN_VANE);
}

void windVaneTick() {
  if (millis() - lastSampleMs >= VANE_SAMPLE_INTERVAL_MS) {
    storeSample();
  }
}

VaneSummary windVaneTakeSummary() {
  if (sampleCount == 0) {
    storeSample();
  }
  VaneSummary summary = {sampleCount, circularMeanDeg(samples, sampleCount), lastSample};
  sampleCount = 0;
  return summary;
}
