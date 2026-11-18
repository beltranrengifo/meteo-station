# Backfill of the November 2026 gap and bad readings with calibrated estimates

Date: 2026-11-18. Status: ready for review, nothing written to the database yet. Bead: meteo-0hq.

Station: `meteo-station-lasrozas-1` (Madrid, Las Rozas). All times are UTC unless they say Madrid.

## 1. Summary

The station has one gap with no readings (2026-11-12 06:40 to 2026-11-17 16:13) and several stretches where some readings are wrong. The plan fills them with estimates from Open-Meteo, calibrated against the hours when the station was healthy. Every estimated value is marked in a new column `readings.estimated`, and every reading that is inserted or changed keeps a copy of itself, as it was, in a new table `readings_originals`. Nothing is deleted, and one command undoes it all.

What the comparison with Open-Meteo found:

- **Wind speed is the big one.** The low wind from late October to the gap was the station under-reading, not calm weather. After the remount the anemometer reads exactly as it did in its first four days on the mast (station wind / reference wind = 0.331 in both periods). From 2026-10-25 that ratio fell, to 0.00-0.08 in November, with 39-77 % of minutes at exactly 0 m/s on days when the models had 3-6 m/s. Wind speed and gusts from 2026-10-25 to the gap are replaced with estimates.
- **Temperature, humidity and pressure before the gap are fine** where they have a value. The "pressure drop to 917 hPa" on 2026-11-12 was a real storm: the reference fell just as much. Humidity at 100 % is what the station also reads in drizzle after the remount. Only the readings where the BME280 did not answer (stored as null, 2026-11-11 08:59 to 2026-11-12 03:17) get estimates.
- **Rain**: 2026-11-09 is kept (the tips look like real rain and line up with a real shower). 2026-11-10 from 00:01 to 16:42 is replaced: the gauge was making noise that day, and about 10.6 mm of tips came while every model had almost nothing and the hardware log describes light rain, about 1 mm. From firmware 0.5.1 (2026-11-10 16:42) the rain is kept. The day the gauge was on a dead terminal (2026-11-17 16:14 to 2026-11-18 16:16) gets estimated rain.

Counts (dry run of 2026-11-18, about 17:00): 7,774 readings inserted, 27,516 readings changed, 112,279 values estimated, 35,290 rows in `readings_originals`.

## 2. Method

**Reference.** Open-Meteo's Historical Forecast API (archived runs of the high-resolution models), hourly, UTC, wind in m/s, at the station's coordinates (read from `STATION_COORDINATES`, never printed). Six models were compared (section 4). The one used is ECMWF IFS 0.25° (`ecmwf_ifs025`) for everything except pressure, which comes from DWD ICON (`icon_seamless`). Pressure is compared with `surface_pressure`, not sea-level pressure, because the station measures pressure at its own height.

**Lining up hours.** Open-Meteo's temperature, humidity, pressure and wind speed and direction are values at the full hour, so they are compared with the mean of the station minutes from 30 minutes before to 30 minutes after it. Precipitation and gusts are for the hour before the time, so they are compared with the station's sum (rain) or maximum (gust) of that hour. An hour needs at least 45 of its 60 minutes.

**Held-out error.** Every number called "held-out" comes from leave-one-block-out cross-validation: the healthy hours are cut into whole days (or 6-hour blocks for wind direction, which has only one day of data), and each block is predicted with a calibration fitted on all the other blocks. Two more tests check that a calibration works in other weather: fitted on the older healthy period and tested on the days after the remount (which were rainy and windy, like the gap), and fitted on all healthy hours and tested on the days just before the gap. MAE is the mean absolute error, RMSE the root mean square error, bias the mean of reference minus station.

**From hours to minutes.** Estimates are written as one reading per minute, like the station's (section 7 says why). Instant values are interpolated linearly between the hours at the middle of each minute; wind direction is interpolated through its sine and cosine so it turns through north. Each minute gets the calibrated gust of its hour, so the hourly maximum is the calibrated value. Rain is spread evenly over the minutes of its hour and rounded to whole gauge tips (0.2794 mm), placing a tip where the running total passes each half tip: each hour is off by less than one tip and the window total is the reference total to the nearest tip.

