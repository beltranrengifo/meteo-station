# Aviso diario con la previsión del día (push a las 9:00)

- Fecha: 2026-10-21
- Tarea: meteo-upk (primer paso de meteo-lr1, corrección de sesgo)
- Rama: `feat/daily-forecast-push`

## 1. Objetivo

Cada día a las 9:00 de Madrid, quien tenga la web instalada como app (PWA) y se haya apuntado recibe en el móvil una notificación con la previsión del día para la estación. Funciona en iPhone (iOS 16.4 o superior) y en Android, sin app nativa. Al tocarla se abre la web.

Funciona bien si:

- llega una notificación al día y nunca dos;
- el texto tiene siempre el mismo formato, aunque la estación falle;
- apuntarse y darse de baja funcionan;
- nadie puede llenar la tabla de suscripciones.

Fuera de alcance por ahora: elegir otra hora, alertas puntuales (helada, viento fuerte) fuera del aviso diario, otros idiomas y suscripciones por estación.

## 2. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Dónde vive el envío | Vercel (`frontend/api/`, `frontend/server/`) | Reutiliza `server/open-meteo.ts`. Las coordenadas siguen solo en `STATION_COORDINATES` de Vercel. |
| Quién lo lanza | `pg_cron` + `pg_net` en Supabase, a las 07:05 y 08:05 UTC | `pg_cron` ya se usa. Es puntual, y Vercel Cron en el plan Hobby no lo es. |
| Hora real de envío | 9:05 de Madrid | Así ya ha llegado la lectura de las 9:00. |
| Quién puede apuntarse | Solo con la web instalada como app, en cualquier plataforma | iPhone lo exige, y así el flujo es igual en todos los móviles. |
| Service worker | Escrito a mano y mínimo (push y clic), sin caché offline | No hace falta `vite-plugin-pwa`, y su caché podría dejar versiones viejas de la web. |
| Mínima de hoy | La menor entre la mínima medida desde las 00:00 y la del modelo para el resto del día ya corregida | A las 9:05 la mínima de la noche casi siempre ya está medida. |
| Formato | Título y cuatro líneas, con emoticonos, horas y cifras | Concreto: cuánto y cuándo. |

## 3. Cómo se sabe si alguien está suscrito, y cómo se da de baja

No hay cuentas de usuario. **La suscripción vive en el propio móvil**, dentro del navegador o de la app instalada.

- **¿Está suscrito?** La web llama a `registration.pushManager.getSubscription()`. Si devuelve una suscripción, ese móvil está apuntado. Si devuelve `null`, no lo está. Es la única fuente de verdad que mira la interfaz.
- **Apuntarse:**
  1. El usuario toca el botón y se le pide permiso.
  2. La web llama a `pushManager.subscribe()` con la clave pública VAPID.
  3. El navegador devuelve un `endpoint`: una URL secreta y única del servicio de push de Apple o Google para ese móvil, con dos claves (`p256dh` y `auth`).
  4. La web manda eso a `POST /api/push/subscribe`, que lo guarda en `push_subscriptions`. El `endpoint` es único y la escritura es un upsert, así que repetirlo no duplica nada.
- **Sincronización:** cada vez que se abre la app y hay suscripción, se vuelve a mandar a `subscribe`. Así, si la fila se perdió en el servidor, se recupera.
- **Darse de baja:** el usuario toca "Dejar de recibirlo".
  1. La web llama a `subscription.unsubscribe()`, que anula el endpoint en el servicio de push.
  2. Manda el `endpoint` a `POST /api/push/unsubscribe`, que borra la fila.

  Para dar de baja un móvil hace falta conocer su endpoint, y solo lo conoce ese móvil.
- **Bajas que no pasan por la web**, porque el usuario quita el permiso en Ajustes o borra la app: el servicio de push responde 404 o 410 en el siguiente envío, y entonces se borra la fila.

## 4. Contenido de la notificación

Los datos de Open-Meteo cubren las horas de hoy de 9 a 23 h (hora de Madrid). Hay tres franjas: **mañana** de 9 a 14, **tarde** de 14 a 20 y **noche** de 20 a 24.

Ejemplo:

> **⛅ Madrid, Las Rozas · miércoles 22**
> ☀️ Soleado por la mañana, 🌦️ chubascos por la tarde. Se acerca una borrasca, la presión baja.
> 🌡️ Entre 9 °C (7 h) y 21 °C (16 h).
> 💧 Lluvia (70 %) de 15 a 20 h, unos 4 mm.
> 💨 Viento moderado, 25 km/h del oeste, con rachas de 45 km/h hacia las 17 h.

