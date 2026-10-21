# Aviso diario con la previsión (push 9:00): plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** cada día a las 9:05 de Madrid, quien tenga la web instalada como app y se haya apuntado recibe una notificación push con la previsión del día, con las temperaturas corregidas con la estación.

**Arquitectura:**
- La lógica pura va en `frontend/server/` y se prueba con Vitest: Open-Meteo, temperatura corregida, texto y validación.
- Tres endpoints nuevos en Vercel (`api/push/subscribe`, `api/push/unsubscribe`, `api/cron/daily-forecast`) usan esa lógica, Supabase y `web-push`.
- `pg_cron` + `pg_net` en Supabase llaman al cron.
- La web gana un manifest, un service worker mínimo y el bloque "Aviso diario".

**Tecnología:** TypeScript, Vercel Functions (Node), Supabase (Postgres, `pg_cron`, `pg_net`, Vault), Open-Meteo (forecast y previous runs), `web-push`, React 19, Vitest y `temporal-polyfill`.

**Spec:** `docs/superpowers/specs/2026-10-21-daily-forecast-push-design.md`. Léela antes de empezar: el formato exacto del texto está en su sección 4.

## Restricciones globales

- **No arrancar servidores** (`pnpm dev`, `vercel dev`, Supabase local) ni ejecutar `pio`. Se pueden ejecutar `pnpm test`, `pnpm typecheck`, `pnpm gen:types`, `pnpm add` y `vite build` con salida en el scratchpad.
- **Commits:**
  - nunca sin el visto bueno del usuario;
  - sin `Co-Authored-By` ni "Generated with";
  - nunca en `main`: rama `feat/daily-forecast-push`.
- **Secretos:**
  - nunca leer, imprimir ni commitear secretos, `.env.local` ni `secrets.h`;
  - las coordenadas solo vienen de `STATION_COORDINATES` y nunca salen en una respuesta.
- **Idioma y exports:**
  - código, identificadores y comentarios en inglés;
  - textos visibles (web y notificación) en español;
  - solo exports con nombre, sin `export default`.
- **Imports y variables de entorno:**
  - `frontend/server/` nunca se importa desde `frontend/src/`;
  - los imports de `api/` y `server/` llevan sufijo `.js`;
  - las variables del servidor nunca llevan prefijo `VITE_`, salvo `VITE_VAPID_PUBLIC_KEY`, que es pública por diseño y la lee también el servidor.
- **Tras los tests**, borrar `frontend/.vitest` si existe.
- **Tareas:** usar `bd` (meteo-upk) con `--append-notes`, nunca `--notes`. Nunca `bd dolt push`.
- **Constantes de la spec**, literales:

  | Constante | Valor |
  |---|---|
  | Hora de envío | 9 en `Europe/Madrid` |
  | Cron | `'5 7,8 * * *'` |
  | Corrección máxima | ±5 °C |
  | Cobertura de la noche | 430 de 540 lecturas |
  | Cobertura de ayer | 1200 de 1440 muestras |
  | Límite por IP | 10 peticiones por hora |
  | Suscripciones máximas | 1000 |
  | `TTL` | 6 h |
  | Envíos en paralelo | 10 |
  | `topic` | `daily-forecast` |
  | Hosts de push | `web.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com` |
  | Claves | `p256dh` 65 bytes, `auth` 16 bytes |
  | Longitud máxima del endpoint | 1000 |

## Puntos a revisar con cuidado

1. **Secreto de otra longitud** en `Authorization`: `timingSafeEqual` lanza una excepción si las longitudes difieren. Debe devolver `false`, no un 500. Test en la tarea 5.
2. **El servidor rechaza la suscripción** (429, 503 o red caída) después de que el navegador la haya creado: hay que anularla en el navegador, o el móvil creerá que está apuntado sin estarlo. Test en la tarea 9.
3. **Temperaturas entre −0,5 y 0** se redondean a `-0`, que debe escribirse "0 °C" y contar como helada. Test en la tarea 4.
4. **Probabilidad de lluvia `null`** en algunas horas de Open-Meteo: cuenta como 0, sin `NaN` ni "null %". Test en la tarea 4.
5. **Cambio de hora** (25 de octubre, la hora 2 se repite): las horas de hoy y la hora siguiente para la lluvia y las rachas deben seguir siendo correctas. Test en la tarea 2.

---

### Tarea 1: Migración de Supabase

**Ficheros:**
- Crear: `backend/supabase/migrations/20261021100000_push_notifications.sql`
- Modificar (generado): `frontend/shared/database.types.ts`

**Interfaces:**
- Produce:
  - las tablas `push_subscriptions`, `push_requests` y `push_daily_runs`, con los tipos generados;
  - los trabajos de `pg_cron` `daily-forecast-push` y `push-requests-cleanup`.

- [ ] **Paso 1: escribir la migración**

```sql
-- Daily forecast push (docs/superpowers/specs/2026-10-21-daily-forecast-push-design.md).
-- Only the Vercel API (service_role, which bypasses RLS) touches these tables: RLS on and no
-- policies, so the browser keys get nothing.

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

-- One row per subscribe or unsubscribe request, for the limit per IP. The IP is stored only as
-- an HMAC. Rows older than a day are deleted every night.
create table public.push_requests (
  ip_hash text not null,
  at timestamptz not null default now()
);
create index push_requests_ip_hash_at on public.push_requests (ip_hash, at);

-- One row per day the notification went out (Madrid date). The day is claimed before sending,
-- so a repeated cron run never sends twice.
create table public.push_daily_runs (
  day date primary key,
  created_at timestamptz not null default now(),
  title text,
  body text,
  sent integer,
  failed integer,
  removed integer
);

alter table public.push_subscriptions enable row level security;
alter table public.push_requests enable row level security;
alter table public.push_daily_runs enable row level security;

-- The first delete the secret key gets, and only on subscriptions: unsubscribe, and endpoints
-- the push service reports gone (404, 410). Upserts update the endpoint and keys.
grant select, insert, delete on table public.push_subscriptions to service_role;
grant update (endpoint, p256dh, auth, last_sent_at) on table public.push_subscriptions to service_role;
grant select, insert on table public.push_requests to service_role;
grant select, insert on table public.push_daily_runs to service_role;
grant update (title, body, sent, failed, removed) on table public.push_daily_runs to service_role;

create extension if not exists pg_net with schema extensions;

-- 09:05 in Madrid is 07:05 UTC in summer and 08:05 UTC in winter: run at both, and the API acts
-- only when it is 9 in Madrid. The secret is read from Supabase Vault (name 'cron_secret'),
-- added by hand in the SQL editor, never in a migration.
select cron.schedule(
  'daily-forecast-push',
  '5 7,8 * * *',
  $$
  select net.http_post(
    url := 'https://gorraplanistas.vercel.app/api/cron/daily-forecast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'push-requests-cleanup',
  '30 3 * * *',
  $$delete from public.push_requests where at < now() - interval '1 day'$$
);
```

- [ ] **Paso 2 (lo hace el usuario): aplicar la migración**

El agente se detiene y pide al usuario que ejecute, desde `backend/`:

```bash
supabase db push
```

Hasta que exista el secreto en Vault (tarea 10), el cron llama sin secreto y recibe 401. No pasa nada.

- [ ] **Paso 3: regenerar los tipos y comprobarlos**

Desde `frontend/`:

```bash
pnpm gen:types && pnpm typecheck
```

Resultado esperado: `database.types.ts` incluye `push_subscriptions`, `push_requests` y `push_daily_runs`, y la comprobación de tipos pasa.

- [ ] **Paso 4: commit** (preguntar antes al usuario)

```bash
git add backend/supabase/migrations/20261021100000_push_notifications.sql frontend/shared/database.types.ts
git commit -m "feat(db): push subscriptions, rate limit and daily run tables, cron trigger"
```

---

### Tarea 2: Open-Meteo, las horas de hoy y lo que se preveía ayer

**Ficheros:**
- Modificar: `frontend/server/open-meteo.ts`
- Test: `frontend/server/open-meteo.test.ts`

**Interfaces:**
- Produce:
  - `interface TodayHour { hour: number; tempC: number; weatherCode: number; isDay: boolean; pressureHpa: number; windKmh: number; windDirDeg: number; gustKmh: number | null; precipMm: number | null; precipProbabilityPct: number | null }`
  - `interface OpenMeteoToday`, `todayUrl(c: Coordinates): string` y `toTodayHours(data: OpenMeteoToday, today: Temporal.PlainDate): TodayHour[]`
  - `interface OpenMeteoPreviousRuns`, `previousRunsUrl(c: Coordinates): string` y `previousDayForecastMax(data: OpenMeteoPreviousRuns, day: Temporal.PlainDate): number | null`
  - `fetchToday(c: Coordinates, today: Temporal.PlainDate): Promise<TodayHour[]>`: un reintento; lanza un error si faltan las horas 9 o 23.
  - `fetchYesterdayForecastMax(c: Coordinates, yesterday: Temporal.PlainDate): Promise<number | null>`: nunca lanza.

- [ ] **Paso 1: tests que fallan**

Añadir al import de `open-meteo.test.ts`: `previousDayForecastMax, previousRunsUrl, toTodayHours, todayUrl, type OpenMeteoPreviousRuns, type OpenMeteoToday`. Añadir también `import { Temporal } from 'temporal-polyfill';` si no está.

Añadir al final:

```ts
const unix = (iso: string) => Temporal.Instant.from(iso).epochMilliseconds / 1000;

describe('todayUrl', () => {
  it('asks for today and tomorrow by hour, wind in km/h, in Madrid time', () => {
    const url = new URL(todayUrl({ latitude: 40.4, longitude: -3.7 }));
    expect(`${url.origin}${url.pathname}`).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('forecast_days')).toBe('2');
    expect(url.searchParams.get('wind_speed_unit')).toBe('kmh');
    expect(url.searchParams.get('timezone')).toBe('Europe/Madrid');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('hourly')).toBe(
      'temperature_2m,weather_code,is_day,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability',
    );
  });
});

function todayData(times: string[]): OpenMeteoToday {
  const n = times.length;
  return {
    hourly: {
      time: times.map(unix),
      temperature_2m: times.map((_, i) => 10 + i),
      weather_code: Array<number>(n).fill(0),
      is_day: Array<number>(n).fill(1),
      pressure_msl: Array<number>(n).fill(1015),
      wind_speed_10m: Array<number>(n).fill(5),
      wind_direction_10m: Array<number>(n).fill(270),
      wind_gusts_10m: times.map((_, i) => 20 + i),
      precipitation: times.map((_, i) => i / 10),
      precipitation_probability: times.map((_, i) => i * 10),
    },
  };
}

describe('toTodayHours', () => {
  it('keeps today in Madrid and takes rain and gusts from the next hour', () => {
    // 22:00 and 23:00 on 22 Oct in Madrid (UTC+2), then 00:00 on the 23rd.
    const data = todayData(['2026-10-22T20:00:00Z', '2026-10-22T21:00:00Z', '2026-10-22T22:00:00Z']);
    const hours = toTodayHours(data, Temporal.PlainDate.from('2026-10-22'));
    expect(hours.map((h) => h.hour)).toEqual([22, 23]);
    expect(hours[1]).toEqual({
      hour: 23, tempC: 11, weatherCode: 0, isDay: true, pressureHpa: 1015, windKmh: 5, windDirDeg: 270,
      gustKmh: 22, precipMm: 0.2, precipProbabilityPct: 20,
    });
  });
  it('keeps both 2:00 hours when summer time ends', () => {
    // 25 Oct 2026: 00:00Z is 02:00 at UTC+2, 01:00Z is 02:00 again at UTC+1, 02:00Z is 03:00.
    const data = todayData(['2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z', '2026-10-25T02:00:00Z']);
    const hours = toTodayHours(data, Temporal.PlainDate.from('2026-10-25'));
    expect(hours.map((h) => h.hour)).toEqual([2, 2, 3]);
    expect(hours.map((h) => h.gustKmh)).toEqual([21, 22, null]);
  });
});

describe('previousRunsUrl', () => {
  it('asks the previous runs API for yesterday as forecast the day before', () => {
    const url = new URL(previousRunsUrl({ latitude: 40.4, longitude: -3.7 }));
    expect(`${url.origin}${url.pathname}`).toBe('https://previous-runs-api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('hourly')).toBe('temperature_2m_previous_day1');
    expect(url.searchParams.get('past_days')).toBe('1');
    expect(url.searchParams.get('forecast_days')).toBe('1');
    expect(url.searchParams.get('timezone')).toBe('Europe/Madrid');
  });
});

describe('previousDayForecastMax', () => {
  it('takes the highest of that Madrid day, skipping missing values', () => {
    const data: OpenMeteoPreviousRuns = {
      hourly: {
        // 23:00 on the 20th, 14:00 and 15:00 on the 21st, 00:00 on the 22nd (Madrid, UTC+2).
        time: ['2026-10-20T21:00:00Z', '2026-10-21T12:00:00Z', '2026-10-21T13:00:00Z', '2026-10-21T22:00:00Z'].map(unix),
        temperature_2m_previous_day1: [30, 17.2, null, 25],
      },
    };
    expect(previousDayForecastMax(data, Temporal.PlainDate.from('2026-10-21'))).toBe(17.2);
  });
  it('is null when the day has no values', () => {
    const data: OpenMeteoPreviousRuns = { hourly: { time: [unix('2026-10-21T12:00:00Z')], temperature_2m_previous_day1: [null] } };
    expect(previousDayForecastMax(data, Temporal.PlainDate.from('2026-10-21'))).toBeNull();
  });
});
```

