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