El título es `{emoticono} {display_name de la estación} · {día de la semana} {día}`. El emoticono es el del cielo más severo del día (orden en 4.1).

### 4.1 Línea 1: cielo, situación y avisos

**Cielo por franjas.** Cada hora se clasifica por su `weather_code` (WMO) de Open-Meteo:

| Tipo | Códigos | Texto | Emoticono |
|---|---|---|---|
| despejado | 0, 1 | "soleado" de día, "despejado" de noche | ☀️ / 🌙 |
| poco nuboso | 2 | "poco nuboso" | 🌤️ |
| nuboso | 3 | "nuboso" | ☁️ |
| niebla | 45, 48 | "niebla" | 🌫️ |
| chubascos | 80–82 | "chubascos" | 🌦️ |
| lluvia | 51–67 | "lluvia" | 🌧️ |
| nieve | 71–77, 85, 86 | "nieve" | 🌨️ |
| tormenta | 95–99 | "tormenta" | ⛈️ |

- Orden de severidad, de menos a más: despejado, poco nuboso, nuboso, niebla, chubascos, lluvia, nieve, tormenta.
- El tipo de una franja es el que más se repite en sus horas. Si empatan, gana el más severo.
- Si las tres franjas tienen el mismo tipo: "☀️ Soleado todo el día."
- Si no, cada franja con su emoticono: "☀️ Soleado por la mañana, ☁️ nuboso por la tarde y 🌙 despejado por la noche."
- "Despejado" de día y de noche cuentan como el mismo tipo.

**Situación**, según `pressure_msl` de 9 a 23 h:

- media ≥ 1020 hPa y diferencia entre las 23 h y las 9 h de menos de 3 hPa: "Anticiclón, tiempo estable."
- baja 5 hPa o más entre las 9 y las 23 h, o media ≤ 1005 hPa: "Se acerca una borrasca, la presión baja."
- en otro caso no se dice nada.

Es una deducción por la presión, no un parte oficial.

**Avisos.** Van al final de la línea, empiezan por ⚠️ y salen en este orden:

| Condición | Texto |
|---|---|
| algún código 95–99 | "⚠️ Ojo: tormentas por la {franja}." Si hay en más de una franja, "a lo largo del día". |
| mínima de hoy ≤ 0 °C | "⚠️ Helada al amanecer." |
| máxima de hoy ≥ 35 °C | "⚠️ Calor intenso." |
| código 45 o 48 a las 9 o a las 10 h | "⚠️ Niebla por la mañana." |

### 4.2 Línea 2: temperatura (corregida con la estación)

> 🌡️ Entre {mín} °C ({hora} h) y {máx} °C ({hora} h).

Las temperaturas se redondean a grados enteros.

**Corrección.** Se calculan dos diferencias, cada una solo si hay datos:

- `d9` = temperatura medida a las 9:00 menos la temperatura del modelo hoy a las 9:00. La lectura medida es la primera con hora entre 9:00 y 9:05 de Madrid.
- `dAyer` = máxima medida ayer menos la máxima que el modelo preveía ayer. La prevista es la mayor de `temperature_2m_previous_day1` de las 0 a las 23 h de ayer, de la API de ejecuciones anteriores de Open-Meteo. La medida sale de `readings_daily` de ayer y solo cuenta si tiene al menos 1200 muestras de 1440.

`corrección` = la media de las diferencias disponibles, limitada a ±5 °C. Si no hay ninguna, vale 0.

- **Máxima** = la mayor del modelo de 9 a 23 h + `corrección`. La hora es la de esa hora del modelo.
- **Mínima** = la menor de estas dos:
  - la mínima medida desde las 00:00, con su hora real. Solo cuenta si de 00:00 a 09:00 hay al menos 430 lecturas de 540 (el 80 %);
  - la menor del modelo de 9 a 23 h + `corrección`, con la hora del modelo.

  Si no hay mínima medida, se usa la menor del modelo de 0 a 23 h + `corrección`.

Si la estación no tiene datos, la corrección vale 0 y no se usa la mínima medida: sale la previsión de Open-Meteo sin corregir, con el mismo formato y sin avisar.

Como la garita se calienta con el sol, `dAyer` hace que la previsión refleje ese calor de más. Es lo que se busca: que cuadre con lo que mide la estación.