- [ ] **Paso 2: comprobar que fallan**

Ejecutar `pnpm vitest run server/open-meteo.test.ts` desde `frontend/`. Resultado esperado: FAIL, porque `todayUrl` y las demás no existen.

- [ ] **Paso 3: implementar en `open-meteo.ts`**

Añadir debajo de `FORECAST_URL`:

```ts
const PREVIOUS_RUNS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast';
```

Añadir al final del fichero:

```ts
// One hour of today's forecast for the 9:00 notification: hour h covers h:00 to h+1:00 in Madrid.
// Instant values (temperature, sky, pressure, wind) are Open-Meteo's at h:00; precipitation, its
// chance and gusts are its values at h+1:00, which cover the hour before that time.
export interface TodayHour {
  hour: number; // Madrid hour, 0-23 (2 twice when summer time ends)
  tempC: number;
  weatherCode: number;
  isDay: boolean;
  pressureHpa: number; // at sea level
  windKmh: number;
  windDirDeg: number; // where the wind comes from
  gustKmh: number | null;
  precipMm: number | null;
  precipProbabilityPct: number | null;
}

export interface OpenMeteoToday {
  hourly: {
    time: number[];
    temperature_2m: number[];
    weather_code: number[];
    is_day: number[];
    pressure_msl: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: (number | null)[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
  };
}

export function todayUrl({ latitude, longitude }: Coordinates): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'temperature_2m,weather_code,is_day,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability',
    timezone: TIME_ZONE,
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
    // Tomorrow's 00:00 holds the rain and gusts of today's last hour.
    forecast_days: '2',
  });
  return `${FORECAST_URL}?${params}`;
}

export function toTodayHours(data: OpenMeteoToday, today: Temporal.PlainDate): TodayHour[] {
  const { hourly } = data;
  const hours: TodayHour[] = [];
  hourly.time.forEach((t, i) => {
    const local = Temporal.Instant.fromEpochMilliseconds(t * 1000).toZonedDateTimeISO(TIME_ZONE);
    if (!local.toPlainDate().equals(today)) {
      return;
    }
    hours.push({
      hour: local.hour,
      tempC: hourly.temperature_2m[i],
      weatherCode: hourly.weather_code[i],
      isDay: hourly.is_day[i] === 1,
      pressureHpa: hourly.pressure_msl[i],
      windKmh: hourly.wind_speed_10m[i],
      windDirDeg: hourly.wind_direction_10m[i],
      gustKmh: hourly.wind_gusts_10m[i + 1] ?? null,
      precipMm: hourly.precipitation[i + 1] ?? null,
      precipProbabilityPct: hourly.precipitation_probability[i + 1] ?? null,
    });
  });
  return hours;
}

// What the model run of the day before forecast, hour by hour (Open-Meteo's Previous Runs API).
export interface OpenMeteoPreviousRuns {
  hourly: { time: number[]; temperature_2m_previous_day1: (number | null)[] };
}

export function previousRunsUrl({ latitude, longitude }: Coordinates): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'temperature_2m_previous_day1',
    timezone: TIME_ZONE,
    timeformat: 'unixtime',
    past_days: '1',
    forecast_days: '1',
  });
  return `${PREVIOUS_RUNS_URL}?${params}`;
}

// The highest temperature forecast for `day` (Madrid) by the run of the day before.
export function previousDayForecastMax(data: OpenMeteoPreviousRuns, day: Temporal.PlainDate): number | null {
  const { time, temperature_2m_previous_day1: temps } = data.hourly;
  let max: number | null = null;
  time.forEach((t, i) => {
    const temp = temps[i];
    const date = Temporal.Instant.fromEpochMilliseconds(t * 1000).toZonedDateTimeISO(TIME_ZONE).toPlainDate();
    if (temp !== null && date.equals(day) && (max === null || temp > max)) {
      max = temp;
    }
  });
  return max;
}

// Today's hours, with one retry. Throws without hours 9 to 23: the message needs them all.
export async function fetchToday(coordinates: Coordinates, today: Temporal.PlainDate): Promise<TodayHour[]> {
  const url = todayUrl(coordinates);
  const data = await getOpenMeteo<OpenMeteoToday>(url).catch(() => getOpenMeteo<OpenMeteoToday>(url));
  const hours = toTodayHours(data, today);
  if (!hours.some((h) => h.hour === 9) || !hours.some((h) => h.hour === 23)) {
    throw new Error('Open-Meteo: today is incomplete');
  }
  return hours;
}

// Optional: without it the correction uses only the 9:00 reading.
export async function fetchYesterdayForecastMax(coordinates: Coordinates, yesterday: Temporal.PlainDate): Promise<number | null> {
  try {
    return previousDayForecastMax(await getOpenMeteo<OpenMeteoPreviousRuns>(previousRunsUrl(coordinates)), yesterday);
  } catch (error) {
    console.error(error);
    return null;
  }
}
```

- [ ] **Paso 4: comprobar que pasan**

Ejecutar `pnpm vitest run server/open-meteo.test.ts && pnpm typecheck`. Resultado esperado: PASS.

- [ ] **Paso 5: commit** (preguntar antes al usuario)

```bash
git add frontend/server/open-meteo.ts frontend/server/open-meteo.test.ts
git commit -m "feat(api): Open-Meteo hours for today and yesterday's forecast high"
```

---

### Tarea 3: Temperatura corregida con la estación

**Ficheros:**
- Crear: `frontend/server/daily-temperature.ts`
- Test: `frontend/server/daily-temperature.test.ts`

**Interfaces:**
- Consume: `TodayHour`, de la tarea 2.
- Produce:
  - `interface Extreme { tempC: number; hour: number }`
  - `interface StationDay { temp9: number | null; nightMin: Extreme | null; yesterdayMax: number | null }`
  - `interface TodayRange { min: Extreme; max: Extreme }`
  - `interface TempReading { ts: string; temp_c: number | null }`
  - `temperatureCorrection(station: StationDay, hours: TodayHour[], yesterdayForecastMax: number | null): number`
  - `todayRange(hours: TodayHour[], station: StationDay, correction: number): TodayRange`
  - `nightMinimum(readings: TempReading[]): Extreme | null`
  - `measuredYesterdayMax(row: { temp_max: number | null; samples: number } | null): number | null`

- [ ] **Paso 1: tests que fallan**

```ts
import { describe, expect, it } from 'vitest';
import {
  measuredYesterdayMax, nightMinimum, temperatureCorrection, todayRange, type StationDay,
} from './daily-temperature';
import type { TodayHour } from './open-meteo';

function hour(h: number, tempC: number): TodayHour {
  return {
    hour: h, tempC, weatherCode: 0, isDay: true, pressureHpa: 1015, windKmh: 5, windDirDeg: 0,
    gustKmh: 10, precipMm: 0, precipProbabilityPct: 0,
  };
}

// A model day: 4 °C at 5:00, 10 °C at 9:00, 20 °C at 16:00, 8 °C at 23:00, 12 °C otherwise.
const TEMPS: Record<number, number> = { 5: 4, 9: 10, 16: 20, 23: 8 };
const DAY = Array.from({ length: 24 }, (_, h) => hour(h, TEMPS[h] ?? 12));

const station = (values: Partial<StationDay> = {}): StationDay => ({ temp9: null, nightMin: null, yesterdayMax: null, ...values });

describe('temperatureCorrection', () => {
  it('averages the 9:00 error and yesterday high error', () => {
    // 9:00: 12 measured vs 10 forecast = +2. Yesterday: 21 measured vs 20 forecast = +1.
    expect(temperatureCorrection(station({ temp9: 12, yesterdayMax: 21 }), DAY, 20)).toBe(1.5);
  });
  it('uses the one it has', () => {
    expect(temperatureCorrection(station({ temp9: 12 }), DAY, 20)).toBe(2);
    expect(temperatureCorrection(station({ yesterdayMax: 21 }), DAY, 20)).toBe(1);
    expect(temperatureCorrection(station({ yesterdayMax: 21 }), DAY, null)).toBe(0);
  });
  it('is 0 without station data', () => {
    expect(temperatureCorrection(station(), DAY, 20)).toBe(0);
  });
  it('is capped at 5 °C either way', () => {
    expect(temperatureCorrection(station({ temp9: 30 }), DAY, null)).toBe(5);
    expect(temperatureCorrection(station({ temp9: -2 }), DAY, null)).toBe(-5);
  });
});

describe('todayRange', () => {
  it('corrects the model high from 9:00 on', () => {
    expect(todayRange(DAY, station(), 1).max).toEqual({ tempC: 21, hour: 16 });
  });
  it('takes the measured night low when it is the lowest', () => {
    expect(todayRange(DAY, station({ nightMin: { tempC: 6, hour: 7 } }), 1).min).toEqual({ tempC: 6, hour: 7 });
  });
  it('takes a lower corrected low later in the day', () => {
    expect(todayRange(DAY, station({ nightMin: { tempC: 10, hour: 6 } }), 1).min).toEqual({ tempC: 9, hour: 23 });
  });
  it('without a measured low, takes the model low of the whole day', () => {
    expect(todayRange(DAY, station(), 1).min).toEqual({ tempC: 5, hour: 5 });
  });
});

describe('nightMinimum', () => {
  // From 00:00 on 22 Oct in Madrid (22:00Z the day before), one reading a minute.
  const readings = (count: number) => Array.from({ length: count }, (_, i) => ({
    ts: new Date(Date.parse('2026-10-21T22:00:00Z') + i * 60_000).toISOString(),
    temp_c: i === 300 ? 3.5 : 10, // 05:00 in Madrid
  }));
  it('finds the lowest reading and its Madrid hour', () => {
    expect(nightMinimum(readings(430))).toEqual({ tempC: 3.5, hour: 5 });
  });
  it('is null with fewer than 430 readings with a temperature', () => {
    expect(nightMinimum(readings(429))).toBeNull();
    expect(nightMinimum(readings(430).map((r, i) => (i === 0 ? { ...r, temp_c: null } : r)))).toBeNull();
  });
});

describe('measuredYesterdayMax', () => {
  it('needs 1200 samples', () => {
    expect(measuredYesterdayMax({ temp_max: 21.3, samples: 1200 })).toBe(21.3);
    expect(measuredYesterdayMax({ temp_max: 21.3, samples: 1199 })).toBeNull();
    expect(measuredYesterdayMax({ temp_max: null, samples: 1440 })).toBeNull();
    expect(measuredYesterdayMax(null)).toBeNull();
  });
});
```