Everything above is in `backend/scripts/estimates.ts` (pure functions, unit-tested) and `backend/scripts/backfill-estimates.ts` (the command). `pnpm backfill analyze` prints every table of sections 3 to 5.

## 3. Calibration periods

- **A, 2026-10-21 to 2026-11-08** (the first full days on the mast, before the board started failing): temperature, humidity and pressure.
- **B, 2026-11-17 16:30 to now** (the new ESP32), minus 2026-11-18 16:00 to 16:30, when the owner was at the mast (gauge tipped by hand, vane held north): every variable. It is open-ended, so each run uses the hours that have arrived since. On 2026-11-18 it had about 24 usable hours.
- **Wind speed and gusts: 2026-10-21 to 2026-10-24 plus B.** The anemometer is wrong from 2026-10-25 (section 5.1), so A is cut to its first four days for wind. Those four days and B give the same ratio (0.331), which is the evidence that both are healthy and that the slight move of the anemometer on 2026-11-17 changed nothing measurable.
- **Wind direction: B only.** The vane offset changed on 2026-11-17 (`VANE_OFFSET_DEG` 0 to 45), and only B has the vane checked against north.
- **Rain: no calibration** (section 4).

## 4. Calibration per variable

Choice of model, held-out MAE of the chosen form on the healthy hours:

| | ecmwf_ifs025 | icon_seamless | best_match | ecmwf_ifs | meteofrance_seamless | ukmo_seamless |
|---|---|---|---|---|---|---|
| temperature (°C) | **1.18** | 1.32 | 1.68 | 1.22 | 1.51 | 1.37 |
| humidity (%) | **7.86** | 9.83 | 10.91 | 7.81 | 9.72 | 12.40 |
| pressure (hPa) | 0.69 | **0.38** | 0.42 | 0.62 | 0.69 | 0.82 |
| wind (m/s) | **0.38** | 0.47 | 0.42 | 0.38 | 0.45 | 0.46 |
| gust (m/s) | **1.16** | 1.53 | 1.46 | 1.14 | 1.65 | 1.47 |
| direction (°) | **7.76** | 15.78 | 16.86 | 7.39 | 6.93 | 12.11 |

ECMWF IFS 0.25° is best or within a few hundredths of the best for everything but pressure, and it generalises best to the rainy days (next table), so it is the main model. For pressure, ICON's error is half. ECMWF IFS 0.25° is stored every 3 hours; Open-Meteo interpolates it to hourly, and its precipitation is spread evenly over the 3 hours.

Choice of form (MAE: held-out | fitted on the older healthy period, tested on B | fitted on all healthy hours, tested on 2026-11-09 to the gap):

| variable | none | offset / ratio | linear |
|---|---|---|---|
| temperature | 1.64 / 1.94 / 2.33 | **offset 1.18 / 0.65 / 1.02** | 1.20 / 0.84 / 1.09 |
| humidity | **7.86 / 7.19 / 8.35** | offset 8.14 / 7.53 / 9.66 | 7.05 / 13.10 / 17.50 |
| pressure | - | **offset 0.38 / 0.72 / 0.45** | 0.38 / 1.17 / 0.53 |
| wind speed | 1.88 / 3.69 / 5.53 | **ratio 0.38 / 0.25 / 1.68** | 0.40 / 0.26 / 1.70 |
| gust | 2.44 / 5.13 / 9.79 | **ratio 1.16 / 1.51 / 4.94** | 1.14 / 1.07 / 4.42 |
| direction | 72.86 / - / 92.50 | **offset 7.76 / - / 33.80** | - |

(The last column of wind is large because those days are the broken anemometer, not because of the calibration.)

The calibrations, as fitted on 2026-11-18:

