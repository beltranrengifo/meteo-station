# Hardware log

## 2026-10-08 — Bench tests (summary from chat session)
- BME280 OK at 0x77 (22.3 C, 59.1 %, 941.2 hPa). Anemometer OK. Vane OK (8 directions). Rain gauge OK but bounces (6-9 pulses per tip without debounce).
- Details: see `contexto-estacion-meteo-code.md`.

## 2026-10-08 — Test: WiFi connection and auto-reconnect
- Goal: connect to home WiFi and recover after the router goes down.
- Setup: USB power, on the bench. `src/net/wifi_connection.cpp`.
- Result: OK.
- Observed values: IP 192.168.1.128, RSSI -59 to -68 dBm on the bench. Router off and on: `disconnected`, restart after 30 s, reconnected without reboot (uptime kept counting). Reason 8 is the disconnect our own code triggers on restart.
- Problems and fix: none.
- config.h changes: none.

## 2026-10-08 — Test: NTP time sync (UTC)
- Goal: get valid UTC time over NTP.
- Setup: USB power, on the bench. `src/net/time_sync.cpp`.
- Result: OK.
- Observed values: synced 15-20 s after boot (2026-10-08T11:23:37Z); clock advances 5 s per 5 s of uptime. Before sync it reports "no valid time".
- Problems and fix: none.
- config.h changes: none.

## 2026-10-08 — Test: BME280 module (forced mode)
- Goal: read temperature, humidity and pressure through `src/sensors/bme280_sensor.cpp`.
- Setup: USB power, on the bench. I2C on GPIO 21/22, address 0x77. Forced mode, 1x oversampling, no filter. Read every 5 s for the test (station: once per minute).
- Result: OK.
- Observed values: 23.0-23.3 C, 56.9-57.0 %, 942.4-942.5 hPa. Blowing on it: humidity up to 81.4 %, back to 59.1 % within ~15 s.
- Problems and fix: none.
- config.h changes: none.

## 2026-10-08 — Test: anemometer module (interrupt, 5 ms debounce, 3 s gust)
- Goal: count pulses with debounce and compute average and gust through `src/sensors/anemometer.cpp`.
- Setup: USB power, on the bench. GPIO 32, external 10k pull-up, FALLING interrupt. Summary every 5 s for the test (station: 60 s).
- Result: OK.
- Observed values: still = 0 pulses. Spinning by hand: 5-28 pulses per 5 s, average 0.67-3.74 m/s, gust 1.11-4.45 m/s. Math checks out (e.g. 28 pulses / 5 s x 0.667 = 3.74 m/s); gust always >= average. Debounce check: 10 slow turns by hand = exactly 10 pulses (one pulse per turn, no bounce).
- Problems and fix: none.
- config.h changes: none.

## 2026-10-08 — Test: rain gauge module (interrupt, 200 ms debounce)
- Goal: count bucket tips with debounce and convert to mm through `src/sensors/rain_gauge.cpp`.
- Setup: USB power, on the bench. GPIO 33, external 10k pull-up, FALLING interrupt. Summary every 5 s for the test (station: 60 s).
- Result: OK.
- Observed values: still = 0 tips. 10 slow tips by hand = 3 + 3 + 2 + 2 = exactly 10 tips, 2.794 mm. Without debounce one tip gave 6-9 pulses; 200 ms removes the bounce.
- Problems and fix: none.
- config.h changes: none (RAIN_DEBOUNCE_MS = 200, spec value).

## 2026-10-08 — Test: wind vane module (ADC, 8 positions, circular mean)
- Goal: read the vane through `src/sensors/wind_vane.cpp` and map it to the 8 calibrated positions.
- Setup: USB power, on the bench. GPIO 34 (ADC1), 10k divider to GND. 12-bit ADC, 11 dB. 20 reads averaged per sample, one sample every 5 s. VANE_OFFSET_DEG = 0.
- Result: OK. All 8 positions (N, NE, E, SE, S, SW, W, NW) reported correctly. Native unit tests green.
- Observed values: not recorded per position in this run (calibration table from the earlier bench test still valid).
- Problems and fix: none.
- config.h changes: none.

## 2026-10-08 — Test: upload to Supabase (buffer, batches, backoff)
- Goal: send each reading to the ingest function over HTTPS, keep it in RAM when the network fails, and resend in batches.
- Setup: USB power, on the bench, DEVICE_ID `meteo-station-bench`. Ran from 17:02 to 22:03 (Madrid time).
- Result: OK. 305 readings stored in Supabase, none lost while the board was powered. From 20:15 the home internet failed repeatedly (DNS Failed, start_ssl_client -1, outages of up to 17 min). The board retried at 10, 20 and 40 s and then sent everything pending in one batch (up to 17 readings).
- Problems and fix: around 21:00 the whole home WiFi failed (router Sagemcom F@st 5366S) and came back when the board was unplugged. Cause not confirmed; tracked in meteo-dg5. Added `WiFi.setSleep(false)`. Seven rain tips with nobody touching the gauge; tracked as a separate bug. The one reading still in RAM was lost when unplugged (expected until LittleFS).
- Anemometer after moving per-second counting to `esp_timer`: gust reasonable when spun by hand. Native unit tests green (test_upload included).
- config.h changes: upload constants (BUFFER_CAPACITY, UPLOAD_BATCH_MAX, HTTP_TIMEOUT_MS, WATCHDOG_TIMEOUT_S).