- [ ] **Paso 2: comprobar que fallan**

Ejecutar `pnpm vitest run server/daily-temperature.test.ts`. Resultado esperado: FAIL, porque el módulo no existe.

- [ ] **Paso 3: implementar**

```ts
// Today's high and low for the 9:00 notification: Open-Meteo corrected with what the station
// measured. Pure, so it is unit-tested; the data is read in daily-data.ts.
import { Temporal } from 'temporal-polyfill';
import type { TodayHour } from './open-meteo.js';
import { TIME_ZONE } from './params.js';

// A sensor fault must not turn into an absurd forecast.
export const MAX_CORRECTION_C = 5;
// The station is trusted with 80 % of the minutes: 430 of the 540 from 00:00 to 09:00, 1200 of
// a day's 1440.
export const NIGHT_MIN_READINGS = 430;
export const YESTERDAY_MIN_SAMPLES = 1200;
const FIRST_HOUR = 9;

export interface Extreme {
  tempC: number;
  hour: number; // Madrid
}

export interface StationDay {
  temp9: number | null; // measured at 9:00
  nightMin: Extreme | null; // measured since 00:00, null without enough readings
  yesterdayMax: number | null; // measured, null without enough samples
}

export interface TodayRange {
  min: Extreme;
  max: Extreme;
}

export interface TempReading {
  ts: string;
  temp_c: number | null;
}

// The mean of the 9:00 error (measured - model) and yesterday's high error (measured - what
// the run of the day before forecast), each when there is data, capped; 0 with neither.
export function temperatureCorrection(station: StationDay, hours: TodayHour[], yesterdayForecastMax: number | null): number {
  const errors: number[] = [];
  const model9 = hours.find((h) => h.hour === FIRST_HOUR);
  if (station.temp9 !== null && model9) {
    errors.push(station.temp9 - model9.tempC);
  }
  if (station.yesterdayMax !== null && yesterdayForecastMax !== null) {
    errors.push(station.yesterdayMax - yesterdayForecastMax);
  }
  if (errors.length === 0) {
    return 0;
  }
  const mean = errors.reduce((total, e) => total + e, 0) / errors.length;
  return Math.max(-MAX_CORRECTION_C, Math.min(MAX_CORRECTION_C, mean));
}

function lowest(hours: TodayHour[]): TodayHour {
  return hours.reduce((a, b) => (b.tempC < a.tempC ? b : a));
}

// High: the model's from 9:00 on, corrected. Low: at 9:00 the night low has usually been
// measured already, so the lower of that and the model's corrected low for the rest of the day;
// without a measured one, the model's corrected low of the whole day. `hours` must hold 9 to 23.
export function todayRange(hours: TodayHour[], station: StationDay, correction: number): TodayRange {
  const corrected = (h: TodayHour): Extreme => ({ tempC: h.tempC + correction, hour: h.hour });
  const rest = hours.filter((h) => h.hour >= FIRST_HOUR);
  const max = corrected(rest.reduce((a, b) => (b.tempC > a.tempC ? b : a)));
  if (!station.nightMin) {
    return { min: corrected(lowest(hours)), max };
  }
  const later = corrected(lowest(rest));
  return { min: later.tempC < station.nightMin.tempC ? later : station.nightMin, max };
}

// The lowest reading from 00:00 to 09:00 (the query picks them) and its Madrid hour.
export function nightMinimum(readings: TempReading[]): Extreme | null {
  const valid = readings.filter((r): r is { ts: string; temp_c: number } => r.temp_c !== null);
  if (valid.length < NIGHT_MIN_READINGS) {
    return null;
  }
  const min = valid.reduce((a, b) => (b.temp_c < a.temp_c ? b : a));
  return { tempC: min.temp_c, hour: Temporal.Instant.from(min.ts).toZonedDateTimeISO(TIME_ZONE).hour };
}

export function measuredYesterdayMax(row: { temp_max: number | null; samples: number } | null): number | null {
  return row && row.samples >= YESTERDAY_MIN_SAMPLES ? row.temp_max : null;
}
```

- [ ] **Paso 4: comprobar que pasan**

Ejecutar `pnpm vitest run server/daily-temperature.test.ts && pnpm typecheck`. Resultado esperado: PASS.

- [ ] **Paso 5: commit** (preguntar antes al usuario)

```bash
git add frontend/server/daily-temperature.ts frontend/server/daily-temperature.test.ts
git commit -m "feat(api): today's high and low corrected with the station"
```

---

### Tarea 4: El texto de la notificación

**Ficheros:**
- Crear: `frontend/server/daily-message.ts`
- Test: `frontend/server/daily-message.test.ts`

**Interfaces:**
- Consume: `TodayHour` (tarea 2) y `TodayRange` (tarea 3).
- Produce:
  - `SEND_HOUR = 9` e `isSendHour(now: Temporal.Instant): boolean`
  - `interface DailyMessage { title: string; body: string }`
  - `interface DailyInput { stationName: string; today: Temporal.PlainDate; hours: TodayHour[]; range: TodayRange }`
  - `type Sky` y `skyOf(code: number): Sky`
  - `skyLine`, `pressureSituation`, `warnings`, `temperatureLine`, `rainLine`, `windLine` y `title`
  - `buildDailyMessage(input: DailyInput): DailyMessage`

- [ ] **Paso 1: tests que fallan**

```ts
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  buildDailyMessage, isSendHour, pressureSituation, rainLine, skyLine, skyOf, temperatureLine, title, warnings, windLine,
} from './daily-message';
import type { TodayRange } from './daily-temperature';
import type { TodayHour } from './open-meteo';

function hour(h: number, values: Partial<TodayHour> = {}): TodayHour {
  return {
    hour: h, tempC: 12, weatherCode: 0, isDay: true, pressureHpa: 1015, windKmh: 10, windDirDeg: 0,
    gustKmh: 10, precipMm: 0, precipProbabilityPct: 0, ...values,
  };
}

// A whole day where `change(h)` sets each hour's values.
const day = (change: (h: number) => Partial<TodayHour> = () => ({})) => Array.from({ length: 24 }, (_, h) => hour(h, change(h)));
const range = (min: number, max: number): TodayRange => ({ min: { tempC: min, hour: 7 }, max: { tempC: max, hour: 16 } });

describe('isSendHour', () => {
  it('is 9 in Madrid, summer or winter', () => {
    expect(isSendHour(Temporal.Instant.from('2026-10-22T07:05:00Z'))).toBe(true); // UTC+2
    expect(isSendHour(Temporal.Instant.from('2026-10-22T08:05:00Z'))).toBe(false);
    expect(isSendHour(Temporal.Instant.from('2026-12-10T07:05:00Z'))).toBe(false); // UTC+1
    expect(isSendHour(Temporal.Instant.from('2026-12-10T08:05:00Z'))).toBe(true);
  });
});

describe('skyOf', () => {
  it('groups the WMO codes', () => {
    expect([0, 1, 2, 3, 45, 48, 51, 61, 67, 71, 77, 80, 82, 85, 86, 95, 99].map(skyOf)).toEqual([
      'clear', 'clear', 'partly', 'cloudy', 'fog', 'fog', 'rain', 'rain', 'rain', 'snow', 'snow',
      'showers', 'showers', 'snow', 'snow', 'storm', 'storm',
    ]);
  });
});

describe('skyLine', () => {
  it('says it once when the whole day is the same', () => {
    expect(skyLine(day())).toBe('☀️ Soleado todo el día.');
  });
  it('names each period with its emoji, the moon for a clear night', () => {
    const hours = day((h) => ({ weatherCode: h >= 14 && h < 20 ? 80 : 0 }));
    expect(skyLine(hours)).toBe('☀️ Soleado por la mañana, 🌦️ chubascos por la tarde y 🌙 despejado por la noche.');
  });
  it('breaks a tie in favour of the more severe sky', () => {
    // Morning 9-13: two cloudy hours, two rainy ones, one clear.
    const codes: Record<number, number> = { 9: 3, 10: 3, 11: 61, 12: 61 };
    expect(skyLine(day((h) => ({ weatherCode: codes[h] ?? 0 })))).toBe(
      '🌧️ Lluvia por la mañana, ☀️ soleado por la tarde y 🌙 despejado por la noche.',
    );
  });
  it('ignores the hours before 9', () => {
    expect(skyLine(day((h) => ({ weatherCode: h < 9 ? 95 : 0 })))).toBe('☀️ Soleado todo el día.');
  });
});

describe('pressureSituation', () => {
  it('sees a high when the pressure is high and steady', () => {
    expect(pressureSituation(day(() => ({ pressureHpa: 1022 })))).toBe('Anticiclón, tiempo estable.');
  });
  it('sees a low when the pressure falls 5 hPa or is low', () => {
    expect(pressureSituation(day((h) => ({ pressureHpa: h === 23 ? 1006 : h === 9 ? 1012 : 1009 })))).toBe(
      'Se acerca una borrasca, la presión baja.',
    );
    expect(pressureSituation(day(() => ({ pressureHpa: 1004 })))).toBe('Se acerca una borrasca, la presión baja.');
  });
  it('says nothing otherwise', () => {
    expect(pressureSituation(day())).toBeNull();
  });
});

describe('warnings', () => {
  it('warns of storms in one period or across the day', () => {
    expect(warnings(day((h) => ({ weatherCode: h === 17 ? 95 : 0 })), range(5, 20))).toEqual(['⚠️ Ojo: tormentas por la tarde.']);
    expect(warnings(day((h) => ({ weatherCode: h === 10 || h === 21 ? 95 : 0 })), range(5, 20))).toEqual([
      '⚠️ Ojo: tormentas a lo largo del día.',
    ]);
  });
  it('warns of frost when the rounded low is 0 or less, heat at 35, and morning fog', () => {
    expect(warnings(day((h) => ({ weatherCode: h === 10 ? 45 : 0 })), range(-0.4, 35))).toEqual([
      '⚠️ Helada al amanecer.', '⚠️ Calor intenso.', '⚠️ Niebla por la mañana.',
    ]);
    expect(warnings(day(), range(0.5, 34.4))).toEqual([]);
  });
});

describe('temperatureLine', () => {
  it('rounds to whole degrees, never writing -0', () => {
    expect(temperatureLine(range(-0.4, 20.6))).toBe('🌡️ Entre 0 °C (7 h) y 21 °C (16 h).');
  });
});

describe('rainLine', () => {
  it('says no rain under 20 %, with the chance', () => {
    expect(rainLine(day((h) => ({ precipProbabilityPct: h === 12 ? 10 : 0 })))).toBe('☂️ Sin lluvia (10 %).');
  });
  it('treats a missing chance as 0 and ignores the hours before 9', () => {
    expect(rainLine(day((h) => ({ precipProbabilityPct: h === 7 ? 80 : null })))).toBe('☂️ Sin lluvia (0 %).');
  });
  it('gives the chance, the hours with 30 % or more and the amount', () => {
    const possible = day((h) => (h >= 16 && h <= 18 ? { precipProbabilityPct: 40, precipMm: 0.2 } : {}));
    expect(rainLine(possible)).toBe('💧 Posible lluvia (40 %) de 16 a 19 h, menos de 1 mm.');
    const rain = day((h) => (h >= 15 && h <= 19 ? { precipProbabilityPct: 70, precipMm: 0.8 } : {}));
    expect(rainLine(rain)).toBe('💧 Lluvia (70 %) de 15 a 20 h, unos 4 mm.');
  });
  it('leaves out the hours when none reaches 30 %', () => {
    expect(rainLine(day((h) => ({ precipProbabilityPct: h === 12 ? 25 : 0 })))).toBe('💧 Posible lluvia (25 %), menos de 1 mm.');
  });
});

describe('windLine', () => {
  it('gives the top speed and direction when gusts stay under 20 km/h', () => {
    expect(windLine(day((h) => (h === 12 ? { windKmh: 12, gustKmh: 15 } : {})))).toBe('💨 Viento flojo, hasta 12 km/h del norte.');
  });
  it('adds the top gust and its hour', () => {
    const hours = day((h) => ({ ...(h === 15 ? { windKmh: 25, windDirDeg: 270 } : {}), ...(h === 17 ? { gustKmh: 45 } : {}) }));
    expect(windLine(hours)).toBe('💨 Viento moderado, 25 km/h del oeste, con rachas de 45 km/h hacia las 17 h.');
  });
  it('uses the AEMET terms and 8 directions', () => {
    expect(windLine(day((h) => (h === 12 ? { windKmh: 50, windDirDeg: 225, gustKmh: 80 } : {})))).toMatch(/^💨 Viento fuerte, 50 km\/h del suroeste,/);
    expect(windLine(day((h) => (h === 12 ? { windKmh: 75, windDirDeg: 350, gustKmh: 100 } : {})))).toMatch(/^💨 Viento muy fuerte, 75 km\/h del norte,/);
  });
});

describe('title', () => {
  it('has the most severe sky of the day, the station and the day', () => {
    const hours = day((h) => ({ weatherCode: h >= 14 && h < 20 ? 80 : 0 }));
    expect(title('Madrid, Las Rozas', Temporal.PlainDate.from('2026-10-22'), hours)).toBe('🌦️ Madrid, Las Rozas · jueves 22');
  });
});

describe('buildDailyMessage', () => {
  it('writes the title and four lines', () => {
    const hours = day((h) => ({
      weatherCode: h >= 14 && h < 20 ? 80 : 0,
      pressureHpa: h === 9 ? 1012 : h === 23 ? 1006 : 1009,
      ...(h >= 15 && h <= 19 ? { precipProbabilityPct: 70, precipMm: 0.8 } : {}),
      ...(h === 15 ? { windKmh: 25, windDirDeg: 270 } : {}),
      ...(h === 17 ? { gustKmh: 45 } : {}),
    }));
    const message = buildDailyMessage({
      stationName: 'Madrid, Las Rozas',
      today: Temporal.PlainDate.from('2026-10-22'),
      hours,
      range: { min: { tempC: 9.2, hour: 7 }, max: { tempC: 20.8, hour: 16 } },
    });
    expect(message).toEqual({
      title: '🌦️ Madrid, Las Rozas · jueves 22',
      body: [
        '☀️ Soleado por la mañana, 🌦️ chubascos por la tarde y 🌙 despejado por la noche. Se acerca una borrasca, la presión baja.',
        '🌡️ Entre 9 °C (7 h) y 21 °C (16 h).',
        '💧 Lluvia (70 %) de 15 a 20 h, unos 4 mm.',
        '💨 Viento moderado, 25 km/h del oeste, con rachas de 45 km/h hacia las 17 h.',
      ].join('\n'),
    });
  });
});
```