| variable | estimate | held-out MAE | RMSE | bias | hours |
|---|---|---|---|---|---|
| temperature | ECMWF − 1.32 °C | 1.18 °C | 1.55 | 0.00 | 476 |
| humidity | ECMWF as it is | 7.86 % | 10.22 | +1.34 | 476 |
| pressure | ICON − 14.81 hPa | 0.38 hPa | 0.47 | 0.00 | 476 |
| wind speed | 0.336 × ECMWF | 0.38 m/s | 0.48 | +0.02 | 118 |
| gust | 0.580 × ECMWF gust | 1.16 m/s | 1.51 | −0.16 | 119 |
| wind direction | ECMWF + 73° | 7.8° | 9.2 | +0.1 | 23 |
| rain | ECMWF as it is, in tips | not calibrated | | | |

Why these forms:

- **Temperature: offset.** A linear fit is no better held out and worse in other weather. An offset by hour of day was tried in the exploration: about 0.1 °C better held out on the sunny October days, worse on the rainy days after the remount, which are the weather of the gap. Not worth 24 parameters.
- **Humidity: no calibration.** A linear fit wins on the dry October days (7.05) but fails badly on rainy days (13.10 and 17.50): fitted on dry days it pulls humidity down, and the gap was wet. An offset is also worse than nothing. A calibration through the dew point (offset on temperature and on dew point, humidity recomputed) was tried in the exploration and was no better than the plain reference.
- **Pressure: offset.** The offset is the height difference between the station and the model's ground, so it does not depend on the weather. A linear fit is worse out of sample.
- **Wind speed and gusts: ratio.** The station sits lower and more sheltered than a 10 m mast in open ground, so it sees a fixed fraction of the model wind. A linear fit is about the same held out but has an intercept that makes no physical sense (wind at zero reference). The gust ratio differs between the October days (0.65) and B (0.52): gusts depend more on the type of weather. The combined 0.58 is a compromise.
- **Wind direction: offset only**, from the 23 hours of B. With no offset the error is 73°; with it, 8°. The 73° is local: buildings and the terrain turn the wind near the ground, and it may not hold for every wind direction (B was all south-westerly flow).
- **Rain: the reference as it is.** The healthy periods have almost no rain (three single tips in A, one real tip in B), so a ratio cannot be fitted. On the rainy days the station did measure, the models are low (2026-11-11: station 38.3 mm, ECMWF 29.7, the six models 26.6 to 36.3), but two or three days are not enough to correct for it. The estimate is rounded to whole tips so it looks like gauge data and adds up like it.

## 5. Bad readings found

### 5.1 Wind speed and gusts, 2026-10-25 00:01 to 2026-11-12 06:39: replaced

Station wind divided by reference wind, hours with reference wind between 1.5 and 5 m/s (ECMWF / ICON), and the share of minutes with wind exactly 0:

| days | station / reference | minutes at 0 m/s |
|---|---|---|
| 2026-10-21 to 10-24 | 0.23-0.46 / 0.30-0.67 | 13-23 % |
| 2026-10-25 | 0.15 / 0.21 | 31 % |
| 2026-10-26 to 11-02 | 0.02-0.19 / 0.19-0.30 | 34-53 % |
| 2026-11-03 to 11-08 | 0.00-0.08 / 0.01-0.24 | 39-77 % |
| 2026-11-09 to 11-11 | 0.02 / 0.03-0.06 | 28-48 % |
| 2026-11-17 to 11-18 (new board) | 0.35 / 0.42-0.58 | 0 % |

Binned by reference wind (best_match, exploration): with a reference of 3-4 m/s the station read 1.12 m/s on 2026-10-20 to 10-24, 0.13 m/s on 11-03 to 11-08, 0.22 m/s on 11-09 to 11-12, and 1.73 m/s after the remount. On 2026-11-08 best_match had about 3 m/s all afternoon and gusts of 5-6 m/s; the station had 0.00-0.07 m/s and gusts under 1 m/s. On 2026-11-09 and 11-10, with 4-6 m/s and gusts of 9-14 m/s in the model, it had 0.0-0.7 m/s, and mostly under 0.5. That is not calm weather.

