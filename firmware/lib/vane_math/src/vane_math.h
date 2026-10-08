#pragma once

// Pure wind vane calculations. No Arduino dependency, so they run in native unit tests.

// Index of the table entry whose ADC value is closest to `adc`. -1 if the table is empty.
int vaneNearestIndex(int adc, const int *adcTable, int count);

// Circular mean of angles in degrees, in [0, 360). NAN if count is 0.
// (The arithmetic mean of 350 and 10 would wrongly give 180.)
float circularMeanDeg(const float *degrees, int count);

// Adds the mounting offset to a direction and wraps it to [0, 360).
float applyOffsetDeg(float degrees, float offsetDeg);
