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

## 2026-10-15 — Diagnosis: home WiFi failing when the projector is on (meteo-dg5)
- Goal: find why the projector loses the network, and the board has upload errors, whenever both are on.
- Setup: bench board on USB (fw 0.1.2, IP 192.168.1.150 by DHCP, RSSI -64 dBm). Android projector on WiFi. Router not touched.
- Result: cause found. The projector had a static IP, 192.168.1.128, inside the router's DHCP range. The router gave that same IP to the maintainer's Mac, so the two devices fought over it: the projector showed "connected, no internet" and the Mac lost its connection. Switching the projector to DHCP gave it 192.168.1.154 and both recovered at once.
- Earlier evidence: the 2026-10-13 serial log showed no WiFi disconnect on the board, only one `start_ssl_client -1` that recovered 10 s later. The board was never the cause; it only changed which device the router handed .128 to.
- Problems and fix: projector set to DHCP. No firmware change. `WiFi.setSleep(false)` stays (harmless on mains power).
- config.h changes: none.

## 2026-10-15 — Test: soak after the projector fix (meteo-dg5, meteo-mu1)
- Goal: confirm the board runs without WiFi errors now that the projector uses DHCP, and watch for phantom rain tips.
- Setup: bench board on USB (fw 0.1.2), serial log with `pio device monitor -f time -f log2file`. Ran from 12:20 to 15:33 (Madrid time), 3 h 13 min.
- Result: OK. 170 uploads, all HTTP 200, never a reading pending. No `[wifi]` disconnect, no `start_ssl_client` error, no reboot. Rain: 0 tips, 0 closures, noise 0. Wind: 0 pulses.
- Log gaps: the log misses about 25 min between 14:07 and 14:35, but Supabase has every minute of that window, so only the Mac's monitor stopped writing.
- Problems and fix: none.
- config.h changes: none.

## 2026-10-15 — Test: setup portal and settings in NVS (meteo-no6)
- Goal: set WiFi, device id and key from the setup portal instead of `secrets.h`, on the new partition table (`min_spiffs.csv`).
- Setup: bench board on USB, fw 0.2.0 flashed by USB. Portal opened from a Mac on `meteo-setup-XXXX`.
- Result: OK after one fix. The board opened the portal on its own (not set up), saved `meteo-station-bench` and its key, and after the WiFi password was corrected it uploaded with HTTP 200.
- Problems and fix: the first save had a mistyped WiFi password (`reason 15`, 4-way handshake timeout). WiFiManager then blocked `loop()` for the core's 60 s connect wait and the 60 s task watchdog rebooted the board. Fix: `setSaveConnectTimeout(PORTAL_SAVE_CONNECT_TIMEOUT_S)` (20 s), and `reason 15` now prints "wrong password?". Reopened the portal with `w` on the serial monitor and left the key empty to keep the saved one.
- Not tried yet: BOOT button held 3 s, and the portal opening by itself after 10 min without WiFi.
- config.h changes: `FW_VERSION` 0.2.0, `PIN_SETUP_BUTTON`, `SETUP_BUTTON_HOLD_MS`, `PORTAL_SAVE_CONNECT_TIMEOUT_S`; `DEVICE_ID` build flag removed.

## 2026-10-16 — Test: OTA update over the internet (meteo-pto)
- Goal: install a published firmware from Supabase Storage without USB.
- Setup: bench board on USB (power and serial log only), fw 0.3.0 flashed by USB. Published the bench build of 0.3.1 with `pnpm firmware publish bench` and set it with `pnpm firmware target meteo-station-bench 0.3.1`.
- Result: OK. After its next upload the board downloaded 0.3.1, checked size and SHA-256, rebooted into it and kept it after its first delivered upload.
- Problems and fix: `target` first failed with "permission denied for table devices": the secret key could only read `devices`. Migration `20261016100000_devices_target_update.sql` grants update on `target_fw` only.
- Not tried yet: rollback (a version that cannot upload).
- config.h changes: `FW_VERSION` 0.3.0, then 0.3.1 for the published build.

## 2026-10-16 — Test: OTA rollback (meteo-pto)
- Goal: a published firmware that cannot upload must roll back on its own and never be installed again.
- Setup: bench board on 0.3.1. Published 0.3.2 built with a wrong `INGEST_URL` path (so every upload fails), then `pnpm firmware target meteo-station-bench 0.3.2`.
- Result: OK. Supabase has no readings from 11:25 to 11:34 (Madrid time): 0.3.2 installed and delivered nothing. At 11:35 readings came back from 0.3.1. With the target still 0.3.2, the board kept running 0.3.1 and uploading every minute, so it did not install the failed version again.
- Problems and fix: none. The 10 readings taken by 0.3.2 were lost (expected: the server rejected them).
- config.h changes: none kept (0.3.2 only for the test build).

## 2026-10-16 — Test: remote log over OTA (meteo-82d, meteo-kq1, meteo-6hf)
- Goal: read a station's health and events without a USB cable.
- Setup: migration `20261016120000_station_health_events.sql` and the new `ingest` deployed first, then fw 0.4.0 (bench build) sent over the air with `pnpm firmware publish bench` and `pnpm firmware target`.
- Result: OK. `pnpm station logs meteo-station-bench 1` showed the boot (reset: restart by the firmware), the OTA verification, WiFi connected (RSSI -65 dBm) and "0.4.0 delivered its first upload: kept". Health in the newest reading: free heap 127 KB, 0 WiFi drops since boot. No reading lost during the update.
- Problems and fix: events logged in the same second came out of order; `pnpm station logs` now sorts ties by insert order.
- config.h changes: `FW_VERSION` 0.4.0.

## 2026-10-19 — Check: final outdoor wiring
- Goal: check every sensor after rewiring with the production outdoor cables.
- Setup: final outdoor wiring, cables cut to their real lengths, new pull-up and divider resistors of the same values (10k). Serial monitor: `[check]` self-check (`s` key) and the `[live]` line of the bench build.
- Result: OK. Self-check and manual test of the four sensors (BME280, anemometer, rain gauge, wind vane) all correct. Each of the 8 vane positions read its right direction, so the calibration table still holds.
- Problems and fix: none.
- config.h changes: none.

## 2026-10-20 — Fix: expansion board swapped, rain gauge moved to GPIO 26
- Goal: get the station working again after the first power-on with the final wiring, before closing the box.
- Setup: station build 0.4.0 on meteo-station-lasrozas-1, indoors, final wiring. Multimeter: DC volts and continuity between each screw terminal and the ESP32's own pin.
- Result: OK after the fixes below. Readings at 09:40 (Madrid time): temperature 21.3 °C and humidity 56 %, wind gust 6.2 m/s, vane direction changing, 4 rain tips (1.12 mm). Self-check all OK.
- Problems and fix:
  - BME280 dark and 3V3 at 1 to 2 V on the screw terminals, while the ESP32's own pin read 3.33 V. Readings came with temperature empty, and hundreds of phantom rain tips (dropped by ingest, over 50 mm per minute). With no load the terminals read 3.3 V, so the fault only showed with something connected. Measured between the ESP32's GND pin and the board's GND terminal: voltage there, so the GND contact of the expansion board was bad. Fix: new expansion board.
  - On the new board the rain gauge counted nothing (`0 tips since boot`), although its terminal went from 3.3 V to 0 V on each tip. No continuity between terminal 33 and the ESP32's pin 33, nor for 25. Terminal 26 has continuity. Fix: rain gauge and its pull-up resistor moved to terminal 26, `PIN_RAIN` 26, station build flashed over USB.
- config.h changes: `PIN_RAIN` 33 to 26.