The response fell over a few days from 2026-10-25 and kept falling until the gap; 2026-10-25 is the first day it is below the 2026-10-21 to 10-24 range for every model, so the window starts there. After the remount, with the same anemometer moved slightly, it reads as it did in its first days. So the cups and the reed switch are probably fine, and the fault was in the old board's side of the circuit (the same corrosion that killed the ESP32, at the input or its terminal). That cause is an inference: the data shows when and how much, not where.

The vane kept working through this (its directions look as plausible as before), so wind direction there is kept.

### 5.2 Temperature, humidity and pressure, 2026-11-09 to the gap: kept, except the nulls

Each day against the calibrated reference (MAE, and bias = reference − station); for comparison, the held-out error of the healthy hours and two healthy days after the remount:

| | healthy | 11-09 | 11-10 | 11-11 | 11-12 | 11-17 (new) | 11-18 (new) |
|---|---|---|---|---|---|---|---|
| temperature (°C) | 1.18 | 1.15 (+1.13) | 0.87 (+0.87) | 1.06 (+1.06) | 1.69 (+1.69) | 0.26 | 0.99 |
| humidity (%) | 7.86 | 8.23 (−8.16) | 10.27 (−10.27) | 3.87 | 6.47 | 7.70 | 8.24 (−8.07) |
| pressure (hPa) | 0.38 | 0.33 | 0.61 | 0.13 | 0.94 | 0.84 | 0.66 |

All three stay within the error of the healthy hours.

- **Pressure.** The 2026-11-12 average of 918.9 hPa (minimum 916.8) is real: a deep low passed. ICON's ground pressure fell to 929.7 hPa at 2026-11-11 23:00, which is 914.9 hPa at the station's height with the −14.81 offset, and when the sensor came back (03:15) the station read 917.4 hPa (mean of the hour) against 916.7 expected.
- **Humidity at about 100 %.** The station reads 8-10 points above the reference on every rainy day, healthy ones included: on 2026-11-18 from 03:00 to 08:00, after the remount, the station read 99-100 % for five hours of drizzle while ECMWF had 92-98 % and ICON 84-89 %. In the exploration (best_match), the station's dew point on 2026-11-09 and 11-10 was within 1 °C of the reference's, as on the healthy days, so temperature and humidity together describe the same air as the model. A wet sensor and saturated air both read 100 % and cannot be told apart here; the values are kept.
- **Nulls.** From 2026-11-11 08:59 to 2026-11-12 03:17 the BME280 did not answer. Ingest dropped its 184.1 °C and −184.3 hPa (the `value_dropped` events) or the board sent nothing for it, so 898 readings of 2026-11-11 and 195 of 2026-11-12 have temperature, humidity and pressure null. Those three fields get estimates there; wind and rain in those readings are untouched by this window.

### 5.3 Rain

| period | decision | why |
|---|---|---|
| 2026-11-09, 17.9 mm | kept | Single tips every 2-5 minutes from 01:14 to 04:42, starting an hour after the models' rain did. A shower from 09:26 to 10:07 with about 7.5 mm, while the temperature fell 2 °C in 16 minutes and gusts reached 6.9 m/s: a real convective shower that the models missed. 2-3 times the models' daily total, which is common for showers. |
| 2026-11-10 00:01 to 16:42 | replaced | The day of the phantom-rain incident (`docs/hardware-log.md`, 2026-11-10). The worst minutes were already set to 0, but about 10.6 mm of single tips remained, up to 2.8 mm in an hour, while all six models had 0.0-0.2 mm an hour until midday; the hardware log describes light rain all morning, about 1 mm by Open-Meteo at the time. With the line noisy, a single tip cannot be told from noise. |
| 2026-11-10 16:43 to 2026-11-12 06:39 | kept | Firmware 0.5.1 rejects minutes with tips less than 2 s apart and never had to (no `rain` noise events). 2026-11-11: 38.3 mm against 26.6-36.3 mm in the models, the right size and timing. |
| 2026-11-17 16:14 to 2026-11-18 16:16 | replaced | Gauge on terminal 33, which is not connected (`docs/hardware-log.md`, 2026-11-18). |
| Single tips on 10-25, 10-30, 11-06 (UTC) | kept | One tip each, 0.28 mm, with no rain in any model: probably noise, but too small to matter and in the healthy period. Left as measured. |