- [ ] **Paso 2: comprobar que fallan**

Ejecutar `pnpm vitest run server/daily-message.test.ts`. Resultado esperado: FAIL, porque el módulo no existe.

- [ ] **Paso 3: implementar**

```ts
// The text of the 9:00 notification, from today's hourly forecast and the corrected high and
// low. Pure, so every rule is unit-tested. The format is in section 4 of
// docs/superpowers/specs/2026-10-21-daily-forecast-push-design.md.
import { Temporal } from 'temporal-polyfill';
import type { Extreme, TodayRange } from './daily-temperature.js';
import type { TodayHour } from './open-meteo.js';
import { TIME_ZONE } from './params.js';

export const SEND_HOUR = 9;

export interface DailyMessage {
  title: string;
  body: string;
}

export interface DailyInput {
  stationName: string;
  today: Temporal.PlainDate;
  hours: TodayHour[]; // today, 0-23 h
  range: TodayRange;
}

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'showers' | 'rain' | 'snow' | 'storm';

// Least to most severe.
const SEVERITY: Sky[] = ['clear', 'partly', 'cloudy', 'fog', 'showers', 'rain', 'snow', 'storm'];

const SKY_TEXT: Record<Sky, string> = {
  clear: 'soleado', partly: 'poco nuboso', cloudy: 'nuboso', fog: 'niebla',
  showers: 'chubascos', rain: 'lluvia', snow: 'nieve', storm: 'tormenta',
};

const SKY_EMOJI: Record<Sky, string> = {
  clear: '☀️', partly: '🌤️', cloudy: '☁️', fog: '🌫️', showers: '🌦️', rain: '🌧️', snow: '🌨️', storm: '⛈️',
};

interface Period {
  from: number; // first hour
  to: number; // hour after the last
  label: string;
}

const MORNING: Period = { from: 9, to: 14, label: 'por la mañana' };
const AFTERNOON: Period = { from: 14, to: 20, label: 'por la tarde' };
const NIGHT: Period = { from: 20, to: 24, label: 'por la noche' };
const PERIODS = [MORNING, AFTERNOON, NIGHT];

const DIRECTIONS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function isSendHour(now: Temporal.Instant): boolean {
  return now.toZonedDateTimeISO(TIME_ZONE).hour === SEND_HOUR;
}

export function skyOf(code: number): Sky {
  if (code >= 95) {
    return 'storm';
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return 'snow';
  }
  if (code >= 80 && code <= 82) {
    return 'showers';
  }
  if (code >= 51 && code <= 67) {
    return 'rain';
  }
  if (code === 45 || code === 48) {
    return 'fog';
  }
  if (code === 3) {
    return 'cloudy';
  }
  return code === 2 ? 'partly' : 'clear';
}

function restOfDay(hours: TodayHour[]): TodayHour[] {
  return hours.filter((h) => h.hour >= SEND_HOUR);
}

function inPeriod(hours: TodayHour[], period: Period): TodayHour[] {
  return hours.filter((h) => h.hour >= period.from && h.hour < period.to);
}

function mostSevere(skies: Sky[]): Sky {
  return skies.reduce((a, b) => (SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a));
}

// The sky most hours of a period have; a tie goes to the more severe one.
function dominantSky(hours: TodayHour[]): Sky {
  const counts = new Map<Sky, number>();
  for (const h of hours) {
    const sky = skyOf(h.weatherCode);
    counts.set(sky, (counts.get(sky) ?? 0) + 1);
  }
  const top = Math.max(...counts.values());
  return mostSevere([...counts].filter(([, n]) => n === top).map(([sky]) => sky));
}

function periodSkies(hours: TodayHour[]): { period: Period; sky: Sky }[] {
  return PERIODS
    .map((period) => ({ period, list: inPeriod(hours, period) }))
    .filter(({ list }) => list.length > 0)
    .map(({ period, list }) => ({ period, sky: dominantSky(list) }));
}

function skyWords(sky: Sky, night: boolean): { emoji: string; text: string } {
  return sky === 'clear' && night ? { emoji: '🌙', text: 'despejado' } : { emoji: SKY_EMOJI[sky], text: SKY_TEXT[sky] };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "a", "a y b", "a, b y c".
function joinSpanish(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
}

export function skyLine(hours: TodayHour[]): string {
  const periods = periodSkies(hours);
  if (periods.every((p) => p.sky === periods[0].sky)) {
    const { emoji, text } = skyWords(periods[0].sky, false);
    return `${emoji} ${capitalize(text)} todo el día.`;
  }
  const parts = periods.map(({ period, sky }, i) => {
    const { emoji, text } = skyWords(sky, period === NIGHT);
    return `${emoji} ${i === 0 ? capitalize(text) : text} ${period.label}`;
  });
  return `${joinSpanish(parts)}.`;
}

// A guess from the sea-level pressure from 9 to 23 h, not an official analysis.
export function pressureSituation(hours: TodayHour[]): string | null {
  const rest = restOfDay(hours);
  const first = rest[0];
  const last = rest.at(-1);
  if (!first || !last) {
    return null;
  }
  const mean = rest.reduce((total, h) => total + h.pressureHpa, 0) / rest.length;
  const change = last.pressureHpa - first.pressureHpa;
  if (mean >= 1020 && Math.abs(change) < 3) {
    return 'Anticiclón, tiempo estable.';
  }
  if (change <= -5 || mean <= 1005) {
    return 'Se acerca una borrasca, la presión baja.';
  }
  return null;
}

// Rounded like the temperature line, so a "0 °C" low also warns of frost.
const degrees = (tempC: number) => Math.round(tempC) + 0; // + 0 turns -0 into 0

export function warnings(hours: TodayHour[], range: TodayRange): string[] {
  const list: string[] = [];
  const rest = restOfDay(hours);
  const stormy = PERIODS.filter((period) => inPeriod(rest, period).some((h) => skyOf(h.weatherCode) === 'storm'));
  if (stormy.length === 1) {
    list.push(`⚠️ Ojo: tormentas ${stormy[0].label}.`);
  } else if (stormy.length > 1) {
    list.push('⚠️ Ojo: tormentas a lo largo del día.');
  }
  if (degrees(range.min.tempC) <= 0) {
    list.push('⚠️ Helada al amanecer.');
  }
  if (degrees(range.max.tempC) >= 35) {
    list.push('⚠️ Calor intenso.');
  }
  if (rest.some((h) => (h.hour === 9 || h.hour === 10) && skyOf(h.weatherCode) === 'fog')) {
    list.push('⚠️ Niebla por la mañana.');
  }
  return list;
}

const extreme = ({ tempC, hour }: Extreme) => `${degrees(tempC)} °C (${hour} h)`;

export function temperatureLine(range: TodayRange): string {
  return `🌡️ Entre ${extreme(range.min)} y ${extreme(range.max)}.`;
}

export function rainLine(hours: TodayHour[]): string {
  const rest = restOfDay(hours);
  const chance = (h: TodayHour) => h.precipProbabilityPct ?? 0;
  const top = Math.max(0, ...rest.map(chance));
  if (top < 20) {
    return `☂️ Sin lluvia (${top} %).`;
  }
  const likely = rest.filter((h) => chance(h) >= 30);
  const when = likely.length > 0 ? ` de ${likely[0].hour} a ${likely.at(-1)!.hour + 1} h` : '';
  const mm = rest.reduce((total, h) => total + (h.precipMm ?? 0), 0);
  const amount = mm < 1 ? 'menos de 1 mm' : `unos ${Math.round(mm)} mm`;
  return `💧 ${top >= 50 ? 'Lluvia' : 'Posible lluvia'} (${top} %)${when}, ${amount}.`;
}

// AEMET terms by the top mean speed.
function windTerm(kmh: number): string {
  return kmh <= 20 ? 'flojo' : kmh <= 40 ? 'moderado' : kmh <= 70 ? 'fuerte' : 'muy fuerte';
}

export function windLine(hours: TodayHour[]): string {
  const rest = restOfDay(hours);
  const strongest = rest.reduce((a, b) => (b.windKmh > a.windKmh ? b : a));
  const speed = Math.round(strongest.windKmh);
  const from = DIRECTIONS[Math.round(strongest.windDirDeg / 45) % 8];
  const gusty = rest.filter((h): h is TodayHour & { gustKmh: number } => h.gustKmh !== null);
  const gust = gusty.length > 0 ? gusty.reduce((a, b) => (b.gustKmh > a.gustKmh ? b : a)) : null;
  const term = windTerm(speed);
  if (!gust || Math.round(gust.gustKmh) < 20) {
    return `💨 Viento ${term}, hasta ${speed} km/h del ${from}.`;
  }
  return `💨 Viento ${term}, ${speed} km/h del ${from}, con rachas de ${Math.round(gust.gustKmh)} km/h hacia las ${gust.hour} h.`;
}

// The emoji of the most severe period sky, the station and the day: "🌦️ Madrid, Las Rozas · jueves 22".
export function title(stationName: string, today: Temporal.PlainDate, hours: TodayHour[]): string {
  const sky = mostSevere(periodSkies(hours).map((p) => p.sky));
  return `${SKY_EMOJI[sky]} ${stationName} · ${WEEKDAYS[today.dayOfWeek - 1]} ${today.day}`;
}

export function buildDailyMessage({ stationName, today, hours, range }: DailyInput): DailyMessage {
  const first = [skyLine(hours), pressureSituation(hours), ...warnings(hours, range)].filter((part) => part !== null).join(' ');
  return {
    title: title(stationName, today, hours),
    body: [first, temperatureLine(range), rainLine(hours), windLine(hours)].join('\n'),
  };
}
```

