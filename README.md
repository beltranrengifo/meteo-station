# Meteo Station

A home weather station built on an ESP32: temperature, humidity, pressure, wind speed, gust, wind direction and rain, sent once a minute to Supabase and shown on a web dashboard.

Status: the firmware reads all sensors and prints a JSON reading every minute over serial. The backend (Supabase), the cached read API and the web dashboard come next.

## Hardware

No soldering: everything connects with screw terminals, STEMMA QT / Qwiic cables and WAGO connectors.

### Electronics and sensors

| Part | Measures | Connection |
|---|---|---|
| ESP32 dev board, ESP-WROOM-32, 38 pins, USB-C, CP2102 | — (controller, WiFi) | — |
| 38-pin screw-terminal expansion board for the ESP32 (wide version, 2.55 cm between pin rows) | — | — |
| Adafruit BME280 with STEMMA QT | temperature, humidity, pressure | I2C (GPIO 21/22), address 0x77 |
| Anemometer (wind/rain kit) | wind speed and gust | reed switch, interrupt on GPIO 32 |
| Wind vane (wind/rain kit) | wind direction, 8 positions | voltage divider, ADC on GPIO 34 |
| Tipping-bucket rain gauge (wind/rain kit) | rain, 0.2794 mm per tip | reed switch, interrupt on GPIO 33 |

The wind/rain kit is a SparkFun SEN-15901 or an equivalent (we used BricoGeek SEN-0051): anemometer, vane, rain gauge, two-piece mast and arms. The anemometer plugs into the vane, so the kit ends in two RJ11 cables: one for wind, one for rain.

### Wiring parts

- 3 × 10 kΩ resistors (pull-ups for anemometer and rain gauge, divider for the vane)
- 2 × RJ11 6P4C female to screw-terminal adapters (wind, rain)
- 2 × WAGO 221-415 lever connectors (3.3 V and GND distribution)
- 1 × STEMMA QT / Qwiic cable with male pins (BME280)

### Enclosure and mounting

- IP65 junction box (150 × 110 × 70 mm) with rubber cable entries
- TFA 98.1114.02 radiation shield for the BME280 (without it, the sun skews temperature by several degrees)
- Antenna clamps to fix the mast to a post or fence

### Power

- Mean Well LPV-20-5 (5 V, 3 A, IP67) next to an outdoor socket
- IP68 waterproof connector and 2 × 0.75 mm² cable carrying 5 V to the box
- During bench tests, USB-C power is enough

Pins, timing and calibration are in [`firmware/include/config.h`](firmware/include/config.h). Wiring details, calibration values and the assembly drawing are in [`docs/`](docs/) (Spanish).

## Repository layout

```
firmware/   PlatformIO project (Arduino framework, esp32dev)
  include/    config.h (pins, timing, calibration), secrets.example.h
  src/        main loop, sensors/, net/ (WiFi, NTP), diagnostics/
  lib/        pure logic with no Arduino dependency (wind, rain, vane, debounce, JSON reading)
  test/       Unity unit tests for lib/, run on the computer
docs/       design spec, bench-test log, assembly drawing (Spanish)
```

Planned: `backend/` (Supabase migrations and ingest Edge Function) and `frontend/` (React + TypeScript dashboard with cached `/api` routes on Vercel).

## Firmware

Requires [PlatformIO Core](https://docs.platformio.org/en/latest/core/installation/index.html).

```sh
cd firmware
cp include/secrets.example.h include/secrets.h   # then fill in your WiFi SSID and password
pio run -t upload                                # build and flash the board
pio device monitor                               # serial output at 115200 baud
pio test -e native                               # unit tests on your computer, no board needed
```

For long bench runs, save a timestamped log to `firmware/logs/` (git-ignored) and keep the Mac awake:

```sh
caffeinate -i                                    # in another terminal; Ctrl+C to stop
pio device monitor -f time -f log2file
```

Type `s` in the serial monitor for a sensor self-check.

Each minute the station prints one reading:

```json
{"device_id":"meteo-station-1","ts":"2026-10-20T10:15:00Z","temp_c":18.4,"humidity_pct":62.1,"pressure_hpa":1016.3,"wind_avg_ms":2.10,"wind_gust_ms":4.60,"wind_dir_deg":225,"rain_mm":0.2794,"rssi":-67,"uptime_s":86400,"fw":"0.1.0"}
```

## License

[MIT](LICENSE)