### 5.4 Wind direction before the gap: not changed, open question

With the B calibration (+73°), the old vane's directions are off by −45° on 2026-11-09, −17° on 11-10 and 11-11, and +52° on 11-12; on the October days the station minus model difference was about 40° instead of 73°. The old vane had `VANE_OFFSET_DEG` 0, and on 2026-11-17 it read 315° when held north. If the mount was not turned when the board was changed, the October and early November directions are 45° off. The data does not settle it (the difference moves in both directions from day to day), so they are left as measured. Owner: was the vane mount turned on 2026-11-17?

## 6. What gets inserted and changed

| window | what | readings | fields estimated |
|---|---|---|---|
| gap, 2026-11-12 06:40 to 2026-11-17 16:13 | inserted | 7,774 | all seven |
| BME280 null, 2026-11-11 08:00 to 2026-11-12 06:39 | changed where null | 1,093 | temperature, humidity, pressure |
| anemometer, 2026-10-25 00:01 to 2026-11-12 06:39 | changed | 26,078 | wind speed, gust |
| rain noise, 2026-11-10 00:01 to 16:42 | changed | 988 | rain |
| dead terminal, 2026-11-17 16:14 to 2026-11-18 16:16 | changed | 1,438 | rain |

Total: 7,774 inserted, 27,516 changed (some readings are in two windows), 112,279 values, 35,290 rows in `readings_originals`. Short gaps of a few minutes elsewhere (57 minutes on 2026-11-02, 30 on 11-10, 109 on 11-11) are not filled.

Effect on the days (Madrid days, as `readings_daily`), from the dry run:

| Madrid day | readings | rain mm | wind avg m/s | temp avg °C |
|---|---|---|---|---|
| 10-25 to 11-08 | unchanged | unchanged | 0.01-0.37 → 0.24-1.44 | unchanged |
| 11-09 | 1440 | 17.9 | 0.15 → 1.74 | 12.38 |
| 11-10 | 1410 | 17.3 → 9.2 | 0.26 → 2.03 | 13.24 |
| 11-11 | 1331 | 34.4 | 0.21 → 1.92 | 12.56 → 12.97 |
| 11-12 | 417 → 1397 | 6.1 → 8.1 | 0.98 → 2.19 | 11.41 → 13.22 |
| 11-13 | 0 → 1440 | 2.8 | 1.62 | 12.47 |
| 11-14 | 0 → 1440 | 7.8 | 1.46 | 11.36 |
| 11-15 | 0 → 1440 | 1.7 | 1.30 | 10.88 |
| 11-16 | 0 → 1440 | 0.0 | 1.07 | 11.68 |
| 11-17 | 406 → 1440 | 0.0 → 0.8 | 2.30 → 1.78 | 14.37 → 12.17 |
| 11-18 | 1072 | 0.3 → 3.6 | 1.66 | 14.44 |

The numbers will move a little on each run, because period B grows.

## 7. Marking estimated data

Migration `backend/supabase/migrations/20261118100000_estimated_readings.sql`:

- `readings.estimated text[]`: the fields of that reading that are estimated, for example `{wind_avg_ms,wind_gust_ms}`. Null means every value was measured, so all existing readings stay as they are. A check constraint allows only the seven measured field names. Per field, because most changed readings keep most of their measured values (a reading with estimated wind still has measured temperature and rain).
- `readings_originals (device_id, ts, original jsonb, reason, replaced_at)`, primary key `(device_id, ts)`: one row for every reading the backfill inserted or changed. `original` is the whole reading as the station stored it (`to_jsonb` of the row), or null when there was no reading for that minute and the backfill inserted one. Same access rules as `readings`: RLS on, nothing for the API roles.