- [ ] **Paso 4: comprobar que pasan**

Ejecutar `pnpm vitest run server/daily-message.test.ts && pnpm typecheck`. Resultado esperado: PASS. Si falla un texto, se corrige el código, no el test: los tests copian la spec.

- [ ] **Paso 5: commit** (preguntar antes al usuario)

```bash
git add frontend/server/daily-message.ts frontend/server/daily-message.test.ts
git commit -m "feat(api): text of the daily forecast notification"
```

---

### Tarea 5: Validación, IP y autorización

**Ficheros:**
- Crear: `frontend/server/push-validation.ts`
- Test: `frontend/server/push-validation.test.ts`

**Interfaces:**
- Consume: `Parsed<T>`, de `server/params.ts`.
- Produce:
  - `interface PushSubscriptionInput { endpoint: string; p256dh: string; auth: string }`
  - `parseEndpoint(value: unknown): Parsed<string>`
  - `parseSubscription(body: unknown): Parsed<PushSubscriptionInput>`
  - `parseUnsubscribe(body: unknown): Parsed<string>`
  - `clientIp(headers: Headers): string`
  - `hashIp(ip: string, secret: string): string`
  - `bearerMatches(header: string | null, secret: string): boolean`

- [ ] **Paso 1: tests que fallan**

```ts
import { describe, expect, it } from 'vitest';
import { bearerMatches, clientIp, hashIp, parseEndpoint, parseSubscription, parseUnsubscribe } from './push-validation';

const key = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64url');
const APPLE = 'https://web.push.apple.com/QGuQyavXutnMH2ApsRnQ';
const valid = { endpoint: APPLE, expirationTime: null, keys: { p256dh: key(65), auth: key(16) } };

describe('parseEndpoint', () => {
  it('accepts the known push services over HTTPS', () => {
    for (const endpoint of [APPLE, 'https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://db5p.notify.windows.com/w/?token=abc']) {
      expect(parseEndpoint(endpoint)).toEqual({ ok: true, value: endpoint });
    }
  });
  it('rejects anything else', () => {
    for (const endpoint of ['http://fcm.googleapis.com/fcm/send/abc', 'https://evil.example/fcm', 'https://fcm.googleapis.com.evil.example/x', 'not a url', 42, null, `${APPLE}/${'a'.repeat(1000)}`]) {
      expect(parseEndpoint(endpoint).ok).toBe(false);
    }
  });
});

describe('parseSubscription', () => {
  it('takes what PushSubscription.toJSON gives', () => {
    expect(parseSubscription(valid)).toEqual({ ok: true, value: { endpoint: APPLE, p256dh: key(65), auth: key(16) } });
  });
  it('accepts base64url keys with padding', () => {
    expect(parseSubscription({ ...valid, keys: { p256dh: `${key(65)}=`, auth: `${key(16)}==` } }).ok).toBe(true);
  });
  it('rejects keys of the wrong size or alphabet', () => {
    expect(parseSubscription({ ...valid, keys: { p256dh: key(64), auth: key(16) } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: key(65), auth: key(17) } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: `${key(65)}+/`, auth: key(16) } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: null }).ok).toBe(false);
    expect(parseSubscription('nope').ok).toBe(false);
  });
});

describe('parseUnsubscribe', () => {
  it('needs a valid endpoint', () => {
    expect(parseUnsubscribe({ endpoint: APPLE })).toEqual({ ok: true, value: APPLE });
    expect(parseUnsubscribe({}).ok).toBe(false);
    expect(parseUnsubscribe(null).ok).toBe(false);
  });
});

describe('clientIp and hashIp', () => {
  it('takes the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers())).toBe('unknown');
  });
  it('hashes with the secret, never keeping the IP', () => {
    const hash = hashIp('203.0.113.7', 'secret-a');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashIp('203.0.113.7', 'secret-a'));
    expect(hash).not.toBe(hashIp('203.0.113.7', 'secret-b'));
  });
});

describe('bearerMatches', () => {
  it('accepts only the exact secret', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true);
    expect(bearerMatches('Bearer s3creT', 's3cret')).toBe(false);
  });
  it('is false, never throwing, for other lengths, no header or no secret', () => {
    expect(bearerMatches('Bearer s3cret-longer', 's3cret')).toBe(false);
    expect(bearerMatches(null, 's3cret')).toBe(false);
    expect(bearerMatches('Bearer ', '')).toBe(false);
  });
});
```

- [ ] **Paso 2: comprobar que fallan**

Ejecutar `pnpm vitest run server/push-validation.test.ts`. Resultado esperado: FAIL, porque el módulo no existe.

- [ ] **Paso 3: implementar**

```ts
// Checks for the push endpoints and the cron: what a browser may send, and who may call.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Parsed } from './params.js';

// Apple (iPhone), Google (Chrome, Android), Mozilla (Firefox) and Microsoft (Edge on Windows).
const PUSH_HOSTS = new Set(['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com']);
const WINDOWS_PUSH_SUFFIX = '.notify.windows.com';
const MAX_ENDPOINT_LENGTH = 1000;
// An uncompressed P-256 public key, and the auth secret.
const P256DH_BYTES = 65;
const AUTH_BYTES = 16;

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function parseEndpoint(value: unknown): Parsed<string> {
  if (typeof value !== 'string' || value.length > MAX_ENDPOINT_LENGTH) {
    return { ok: false, error: 'invalid endpoint' };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: 'invalid endpoint' };
  }
  const known = PUSH_HOSTS.has(url.hostname) || url.hostname.endsWith(WINDOWS_PUSH_SUFFIX);
  if (url.protocol !== 'https:' || !known) {
    return { ok: false, error: 'unknown push service' };
  }
  return { ok: true, value };
}

// Bytes in a base64url string (with or without padding), or null when it is not one.
function base64UrlBytes(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    return null;
  }
  return Buffer.from(value, 'base64url').length;
}

// The body PushSubscription.toJSON() gives: { endpoint, expirationTime, keys: { p256dh, auth } }.
export function parseSubscription(body: unknown): Parsed<PushSubscriptionInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'invalid body' };
  }
  const { endpoint, keys } = body as { endpoint?: unknown; keys?: unknown };
  const parsed = parseEndpoint(endpoint);
  if (!parsed.ok) {
    return parsed;
  }
  if (typeof keys !== 'object' || keys === null) {
    return { ok: false, error: 'invalid keys' };
  }
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (base64UrlBytes(p256dh) !== P256DH_BYTES || base64UrlBytes(auth) !== AUTH_BYTES) {
    return { ok: false, error: 'invalid keys' };
  }
  return { ok: true, value: { endpoint: parsed.value, p256dh: p256dh as string, auth: auth as string } };
}

export function parseUnsubscribe(body: unknown): Parsed<string> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'invalid body' };
  }
  return parseEndpoint((body as { endpoint?: unknown }).endpoint);
}

// On Vercel the platform sets x-forwarded-for; its first address is the client's.
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

// The rate limit stores only this keyed hash: without the secret it cannot be traced back.
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex');
}

// "Authorization: Bearer <secret>", compared in constant time. timingSafeEqual throws on
// different lengths, so those are rejected first.
export function bearerMatches(header: string | null, secret: string): boolean {
  if (!secret || header === null) {
    return false;
  }
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

- [ ] **Paso 4: comprobar que pasan**

Ejecutar `pnpm vitest run server/push-validation.test.ts && pnpm typecheck`. Resultado esperado: PASS.

- [ ] **Paso 5: commit** (preguntar antes al usuario)

```bash
git add frontend/server/push-validation.ts frontend/server/push-validation.test.ts
git commit -m "feat(api): validate push subscriptions, hash IPs, check the cron secret"
```

---

### Tarea 6: Envío diario (datos, almacén, `web-push` y endpoint del cron)

**Ficheros:**
- Modificar: `frontend/package.json` y `frontend/pnpm-lock.yaml` (con `pnpm add` desde `frontend/`)
- Modificar: `frontend/server/http.ts` (se añade `noStore`)
- Crear: `frontend/server/push-store.ts`, `frontend/server/push-sender.ts`, `frontend/server/daily-data.ts` y `frontend/api/cron/daily-forecast.ts`

**Interfaces:**
- Consume:
  - las tablas de la tarea 1;
  - `fetchToday` y `fetchYesterdayForecastMax` (tarea 2);
  - `temperatureCorrection`, `todayRange`, `nightMinimum`, `measuredYesterdayMax` y `StationDay` (tarea 3);
  - `buildDailyMessage`, `isSendHour` y `DailyMessage` (tarea 4);
  - `bearerMatches` y `PushSubscriptionInput` (tarea 5);
  - `db`, `fetchAll`, `listedStations` y `defaultStation` (`server/supabase.ts`);
  - `stationCoordinates` (`server/station-choice.ts`);
  - `localToday` y `localMidnight` (`server/params.ts`);
  - `requireEnv` (`server/env.ts`).
- Produce:
  - `noStore(body: unknown, status?: number): Response`
  - `push-store.ts`: `MAX_REQUESTS_PER_HOUR`, `MAX_SUBSCRIPTIONS`, `allowRequest(ipHash: string, now: Temporal.Instant): Promise<boolean>`, `saveSubscription(sub: PushSubscriptionInput): Promise<'saved' | 'full'>`, `deleteSubscription(endpoint: string): Promise<void>`, `interface StoredSubscription { id: number; endpoint: string; p256dh: string; auth: string }`, `allSubscriptions(): Promise<StoredSubscription[]>`, `deleteSubscriptions(ids: number[]): Promise<void>`, `markSent(ids: number[], at: Temporal.Instant): Promise<void>`, `claimDay(day: Temporal.PlainDate): Promise<boolean>` y `recordRun(day: Temporal.PlainDate, message: DailyMessage, counts: RunCounts): Promise<void>`
  - `push-sender.ts`: `interface SendResult { sent: number[]; gone: number[]; failed: number }` y `sendToAll(subscriptions: StoredSubscription[], payload: string): Promise<SendResult>`
  - `daily-data.ts`: `interface DailyResult { message: DailyMessage; details: { station: StationDay; yesterdayForecastMax: number | null; correction: number } }` y `dailyMessage(now: Temporal.Instant): Promise<DailyResult>`
  - `POST /api/cron/daily-forecast`

- [ ] **Paso 1: añadir la dependencia**

Desde `frontend/`:

```bash
pnpm add web-push && pnpm add -D @types/web-push
```

Resultado esperado: `web-push` 3.6.x en `dependencies` y `@types/web-push` en `devDependencies`.

- [ ] **Paso 2: añadir `noStore` a `server/http.ts`**

Añadir al final:

```ts
// Push subscriptions and the cron: answers that must never be cached.
export function noStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
```

- [ ] **Paso 3: crear `server/push-store.ts`**

```ts
// Supabase access for push: subscriptions, the limit per IP and the once-a-day claim. Server
// only (secret key); never import it from src/.
import { Temporal } from 'temporal-polyfill';
import type { DailyMessage } from './daily-message.js';
import type { PushSubscriptionInput } from './push-validation.js';
import { db, fetchAll } from './supabase.js';