### 4.3 Línea 3: lluvia (Open-Meteo)

Con `precipitation_probability` y `precipitation` de 9 a 23 h:

- `p` = probabilidad máxima;
- horas = de la primera a la última hora con probabilidad ≥ 30 % ("de 15 a 20 h"; la última hora cuenta entera);
- `mm` = suma de `precipitation` redondeada. Si es menor de 1, se escribe "menos de 1 mm".

| Caso | Texto |
|---|---|
| `p` < 20 % | "☂️ Sin lluvia ({p} %)." |
| 20 % ≤ `p` < 50 % | "💧 Posible lluvia ({p} %) de {h1} a {h2} h, {mm}." |
| `p` ≥ 50 % | "💧 Lluvia ({p} %) de {h1} a {h2} h, {mm}." |

Si `p` está entre 20 y 30 %, ninguna hora llega al 30 % y la frase va sin horas: "💧 Posible lluvia (25 %), menos de 1 mm."

### 4.4 Línea 4: viento (Open-Meteo, a 10 m, en km/h)

Con `wind_speed_10m`, `wind_direction_10m` y `wind_gusts_10m` de 9 a 23 h:

- `v` = viento medio máximo, con la dirección a esa hora en una de las 8 direcciones, escrita entera ("del norte", "del noroeste", …);
- `r` = racha máxima y su hora.

Término según `v`, con los umbrales de AEMET:

| `v` | Término |
|---|---|
| ≤ 20 km/h | flojo |
| 21–40 km/h | moderado |
| 41–70 km/h | fuerte |
| > 70 km/h | muy fuerte |

| Caso | Texto |
|---|---|
| `r` < 20 km/h | "💨 Viento flojo, hasta {v} km/h del {dirección}." |
| `r` ≥ 20 km/h | "💨 Viento {término}, {v} km/h del {dirección}, con rachas de {r} km/h hacia las {hora} h." |

## 5. Arquitectura

```
móvil (PWA) --subscribe/unsubscribe--> Vercel api/push/* --> Supabase push_subscriptions
Supabase pg_cron (07:05 y 08:05 UTC) --pg_net POST + CRON_SECRET--> Vercel api/cron/daily-forecast
  -> lee la estación (readings, readings_daily) y Open-Meteo (forecast + previous runs)
  -> monta el texto una vez -> web-push a cada suscripción -> borra las que dan 404 o 410
```

### 5.1 Web (PWA), en `frontend/`

- `public/manifest.webmanifest`:
  - `name` "Gorraplanistas", `short_name` "Gorraplanistas";
  - `start_url` "/", `display` "standalone";
  - `theme_color` y `background_color` `#f5f7fb`;
  - iconos PNG de 192 y 512 px, y un 512 px "maskable".
- `index.html`: enlaza el manifest y añade `apple-touch-icon` (PNG de 180 px).
- Los iconos se generan desde `public/favicon.svg` con `design/render.ts`. El maskable usa una versión con margen y fondo, `design/icon-maskable.svg`.
- `public/sw.js`, el service worker:
  - `push`: lee el JSON `{ title, body, url }` y llama a `showNotification` con el icono.
  - `notificationclick`: si hay una ventana de la web abierta la enfoca; si no, abre `url`.
  - No hay caché ni `fetch`.
- `src/lib/push.ts` (lógica sin React):
  - `isInstalled()`: `matchMedia('(display-mode: standalone)')` o `navigator.standalone`.
  - `isPushSupported()`: existen `serviceWorker`, `PushManager` y `Notification`.
  - `currentSubscription()`, `subscribe()` y `unsubscribe()`. La clave pública sale de `import.meta.env.VITE_VAPID_PUBLIC_KEY`.
- `src/components/DailyAlert.tsx`, un bloque "Aviso diario" bajo la previsión. Estados:

  | Estado | Qué se ve |
  |---|---|
  | No instalada | Explicación corta y pasos. iPhone: Compartir → Añadir a pantalla de inicio. Android: menú ⋮ → Instalar app. |
  | Instalada, sin soporte | "Tu móvil no admite avisos (en iPhone hace falta iOS 16.4 o superior)." |
  | Instalada, permiso bloqueado | "Has bloqueado las notificaciones. Actívalas en los ajustes del móvil." |
  | Instalada, sin suscripción | Botón "Avisarme cada mañana". El permiso se pide solo al tocarlo. |
  | Suscrita | "Recibes la previsión cada día a las 9:00" y el botón "Dejar de recibirlo". |
  | Error de red | Mensaje y botón para reintentar. |

