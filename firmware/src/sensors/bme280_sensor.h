#pragma once

#include <Arduino.h>

struct Bme280Reading {
  bool ok;
  float tempC;
  float humidityPct;
  float pressureHpa;
};

// Starts I2C and the sensor in forced mode (one measurement on demand, no self-heating).
bool bme280Begin();

// Takes one forced measurement. Retries the init if the sensor was not found at boot.
Bme280Reading bme280Read();