export const MAX_REQUESTS_PER_HOUR = 10;
export const MAX_SUBSCRIPTIONS = 1000;

export interface StoredSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface RunCounts {
  sent: number;
  failed: number;
  removed: number;
}

function check(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

// Counts this request against the IP's hour; false when it is over the limit.
export async function allowRequest(ipHash: string, now: Temporal.Instant): Promise<boolean> {
  const since = now.subtract({ hours: 1 }).toString();
  const { count, error } = await db()
    .from('push_requests').select('ip_hash', { count: 'exact', head: true })
    .eq('ip_hash', ipHash).gte('at', since);
  check(error);
  if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return false;
  }
  check((await db().from('push_requests').insert({ ip_hash: ipHash })).error);
  return true;
}

// Saves or refreshes a subscription. A new one is refused once there are MAX_SUBSCRIPTIONS.
export async function saveSubscription(sub: PushSubscriptionInput): Promise<'saved' | 'full'> {
  const existing = await db().from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
  check(existing.error);
  if (!existing.data) {
    const { count, error } = await db().from('push_subscriptions').select('id', { count: 'exact', head: true });
    check(error);
    if ((count ?? 0) >= MAX_SUBSCRIPTIONS) {
      return 'full';
    }
  }
  check((await db().from('push_subscriptions').upsert(sub, { onConflict: 'endpoint' })).error);
  return 'saved';
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  check((await db().from('push_subscriptions').delete().eq('endpoint', endpoint)).error);
}

export async function allSubscriptions(): Promise<StoredSubscription[]> {
  return fetchAll((from, to) => db().from('push_subscriptions').select('id, endpoint, p256dh, auth').order('id').range(from, to));
}

export async function deleteSubscriptions(ids: number[]): Promise<void> {
  if (ids.length > 0) {
    check((await db().from('push_subscriptions').delete().in('id', ids)).error);
  }
}

export async function markSent(ids: number[], at: Temporal.Instant): Promise<void> {
  if (ids.length > 0) {
    check((await db().from('push_subscriptions').update({ last_sent_at: at.toString() }).in('id', ids)).error);
  }
}

// Inserts today's row; false when it was already there (sent, or being sent, by another run).
export async function claimDay(day: Temporal.PlainDate): Promise<boolean> {
  const { data, error } = await db()
    .from('push_daily_runs').upsert({ day: day.toString() }, { onConflict: 'day', ignoreDuplicates: true })
    .select('day');
  check(error);
  return (data ?? []).length > 0;
}

export async function recordRun(day: Temporal.PlainDate, message: DailyMessage, counts: RunCounts): Promise<void> {
  check((await db().from('push_daily_runs').update({ ...message, ...counts }).eq('day', day.toString())).error);
}
```

- [ ] **Paso 4: crear `server/push-sender.ts`**

```ts
// Sends one payload to every subscription with web-push (VAPID), 10 at a time.
import webpush from 'web-push';
import { requireEnv } from './env.js';
import type { StoredSubscription } from './push-store.js';

const BATCH_SIZE = 10;
// A phone offline for a while still gets the morning's forecast, up to 15:00.
const TTL_SECONDS = 6 * 60 * 60;
// A newer message with the same topic replaces an undelivered one.
const TOPIC = 'daily-forecast';

export interface SendResult {
  sent: number[]; // subscription ids
  gone: number[]; // the push service answered 404 or 410: delete them
  failed: number;
}

function statusOf(error: unknown): number | null {
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : null;
}

export async function sendToAll(subscriptions: StoredSubscription[], payload: string): Promise<SendResult> {
  const vapidDetails = {
    subject: requireEnv('VAPID_SUBJECT'),
    // Public by design: the browser needs it to subscribe, the server to sign.
    publicKey: requireEnv('VITE_VAPID_PUBLIC_KEY'),
    privateKey: requireEnv('VAPID_PRIVATE_KEY'),
  };
  const result: SendResult = { sent: [], gone: [], failed: 0 };
  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    await Promise.all(subscriptions.slice(i, i + BATCH_SIZE).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: TTL_SECONDS, urgency: 'normal', topic: TOPIC, vapidDetails },
        );
        result.sent.push(s.id);
      } catch (error) {
        const status = statusOf(error);
        if (status === 404 || status === 410) {
          result.gone.push(s.id);
        } else {
          result.failed += 1;
          console.error(`push to subscription ${s.id} failed`, status ?? error);
        }
      }
    }));
  }
  return result;
}
```

- [ ] **Paso 5: crear `server/daily-data.ts`**

```ts
// Everything the 9:00 message needs, read from Supabase and Open-Meteo, for the default station.
import { Temporal } from 'temporal-polyfill';
import { buildDailyMessage, type DailyMessage } from './daily-message.js';
import {
  measuredYesterdayMax, nightMinimum, temperatureCorrection, todayRange, type StationDay,
} from './daily-temperature.js';
import { fetchToday, fetchYesterdayForecastMax } from './open-meteo.js';
import { TIME_ZONE, localMidnight, localToday } from './params.js';
import { stationCoordinates } from './station-choice.js';
import { db, defaultStation, listedStations } from './supabase.js';

export interface DailyResult {
  message: DailyMessage;
  // For ?mode=preview: what the correction was built from. Never the coordinates.
  details: { station: StationDay; yesterdayForecastMax: number | null; correction: number };
}

function check(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

// Station readings for today and yesterday. Missing data gives nulls: the message then uses
// Open-Meteo alone.
async function readStationDay(deviceId: string, today: Temporal.PlainDate): Promise<StationDay> {
  const midnight = localMidnight(today);
  const nine = today.toZonedDateTime({ timeZone: TIME_ZONE, plainTime: Temporal.PlainTime.from('09:00') }).toInstant();
  const [night, at9, yesterday] = await Promise.all([
    // At most 540 rows: one page.
    db().from('readings').select('ts, temp_c').eq('device_id', deviceId)
      .gte('ts', midnight.toString()).lt('ts', nine.toString()).order('ts'),
    db().from('readings').select('temp_c').eq('device_id', deviceId)
      .gte('ts', nine.toString()).lt('ts', nine.add({ minutes: 5 }).toString())
      .not('temp_c', 'is', null).order('ts').limit(1),
    db().from('readings_daily').select('temp_max, samples').eq('device_id', deviceId)
      .eq('day', today.subtract({ days: 1 }).toString()).maybeSingle(),
  ]);
  check(night.error);
  check(at9.error);
  check(yesterday.error);
  return {
    temp9: at9.data?.[0]?.temp_c ?? null,
    nightMin: nightMinimum(night.data ?? []),
    yesterdayMax: measuredYesterdayMax(yesterday.data),
  };
}

export async function dailyMessage(now: Temporal.Instant): Promise<DailyResult> {
  const stations = await listedStations();
  const deviceId = defaultStation(stations);
  const station = stations.find((s) => s.id === deviceId);
  if (!deviceId || !station) {
    throw new Error('no listed station');
  }
  const coordinates = stationCoordinates(process.env.STATION_COORDINATES, deviceId);
  if (!coordinates) {
    throw new Error('no coordinates for the default station');
  }
  const today = localToday(now);
  const [hours, yesterdayForecastMax, stationDay] = await Promise.all([
    fetchToday(coordinates, today),
    fetchYesterdayForecastMax(coordinates, today.subtract({ days: 1 })),
    readStationDay(deviceId, today),
  ]);
  const correction = temperatureCorrection(stationDay, hours, yesterdayForecastMax);
  const range = todayRange(hours, stationDay, correction);
  return {
    message: buildDailyMessage({ stationName: station.name, today, hours, range }),
    details: { station: stationDay, yesterdayForecastMax, correction },
  };
}
```

- [ ] **Paso 6: crear `api/cron/daily-forecast.ts`**

```ts
// POST /api/cron/daily-forecast: the 9:00 notification. pg_cron in Supabase calls it at 07:05
// and 08:05 UTC (one of them is 9:05 in Madrid) with Authorization: Bearer CRON_SECRET.
// ?mode=preview returns the message without sending. ?mode=send-now sends at once, without the
// 9:00 check or the once-a-day claim: for testing while the owner is the only subscriber.
import { Temporal } from 'temporal-polyfill';
import { dailyMessage, type DailyResult } from '../../server/daily-data.js';
import { isSendHour } from '../../server/daily-message.js';
import { noStore, serverError } from '../../server/http.js';
import { localToday } from '../../server/params.js';
import { sendToAll } from '../../server/push-sender.js';
import { allSubscriptions, claimDay, deleteSubscriptions, markSent, recordRun } from '../../server/push-store.js';
import { bearerMatches } from '../../server/push-validation.js';

// Tapping the notification opens the forecast tab.
const OPEN_URL = '/?view=forecast';

export async function POST(request: Request): Promise<Response> {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
    return noStore({ error: 'unauthorized' }, 401);
  }
  const mode = new URL(request.url).searchParams.get('mode');
  if (mode !== null && mode !== 'preview' && mode !== 'send-now') {
    return noStore({ error: 'unknown mode' }, 400);
  }
  const now = Temporal.Now.instant();
  if (mode === null && !isSendHour(now)) {
    return noStore({ status: 'not 9:00 in Madrid' });
  }

  // The data comes before the claim: if Open-Meteo is down nothing is claimed or sent.
  let daily: DailyResult;
  try {
    daily = await dailyMessage(now);
  } catch (error) {
    console.error(error);
    return noStore({ error: 'forecast unavailable' }, 502);
  }
  if (mode === 'preview') {
    return noStore(daily);
  }

  try {
    const today = localToday(now);
    if (mode === null && !(await claimDay(today))) {
      return noStore({ status: 'already sent today' });
    }
    const result = await sendToAll(await allSubscriptions(), JSON.stringify({ ...daily.message, url: OPEN_URL }));
    await deleteSubscriptions(result.gone);
    await markSent(result.sent, now);
    const counts = { sent: result.sent.length, failed: result.failed, removed: result.gone.length };
    if (mode === null) {
      await recordRun(today, daily.message, counts);
    }
    return noStore(counts);
  } catch (error) {
    return serverError(error);
  }
}
```

- [ ] **Paso 7: comprobar**

Ejecutar `pnpm typecheck && pnpm test`. Resultado esperado: PASS.
- Si `import webpush from 'web-push'` da error de tipos, comprobar que `@types/web-push` está instalado. No cambiar `tsconfig`.
- Si `upsert` o `update` dan error de tipos, regenerar los tipos (tarea 1, paso 3).

- [ ] **Paso 8: commit** (preguntar antes al usuario)

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/server/http.ts frontend/server/push-store.ts frontend/server/push-sender.ts frontend/server/daily-data.ts frontend/api/cron/daily-forecast.ts
git commit -m "feat(api): daily forecast cron endpoint that sends the push notification"
```