- El service worker se registra al cargar la app instalada.

### 5.2 Vercel

- `api/push/subscribe.ts`, `POST { endpoint, keys: { p256dh, auth } }`:
  - **validación** (en `server/push-validation.ts`, con tests):
    - `endpoint` es HTTPS, mide como mucho 1000 caracteres y su host es de un servicio conocido: `web.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com` o `*.notify.windows.com`;
    - `p256dh` y `auth` son base64url y, una vez decodificados, miden 65 y 16 bytes;
  - **límite**: 10 peticiones por hora por IP (sumando `subscribe` y `unsubscribe`), y como mucho 1000 suscripciones. Si se supera, responde 429 o 503;
  - upsert por `endpoint`.
- `api/push/unsubscribe.ts`, `POST { endpoint }`: misma validación y mismo límite. Borra por `endpoint` y responde 204 aunque no existiera.
- La IP se guarda solo como `HMAC-SHA256(ip, CRON_SECRET)` en hexadecimal. La IP se lee de `x-forwarded-for`, el primer valor, que en Vercel pone la plataforma.
- `api/cron/daily-forecast.ts`, `POST`:
  1. Exige `Authorization: Bearer {CRON_SECRET}`. Si no, 401.
  2. Si en `Europe/Madrid` no son las 9, responde 200 "fuera de hora" sin hacer nada.
  3. Reúne los datos (5.3) y monta el mensaje con `buildDailyMessage`.
  4. Reserva el día: `insert into push_daily_runs (day) ... on conflict do nothing`. Si no inserta, ya se envió hoy: 200 sin hacer nada.
  5. Envía el mensaje con `web-push` a todas las suscripciones:
     - de 10 en 10 en paralelo;
     - `TTL` de 6 h, para que llegue aunque el móvil esté sin red un rato;
     - `urgency: 'normal'`;
     - `topic: 'daily-forecast'`.
  6. Con 404 o 410 borra la suscripción. Si va bien, actualiza `last_sent_at`.
  7. Guarda en `push_daily_runs` el texto y los recuentos (enviadas, fallidas, borradas).

  Modos de prueba, también con el secreto:
  - `?mode=preview`: devuelve el texto y los datos usados, sin reservar el día ni enviar.
  - `?mode=send-now`: envía ya, sin mirar la hora ni reservar el día. Solo para pruebas mientras no haya más suscriptores que el dueño.
- `server/daily-forecast.ts`, la lógica pura con tests:
  - `temperatureCorrection`;
  - `todayRange` (máxima y mínima);
  - `skyLine`, `pressureSituation`, `warnings`, `rainLine`, `windLine` y `title`;
  - `buildDailyMessage(input) -> { title, body }`.

  No hace llamadas de red: recibe los datos ya leídos.
- `server/open-meteo.ts` gana dos consultas:
  - `dailyForecastUrl`: `forecast_days=1`, `timezone=Europe/Madrid`, `wind_speed_unit=kmh` y por horas `temperature_2m, precipitation_probability, precipitation, weather_code, wind_speed_10m, wind_direction_10m, wind_gusts_10m, pressure_msl, is_day`;
  - `previousRunsUrl`: `previous-runs-api.open-meteo.com`, `past_days=1`, por horas `temperature_2m_previous_day1`.
- Dependencia nueva: `web-push`, la librería de referencia de Web Push en Node, y sus tipos.

### 5.3 Datos de la estación

La estación es la de por defecto (`STATION_DEVICE_ID`, o la primera listada); el título usa su `display_name`.

- Lectura de las 9:00: `readings` con `ts` en [09:00, 09:05) de Madrid, la primera.
- Mínima desde las 00:00: `readings` de [00:00, 09:00) de Madrid: la menor `temp_c`, su `ts` y el número de lecturas.
- Ayer: `readings_daily` de ayer: `temp_max` y `samples`.

### 5.4 Supabase (una migración)

```sql
create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create table public.push_requests (       -- límite por IP
  ip_hash text not null,
  at timestamptz not null default now()
);
create index on public.push_requests (ip_hash, at);
create table public.push_daily_runs (     -- un envío por día
  day date primary key,                   -- fecha de Madrid
  created_at timestamptz not null default now(),
  title text, body text,
  sent int, failed int, removed int
);
```