**Why one reading per minute.** The aggregates average the minutes of an hour or a day (`readings_daily` weights by `samples`). One estimated reading per minute weighs exactly like a measured minute, so a day that is half measured and half estimated (2026-11-12, 2026-11-17) gets a true time average, the rain adds up, and `hourly_stats()`, `refresh_aggregates_since()` and `refresh_aggregates_rebuild()` need no change. A single hourly row instead would weigh as one minute against 60 measured ones.

The aggregates themselves do not say which hours or days contain estimates. Showing that on the dashboard is a follow-up (bead below).

## 8. How to apply, check and undo

1. Review this report, the migration and the dry run.
2. Apply the migration: `pnpm db:push`. Then, in `frontend/`, `pnpm gen:types` and `pnpm typecheck` (the generated types get the new column and table).
3. Dry run, read-only: `pnpm backfill`. It prints the calibration, the windows with their counts and the effect per day. `pnpm backfill analyze` prints the comparison tables of this report.
4. Apply: `pnpm backfill --apply`. In one transaction it undoes any earlier run, stores the originals, updates and inserts the readings, checks every count (anything unexpected rolls everything back) and runs `select public.refresh_aggregates_rebuild();`.
5. Check:
   ```sql
   select count(*) from public.readings_originals;                       -- 35,290 (as of the dry run)
   select count(*) from public.readings_originals where original is null; -- inserted readings
   select count(*) from public.readings where estimated is not null;      -- same as the first
   select day, samples, rain_mm, wind_avg_ms from public.readings_daily
   where device_id = 'meteo-station-lasrozas-1' and day between '2026-11-08' and '2026-11-18' order by day;
   ```

Running `--apply` twice gives the same result: it always starts from the originals, so nothing is doubled.

**Undo:** `pnpm backfill --undo`. In one transaction it writes each original back into its reading (and clears `estimated`), deletes the readings the backfill inserted, empties `readings_originals` for the station and rebuilds the aggregates. Without the script, the same in SQL:

```sql
begin;
update public.readings r set
  temp_c = (o.original ->> 'temp_c')::real, humidity_pct = (o.original ->> 'humidity_pct')::real,
  pressure_hpa = (o.original ->> 'pressure_hpa')::real, wind_avg_ms = (o.original ->> 'wind_avg_ms')::real,
  wind_gust_ms = (o.original ->> 'wind_gust_ms')::real, wind_dir_deg = (o.original ->> 'wind_dir_deg')::smallint,
  rain_mm = (o.original ->> 'rain_mm')::real, estimated = null
from public.readings_originals o
where o.original is not null and r.device_id = o.device_id and r.ts = o.ts;
delete from public.readings r using public.readings_originals o
where o.original is null and r.device_id = o.device_id and r.ts = o.ts;
delete from public.readings_originals;
select public.refresh_aggregates_rebuild();
commit;
```

Removing the feature entirely after an undo: drop the table and the column (a new migration).

## 9. Limits and open questions

- The estimates are model values with the errors of section 4: about 1.2 °C, 8 % humidity, 0.4 hPa, 0.4 m/s wind, 1.2 m/s gusts and 8° direction per hour. Rain is the weakest: the models were low on the rainy days the station measured (2026-11-11 by 5-30 %, 2026-11-09 by half or more), and they disagree with each other by a factor of two on some gap days (2026-11-14: 3.9 mm in best_match, 7.8 mm in ECMWF).
- Calibrations for wind direction and gusts rest on about one day after the remount. Running the backfill a few days later gives them more data.
- At the edges of a window the estimate can step against the measured value (about 1.7 °C at 2026-11-12 06:40, when the station was colder than the model in the storm). Edges are not blended.
- Open question for the owner: was the vane mount turned on 2026-11-17 (section 5.4)?
- Not done: the dashboard does not show which days are estimated yet, and the aggregates do not count estimated minutes.