Si `git status` muestra también cambiado el `pnpm-lock.yaml` de la raíz, añadirlo al mismo commit.

---

### Tarea 7: Endpoints para apuntarse y darse de baja

**Ficheros:**
- Crear: `frontend/api/push/subscribe.ts` y `frontend/api/push/unsubscribe.ts`

**Interfaces:**
- Consume:
  - `parseSubscription`, `parseUnsubscribe`, `clientIp` y `hashIp` (tarea 5);
  - `allowRequest`, `saveSubscription` y `deleteSubscription` (tarea 6);
  - `noStore` y `serverError` (`server/http.ts`);
  - `requireEnv` (`server/env.ts`).
- Produce:
  - `POST /api/push/subscribe`: cuerpo `PushSubscription.toJSON()`; responde 204, 400, 429, 503 o 500.
  - `POST /api/push/unsubscribe`: cuerpo `{ endpoint }`; responde 204, 400, 429 o 500.

- [ ] **Paso 1: crear `api/push/subscribe.ts`**

```ts
// POST /api/push/subscribe: saves a browser's push subscription (PushSubscription.toJSON()).
// Repeating it is harmless (upsert by endpoint): the app sends it again on every open.
import { Temporal } from 'temporal-polyfill';
import { requireEnv } from '../../server/env.js';
import { noStore, serverError } from '../../server/http.js';
import { allowRequest, saveSubscription } from '../../server/push-store.js';
import { clientIp, hashIp, parseSubscription } from '../../server/push-validation.js';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: 'invalid JSON' }, 400);
  }
  const subscription = parseSubscription(body);
  if (!subscription.ok) {
    return noStore({ error: subscription.error }, 400);
  }
  try {
    const ipHash = hashIp(clientIp(request.headers), requireEnv('CRON_SECRET'));
    if (!(await allowRequest(ipHash, Temporal.Now.instant()))) {
      return noStore({ error: 'too many requests' }, 429);
    }
    if ((await saveSubscription(subscription.value)) === 'full') {
      return noStore({ error: 'no more subscriptions accepted' }, 503);
    }
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return serverError(error);
  }
}
```

- [ ] **Paso 2: crear `api/push/unsubscribe.ts`**

```ts
// POST /api/push/unsubscribe: { endpoint }. Deletes that subscription. Only the phone knows its
// endpoint, so nobody can unsubscribe someone else. 204 even when it did not exist.
import { Temporal } from 'temporal-polyfill';
import { requireEnv } from '../../server/env.js';
import { noStore, serverError } from '../../server/http.js';
import { allowRequest, deleteSubscription } from '../../server/push-store.js';
import { clientIp, hashIp, parseUnsubscribe } from '../../server/push-validation.js';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: 'invalid JSON' }, 400);
  }
  const endpoint = parseUnsubscribe(body);
  if (!endpoint.ok) {
    return noStore({ error: endpoint.error }, 400);
  }
  try {
    const ipHash = hashIp(clientIp(request.headers), requireEnv('CRON_SECRET'));
    if (!(await allowRequest(ipHash, Temporal.Now.instant()))) {
      return noStore({ error: 'too many requests' }, 429);
    }
    await deleteSubscription(endpoint.value);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return serverError(error);
  }
}
```

- [ ] **Paso 3: comprobar**

Ejecutar `pnpm typecheck && pnpm test`. Resultado esperado: PASS.

- [ ] **Paso 4: commit** (preguntar antes al usuario)

```bash
git add frontend/api/push/subscribe.ts frontend/api/push/unsubscribe.ts
git commit -m "feat(api): subscribe and unsubscribe endpoints with a limit per IP"
```

---

### Tarea 8: PWA (iconos, manifest y service worker)

**Ficheros:**
- Crear: `frontend/design/app-icon.svg`, `frontend/public/manifest.webmanifest` y `frontend/public/sw.js`
- Crear (generados): `frontend/public/icon-192.png`, `frontend/public/icon-512.png` y `frontend/public/apple-touch-icon.png`
- Modificar: `frontend/index.html` y `frontend/design/README.md`
- Test: `frontend/src/lib/pwa-assets.test.ts`

**Interfaces:**
- Produce:
  - `/manifest.webmanifest`, `/sw.js` (registrado por la tarea 9) y los iconos;
  - el payload que espera `sw.js`: `{ title: string; body: string; url: string }`, que es lo que envía la tarea 6.

- [ ] **Paso 1: test que falla**

```ts
// The files that make the dashboard installable (PWA): the manifest, its icons and the links.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface ManifestIcon {
  src: string;
  sizes: string;
  purpose?: string;
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as { icons: ManifestIcon[] };

describe('web app manifest', () => {
  it('opens standalone at the root', () => {
    expect(manifest).toMatchObject({ name: 'Gorraplanistas', start_url: '/', display: 'standalone', lang: 'es' });
  });
  it('points at icons that exist, one of them maskable', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(`public${icon.src}`)).toBe(true);
    }
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });
  it('is linked from index.html, with the iPhone icon and the service worker in public/', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(existsSync('public/apple-touch-icon.png')).toBe(true);
    expect(existsSync('public/sw.js')).toBe(true);
  });
});
```

Ejecutar `pnpm vitest run src/lib/pwa-assets.test.ts`. Resultado esperado: FAIL, porque no existe `manifest.webmanifest`.

- [ ] **Paso 2: crear `design/app-icon.svg`**

Es el logo de `public/favicon.svg` sobre fondo opaco (iPhone pinta de negro lo transparente), al 72 % y centrado. Así sobra margen para el recorte de Android (zona segura del 80 %).

```svg
<!-- App icon (PWA, iPhone home screen): the cap logo of public/favicon.svg on an opaque
     background, scaled to 72 % and centered so Android's maskable crop keeps it whole.
     Rendered to public/icon-192.png, icon-512.png and apple-touch-icon.png; see README.md. -->
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 120 120">
  <rect width="120" height="120" fill="#f5f7fb"/>
  <g transform="translate(16.8 16.8) scale(0.72)">
    <g transform="translate(-4 6)">
      <circle cx="84" cy="28" r="21" fill="#f8c74a"/>
      <path d="M44 76 C62 78 86 72 99 56 C114 66 122 76 119 84 C110 94 84 97 64 92 C54 89 47 85 44 76 Z" fill="#3f5fd8"/>
      <path d="M17 70 C10 44 32 20 58 20 C84 20 103 38 101 62 C90 75 70 81 52 80 C36 79 24 76 17 70 Z" fill="#5578f5"/>
      <path d="M58 20 C50 34 46 56 47 80" fill="none" stroke="#4767e6" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M58 20 C74 30 86 46 90 71" fill="none" stroke="#4767e6" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="58" cy="20" r="4.5" fill="#3f5fd8"/>
      <g fill="#ffffff">
        <circle cx="62" cy="55" r="5.5"/>
        <circle cx="69" cy="50" r="7.5"/>
        <circle cx="76" cy="55" r="5.5"/>
        <rect x="56.5" y="55" width="25" height="6.5" rx="3.2"/>
      </g>
      <path d="M48 82 C66 86 88 80 102 66" fill="none" stroke="#3352c4" stroke-width="3" stroke-linecap="round"/>
    </g>
  </g>
</svg>
```

- [ ] **Paso 3: generar los PNG**

Desde `frontend/`:

```bash
deno run -A --no-lock --node-modules-dir=none design/render.ts design/app-icon.svg public/icon-512.png 512
deno run -A --no-lock --node-modules-dir=none design/render.ts design/app-icon.svg public/icon-192.png 192
deno run -A --no-lock --node-modules-dir=none design/render.ts design/app-icon.svg public/apple-touch-icon.png 180
```

Resultado esperado: tres PNG. Abrir `public/icon-512.png` con Read para verlo. Si se crea `deno.lock`, borrarlo.

- [ ] **Paso 4: crear `public/manifest.webmanifest`**

```json
{
  "name": "Gorraplanistas",
  "short_name": "Gorraplanistas",
  "description": "El tiempo en Las Rozas, medido por una estación casera.",
  "lang": "es",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f5f7fb",
  "theme_color": "#f5f7fb",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Paso 5: crear `public/sw.js`**

```js
// Service worker for the daily forecast notification: it shows the push and opens the dashboard
// when it is tapped. No fetch handler and no cache: the page always loads from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Payload from api/cron/daily-forecast: { title, body, url }.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Gorraplanistas', {
      body: data.body || '',
      icon: '/icon-192.png',
      tag: 'daily-forecast',
      data: { url: data.url || '/' },
    }),
  );
});

// Focus an open dashboard window, or open one at the notification's URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
```

- [ ] **Paso 6: enlazar desde `index.html`**

Debajo de `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />` añadir:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-title" content="Gorraplanistas" />
```

- [ ] **Paso 7: actualizar `design/README.md`**

Añadir una sección con los tres comandos del paso 3, bajo el título "App icons (PWA)". Explicar que salen de `app-icon.svg`, y que si cambia el logo hay que copiar el dibujo en los dos SVG.

- [ ] **Paso 8: comprobar que pasa**

Ejecutar `pnpm vitest run src/lib/pwa-assets.test.ts && pnpm typecheck`. Resultado esperado: PASS.

- [ ] **Paso 9: commit** (preguntar antes al usuario)

```bash
git add frontend/design/app-icon.svg frontend/design/README.md frontend/public/manifest.webmanifest frontend/public/sw.js frontend/public/icon-192.png frontend/public/icon-512.png frontend/public/apple-touch-icon.png frontend/index.html frontend/src/lib/pwa-assets.test.ts
git commit -m "feat(pwa): installable app with manifest, icons and a push service worker"
```

---

### Tarea 9: Cliente (suscripción y bloque "Aviso diario")

**Ficheros:**
- Crear: `frontend/src/lib/push.ts` y `frontend/src/components/DailyAlert.tsx`
- Test: `frontend/src/lib/push.test.ts`
- Modificar: `frontend/src/main.tsx`, `frontend/src/App.tsx` (pestaña de previsión) y `frontend/src/index.css`

**Interfaces:**
- Consume: `/sw.js` (tarea 8), `POST /api/push/subscribe` y `POST /api/push/unsubscribe` (tarea 7).
- Produce:
  - `type AlertState = 'not-installed' | 'unsupported' | 'blocked' | 'off' | 'on'`
  - `isInstalled(): boolean`, `isPushSupported(): boolean`, `alertState(): Promise<AlertState>`, `registerServiceWorker(): Promise<ServiceWorkerRegistration>`, `subscribe(): Promise<AlertState>`, `unsubscribe(): Promise<AlertState>`, `syncSubscription(): Promise<void>` y `base64UrlToBytes(value: string): Uint8Array<ArrayBuffer>`
  - el componente `DailyAlert`.

- [ ] **Paso 1: tests que fallan**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alertState, base64UrlToBytes, subscribe, unsubscribe } from './push';

interface Browser {
  standalone?: boolean; // display-mode: standalone (Android, desktop)
  iosStandalone?: boolean; // navigator.standalone (iPhone home screen)
  push?: boolean;
  permission?: NotificationPermission;
  subscription?: unknown;
}

function stubBrowser({ standalone = true, iosStandalone = false, push = true, permission = 'default', subscription = null }: Browser) {
  const pushManager = { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn() };
  const registration = { pushManager };
  const win: Record<string, unknown> = { matchMedia: () => ({ matches: standalone }) };
  if (push) {
    win.PushManager = class {};
    win.Notification = class {};
  }
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', {
    standalone: iosStandalone,
    ...(push ? { serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) } } : {}),
  });
  vi.stubGlobal('Notification', { permission, requestPermission: vi.fn(async () => 'granted') });
  return { pushManager };
}

