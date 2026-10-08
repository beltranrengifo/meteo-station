#include "bme280_sensor.h"

#include <Adafruit_BME280.h>
#include <Wire.h>

#include "config.h"

static Adafruit_BME280 bme;
static bool initialized = false;

bool bme280Begin() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  initialized = bme.begin(BME280_I2C_ADDRESS, &Wire);
  if (!initialized) {
    Serial.printf("[bme280] not found at 0x%02X\n", BME280_I2C_ADDRESS);
    return false;
  }
  // Weather-station settings from the datasheet: forced mode, 1x oversampling, no filter.
  bme.setSampling(Adafruit_BME280::MODE_FORCED,
                  Adafruit_BME280::SAMPLING_X1,  // temperature
                  Adafruit_BME280::SAMPLING_X1,  // pressure
                  Adafruit_BME280::SAMPLING_X1,  // humidity
                  Adafruit_BME280::FILTER_OFF);
  Serial.printf("[bme280] ready at 0x%02X\n", BME280_I2C_ADDRESS);
  return true;
}

Bme280Reading bme280Read() {
  Bme280Reading reading = {false, NAN, NAN, NAN};
  if (!initialized && !bme280Begin()) {
    return reading;
  }
  if (!bme.takeForcedMeasurement()) {
    Serial.println("[bme280] forced measurement failed");
    return reading;
  }
  reading.tempC = bme.readTemperature();
  reading.humidityPct = bme.readHumidity();
  reading.pressureHpa = bme.readPressure() / 100.0f;
  reading.ok = !isnan(reading.tempC) && !isnan(reading.humidityPct) && !isnan(reading.pressureHpa);
  return reading;
}