- RLS activado en las tres tablas, sin políticas: el navegador (anon) no accede.
- Permisos para `service_role` (Vercel):
  - `push_subscriptions`: select, insert, delete, y update de `p256dh`, `auth` y `last_sent_at`;
  - `push_requests`: select e insert;
  - `push_daily_runs`: insert, y update de `title`, `body`, `sent`, `failed` y `removed`.

  Es el primer `delete` que tiene esta clave, y solo sobre `push_subscriptions`.
- Extensión `pg_net` (en el esquema `extensions`).
- Trabajos de `pg_cron`:
  - `daily-forecast-push`, `'5 7,8 * * *'`: `net.http_post` a `https://gorraplanistas.vercel.app/api/cron/daily-forecast`, con `Authorization: Bearer` y el secreto `cron_secret` leído de `vault.decrypted_secrets`;
  - `push-requests-cleanup`, `'30 3 * * *'`: borra de `push_requests` lo de más de 1 día.

## 6. Secretos y configuración

Los crea y guarda el usuario. Nunca se escriben en el repositorio ni en el chat.

| Variable | Dónde | Qué es |
|---|---|---|
| `VAPID_PRIVATE_KEY` | Vercel | Clave privada VAPID |
| `VAPID_SUBJECT` | Vercel | `mailto:` de contacto |
| `VITE_VAPID_PUBLIC_KEY` | Vercel y `frontend/.env.local` | Clave pública VAPID (pública por diseño) |
| `CRON_SECRET` | Vercel | Secreto del cron (también clave del HMAC de IPs) |
| `cron_secret` | Supabase Vault | El mismo valor que `CRON_SECRET` |

Las claves VAPID se generan con `npx web-push generate-vapid-keys` y el secreto con `openssl rand -hex 32`. El cron se crea en la migración, pero hasta que exista el secreto en Vault no funciona.

## 7. Errores y casos límite

- **Estación sin datos** (WiFi caído): la corrección vale 0 y se usa la mínima del modelo. Mismo formato, sin avisar.
- **Open-Meteo no responde** (5 s de espera, un reintento): responde 502 sin enviar nada. El día no llega a reservarse, porque los datos se reúnen antes; ese día no hay aviso. La API de ejecuciones anteriores es opcional: si falla, simplemente no hay `dAyer`.
- **Cron de más o repetido**: la reserva en `push_daily_runs` impide un segundo envío.
- **Cambio de hora**: las dos ejecuciones UTC cubren el horario de verano y el de invierno. Solo actúa la que cae a las 9 en Madrid.
- **Envío a medias** (la función se corta): el día queda reservado y no se reintenta. Se prefiere perder un aviso a mandarlo dos veces.
- **Suscripción caducada**: 404 o 410, y se borra. Con otros errores se cuenta como fallida y se mantiene.
- **Abuso**: límite por IP, tope total y validación de host y formato.

## 8. Pruebas

- **Vitest**, en `frontend/server/`:
  - `daily-forecast.test.ts`: corrección (con y sin datos, tope de ±5), mínima medida frente a la del modelo, cielo por franjas y empates, presión, avisos, lluvia (los tres casos y sin horas), viento (los dos casos y direcciones) y mensaje completo;
  - `push-validation.test.ts`: hosts, base64url y tamaños;
  - `open-meteo.test.ts`: las dos URLs nuevas y el parseo;
  - comprobación de la hora 9 de Madrid en verano e invierno.
- **`src/lib/push.ts`**: tests de los estados con `matchMedia` y `navigator` simulados.
- **A mano** (el usuario):
  1. Desplegar la preview y llamar a `?mode=preview` con el secreto para ver el texto con datos reales.
  2. Instalar la PWA en el iPhone y apuntarse.
  3. Probar `?mode=send-now` y tocar la notificación.
  4. Darse de baja y comprobar que la fila desaparece.
  5. Ver que al día siguiente llega a las 9:05.

## 9. Orden de implementación (resumen para el plan)

1. Migración y tipos (`pnpm gen:types`).
2. `server/daily-forecast.ts` con tests, y las URLs de Open-Meteo.
3. `api/cron/daily-forecast` con `preview`.
4. `api/push/subscribe` y `api/push/unsubscribe`, con su validación.
5. PWA: manifest, iconos, `sw.js`, `push.ts` y `DailyAlert`.
6. El usuario configura los secretos, aplica la migración y prueba.