function fakeSubscription() {
  return {
    endpoint: 'https://web.push.apple.com/abc',
    toJSON: () => ({ endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'x', auth: 'y' } }),
    unsubscribe: vi.fn(async () => true),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('alertState', () => {
  it('asks to install the app first', async () => {
    stubBrowser({ standalone: false });
    expect(await alertState()).toBe('not-installed');
  });
  it('counts an iPhone home screen app as installed', async () => {
    stubBrowser({ standalone: false, iosStandalone: true });
    expect(await alertState()).toBe('off');
  });
  it('knows when push is missing or blocked', async () => {
    stubBrowser({ push: false });
    expect(await alertState()).toBe('unsupported');
    stubBrowser({ permission: 'denied' });
    expect(await alertState()).toBe('blocked');
  });
  it('is on when the browser has a subscription', async () => {
    stubBrowser({ subscription: fakeSubscription() });
    expect(await alertState()).toBe('on');
  });
});

describe('subscribe', () => {
  it('sends the subscription to the server', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID');
    const { pushManager } = stubBrowser({});
    pushManager.subscribe.mockResolvedValue(fakeSubscription());
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await subscribe()).toBe('on');
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({ method: 'POST' }));
  });
  it('undoes the browser subscription when the server refuses it', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID');
    const { pushManager } = stubBrowser({});
    const subscription = fakeSubscription();
    pushManager.subscribe.mockResolvedValue(subscription);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })));
    await expect(subscribe()).rejects.toThrow('429');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});

describe('unsubscribe', () => {
  it('tells the server first, then drops the browser subscription', async () => {
    const subscription = fakeSubscription();
    stubBrowser({ subscription });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await unsubscribe()).toBe('off');
    expect(fetchMock).toHaveBeenCalledWith('/api/push/unsubscribe', expect.objectContaining({ method: 'POST' }));
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});

describe('base64UrlToBytes', () => {
  it('decodes base64url without padding', () => {
    expect([...base64UrlToBytes('AQID')]).toEqual([1, 2, 3]);
    expect([...base64UrlToBytes('-_8')]).toEqual([251, 255]);
  });
});
```

Ejecutar `pnpm vitest run src/lib/push.test.ts`. Resultado esperado: FAIL, porque el módulo no existe.

- [ ] **Paso 2: crear `src/lib/push.ts`**

```ts
// The daily forecast notification on this device. The subscription lives in the browser:
// pushManager.getSubscription() says whether this phone is subscribed, and the server keeps a
// copy to send to. Push only works with the dashboard installed as an app (required on iPhone,
// and the same flow everywhere).
export type AlertState = 'not-installed' | 'unsupported' | 'blocked' | 'off' | 'on';

export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js');
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function alertState(): Promise<AlertState> {
  if (!isInstalled()) {
    return 'not-installed';
  }
  if (!isPushSupported()) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') {
    return 'blocked';
  }
  return (await currentSubscription()) ? 'on' : 'off';
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function postJson(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
}

// Must run straight from a tap: iPhone only asks for permission inside a user gesture.
export async function subscribe(): Promise<AlertState> {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!key) {
    throw new Error('VITE_VAPID_PUBLIC_KEY is not set');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return permission === 'denied' ? 'blocked' : 'off';
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
  try {
    await postJson('/api/push/subscribe', subscription.toJSON());
  } catch (error) {
    // Otherwise this phone would think it is subscribed while the server has no copy.
    await subscription.unsubscribe();
    throw error;
  }
  return 'on';
}

// The server first: if it fails, the phone stays subscribed and the user can try again.
export async function unsubscribe(): Promise<AlertState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await postJson('/api/push/unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return 'off';
}

// Sends this phone's subscription again on every open, so the server gets it back if lost.
export async function syncSubscription(): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription) {
    await postJson('/api/push/subscribe', subscription.toJSON());
  }
}
```

- [ ] **Paso 3: comprobar que pasan**

Ejecutar `pnpm vitest run src/lib/push.test.ts`. Resultado esperado: PASS.

- [ ] **Paso 4: crear `src/components/DailyAlert.tsx`**

```tsx
// "Aviso diario", in the forecast tab: opt in to the 9:00 forecast notification. It only works
// with the dashboard installed as an app; in the browser it explains how to install it.
import { Bell, BellOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { alertState, subscribe, syncSubscription, unsubscribe, type AlertState } from '../lib/push';

export function DailyAlert() {
  const [state, setState] = useState<AlertState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    alertState()
      .then((current) => {
        if (active) {
          setState(current);
        }
        if (current === 'on') {
          syncSubscription().catch((error: unknown) => console.error(error));
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) {
          setState('unsupported');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const run = async (action: () => Promise<AlertState>) => {
    setBusy(true);
    setFailed(false);
    try {
      setState(await action());
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (state === null) {
    return null;
  }
  return (
    <section className="daily-alert" aria-labelledby="daily-alert-title">
      <h3 id="daily-alert-title">Aviso diario</h3>
      <p>Cada mañana a las 9:00, la previsión del día en tu móvil.</p>
      {state === 'not-installed' && (
        <>
          <p>Primero instala esta web como app:</p>
          <ol>
            <li>iPhone: botón Compartir → «Añadir a pantalla de inicio».</li>
            <li>Android: menú ⋮ → «Instalar app».</li>
          </ol>
          <p>Después ábrela desde su icono y activa aquí el aviso.</p>
        </>
      )}
      {state === 'unsupported' && <p>Tu móvil no admite avisos (en iPhone hace falta iOS 16.4 o superior).</p>}
      {state === 'blocked' && <p>Has bloqueado las notificaciones. Actívalas en los ajustes del móvil.</p>}
      {state === 'off' && (
        <button type="button" disabled={busy} onClick={() => void run(subscribe)}>
          <Bell size={16} aria-hidden="true" /> Avisarme cada mañana
        </button>
      )}
      {state === 'on' && (
        <>
          <p>Recibes la previsión cada día a las 9:00.</p>
          <button type="button" className="secondary" disabled={busy} onClick={() => void run(unsubscribe)}>
            <BellOff size={16} aria-hidden="true" /> Dejar de recibirlo
          </button>
        </>
      )}
      {failed && <p role="alert" className="daily-alert-error">No se pudo completar. Comprueba la conexión e inténtalo de nuevo.</p>}
    </section>
  );
}
```

- [ ] **Paso 5: colocarlo en la pestaña de previsión (`src/App.tsx`)**

Importar `import { DailyAlert } from './components/DailyAlert';` y añadirlo justo después de `<Forecast ... />`, dentro de `<Tabs.Content value="forecast">`:

```tsx
          <DailyAlert />
```

- [ ] **Paso 6: registrar el service worker (`src/main.tsx`)**

Añadir el import `import { isInstalled, registerServiceWorker } from './lib/push';` y, antes de `createRoot(...)`:

```ts
// The service worker only shows the daily notification, so only the installed app needs it.
if ('serviceWorker' in navigator && isInstalled()) {
  registerServiceWorker().catch((error: unknown) => console.error(error));
}
```

- [ ] **Paso 7: estilos (`src/index.css`)**

Añadir al final, con los tokens de color de los demás bloques:

```css
/* Daily alert */
.daily-alert { margin-top: 1.5rem; padding: 1.1rem 1.15rem; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
.daily-alert h3 { margin: 0 0 .35rem; font-size: 1rem; }
.daily-alert p, .daily-alert li { margin: .35rem 0 0; color: var(--muted); font-size: .85rem; line-height: 1.5; }
.daily-alert ol { margin: .35rem 0 0; padding-left: 1.2rem; }
.daily-alert button { display: inline-flex; align-items: center; gap: .45rem; margin-top: .75rem; border: 0; padding: .6rem 1rem; border-radius: 10px; color: #fff; background: var(--blue); font-weight: 600; cursor: pointer; }
.daily-alert button.secondary { color: var(--foreground); background: var(--active); }
.daily-alert button:disabled { opacity: .6; cursor: default; }
.daily-alert .daily-alert-error { color: var(--foreground); font-weight: 600; }
```

- [ ] **Paso 8: comprobar**

Ejecutar `pnpm typecheck && pnpm test`, y después el build:

```bash
pnpm exec vite build --outDir <scratchpad>/build --emptyOutDir
```

Resultado esperado: PASS y build correcto. Borrar `frontend/.vitest` si existe.

- [ ] **Paso 9: commit** (preguntar antes al usuario)

```bash
git add frontend/src/lib/push.ts frontend/src/lib/push.test.ts frontend/src/components/DailyAlert.tsx frontend/src/App.tsx frontend/src/main.tsx frontend/src/index.css
git commit -m "feat(dashboard): daily alert block to subscribe to the 9:00 forecast"
```

---

### Tarea 10: Configuración, documentación y prueba real

**Ficheros:**
- Modificar: `frontend/.env.example` y `README.md` (sección "Frontend and read API")

**Interfaces:**
- Consume: todo lo anterior.
- Produce: los pasos de configuración, documentados para el usuario.

- [ ] **Paso 1: añadir a `frontend/.env.example`**

```bash
# Daily forecast push (docs/superpowers/specs/2026-10-21-daily-forecast-push-design.md).
# VAPID keys: npx web-push generate-vapid-keys. The public one is public by design (the browser
# needs it), so it is the only VITE_ variable the server also reads.
VITE_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
# Shared with Supabase Vault (name cron_secret): openssl rand -hex 32. Also keys the IP hashes.
CRON_SECRET=
```

- [ ] **Paso 2: añadir al `README.md` una subsección "Daily forecast push"**

Debe incluir, en inglés como el resto del README, cinco pasos:

1. Generar las claves con `npx web-push generate-vapid-keys` y el secreto con `openssl rand -hex 32`.
2. Guardar en Vercel (Production y Preview) `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `CRON_SECRET`. Volver a desplegar: `VITE_*` se fija en el build.
3. En el editor SQL de Supabase: `select vault.create_secret('<CRON_SECRET>', 'cron_secret');`
4. Probar sin enviar:

   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://gorraplanistas.vercel.app/api/cron/daily-forecast?mode=preview"
   ```

5. Con la app instalada y el aviso activado, enviar uno de prueba con `?mode=send-now`.

Añadir también cómo ver los envíos:

```sql
select * from push_daily_runs order by day desc;
select jobname, status, start_time from cron.job_run_details order by start_time desc limit 10;
```

- [ ] **Paso 3: comprobación final**

Ejecutar `pnpm typecheck && pnpm test` y el build en el scratchpad. Borrar `.vitest`. Revisar `git status` para confirmar que no hay secretos ni `deno.lock`.

- [ ] **Paso 4: commit** (preguntar antes al usuario)

```bash
git add frontend/.env.example README.md
git commit -m "docs: set up and test the daily forecast push"
```

- [ ] **Paso 5 (lo hace el usuario): configuración y prueba real**

El agente da los pasos y espera; no los ejecuta:
1. Pasos 1 a 3 del README (claves en Vercel y secreto en Vault).
2. Fusionar el PR, o desplegar a producción.
3. `?mode=preview`: comprobar que el texto es correcto con datos reales.
4. En el iPhone: abrir la web, Compartir → Añadir a pantalla de inicio, abrir la app y tocar "Avisarme cada mañana".
5. `?mode=send-now`: llega la notificación y al tocarla se abre la pestaña de previsión.
6. "Dejar de recibirlo": la fila desaparece de `push_subscriptions`.
7. Volver a apuntarse y comprobar que al día siguiente llega a las 9:05.

Al terminar: `bd update meteo-upk --append-notes "..."` con el resultado. La tarea se cierra cuando el PR esté fusionado y haya llegado el primer aviso de las 9:05.
