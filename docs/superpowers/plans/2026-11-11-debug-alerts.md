# Alertas de debug de la estación: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** el dueño recibe en el móvil una notificación push cuando la estación se calla, manda valores imposibles, hace ruido en el pluviómetro, el servidor rechaza lecturas o la placa se reinicia. Todo va separado del aviso público de las 9:00.

**Arquitectura:**
- Una migración crea `debug_subscriptions`, `debug_alert_state`, el cursor de eventos y un `pg_cron` cada 5 min. El trabajo periódico solo corre en el Supabase propio.
- La función `station-alerts` (Deno, Supabase propio) lee el estado, decide con un módulo puro (`decide.ts`) y envía con web-push.
- `ingest` registra un evento `reading_rejected` por cada lectura o lote rechazado.
- Vercel solo gana dos acciones en `api/push.ts`, que se ejecutan cuando el dueño toca un botón. La PWA guarda una marca por mundo y tiene un panel con código en el pie.

**Tecnología:** Deno (Supabase Edge Runtime), `npm:@supabase/supabase-js@2`, `npm:web-push@3.6.7` (o `jsr:@negrel/webpush`, según la tarea 1), Postgres (`pg_cron`, `pg_net`, Vault), Vercel Functions (Node), React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-debug-alerts-design.md`. Léela antes de empezar.

## Restricciones globales

- **No arrancar servidores** (`pnpm dev`, `vercel dev`, Supabase local) ni ejecutar `pio`. Se pueden ejecutar: `deno test`, `deno check --node-modules-dir=none`, `pnpm test`, `pnpm typecheck` y `pnpm gen:types` (en `frontend/`).
- **Rama `feat/debug-alerts` desde `main`**, después de mergear el PR #18 (spec y plan). Nunca commits a `main`. Un commit por tarea, **solo cuando el usuario lo apruebe**. Sin atribución de IA (ni `Co-Authored-By`, ni "Generated with").
- **Desplegar `ingest` y `station-alerts` solo desde `main`**, después del merge. La excepción es la sonda temporal de la tarea 1, que no está en git: no toca la base de datos ni envía nada a nadie, y se borra al terminar. Pide permiso antes de subirla.
- Código, identificadores y comentarios en inglés. El texto que ve el usuario (notificaciones y panel), en español.
- Ningún secreto en el repo: ni `DEBUG_CODE`, ni las claves VAPID, ni el secreto de `station-alerts`, ni la URL ni la ruta del servidor.
- Nada periódico en Vercel. `api/` sigue con 7 funciones (no se crea ninguna).
- Los tiempos son constantes en `decide.ts`: 10 min para «callada», 30 min para recuperar, 6 h para el recordatorio, TTL de 1 h. El cron, `*/5 * * * *`, va en la migración.
- Exportaciones con nombre, sin `export default`.
- Usa `deno test --node-modules-dir=none` en `backend/supabase/functions/*` y borra cualquier `deno.lock` que aparezca.

## Foco de revisión

1. **Un móvil con el aviso diario apagado y debug encendido nunca entra en `push_subscriptions`.** Ni al activar debug, ni al abrir la app, ni al resincronizar. Test en la tarea 7.
2. **Instalación antigua (con suscripción y sin marca):** sigue como «aviso diario activado» y se sigue resincronizando. Test en la tarea 7.
3. **Baja de un mundo con el otro activo:** la suscripción del navegador se mantiene, en los dos sentidos. Si `localStorage` lanza un error, no se rompe nada. Test en la tarea 7.
4. **Estación sin conexión durante horas que luego vacía su búfer:** los eventos atrasados activan la alerta, pero no se recuperan en la pasada siguiente, porque la recuperación se mide con `inserted_at` y no con `ts`. Test en la tarea 4.
5. **Probar códigos a ciegas:** un código incorrecto da 403 y cuenta para el límite de 10 por hora por IP; el 11.º intento da 429 aunque el código sea correcto. Test en la tarea 6.

---

### Tarea 1: sonda de web-push en el Edge Runtime

Decide la librería de envío antes de escribir nada más (spec 9.1).

**Ficheros:** solo en el scratchpad: `push-probe/index.ts`. No va al repo.

- [ ] **Paso 1: escribe la sonda.**
  - `Deno.serve`. Genera claves VAPID con `webpush.generateVAPIDKeys()`.
  - Genera una suscripción falsa: par ECDH P-256 con `crypto.subtle`, clave pública `raw` en base64url y 16 bytes aleatorios como `auth`.
  - Llama a `webpush.sendNotification` contra `https://fcm.googleapis.com/fcm/send/probe-invalid`, con `TTL: 3600` y `topic: "debug-probe"`.
  - Responde `{ library, ok, statusCode, error }`.
- [ ] **Paso 2:** pide permiso al usuario y despliégala como `push-probe`, con el mismo procedimiento que `ingest` (infra, `docs/supabase.md`). Ejecuta `curl -X POST <SUPABASE_URL>/functions/v1/push-probe`.
  - **Éxito:** `statusCode` numérico (400, 403 o 404 de FCM). Así se comprueba el cifrado, la firma VAPID y la red.
  - **Fallo:** una excepción de cifrado o de módulo, sin `statusCode`.
- [ ] **Paso 3:** si falla, repite con `jsr:@negrel/webpush` y anota el resultado.
- [ ] **Paso 4:** borra `push-probe` del servidor y apunta en la bead la librería elegida y el `statusCode` recibido. La tarea 5 usa esa librería.

### Tarea 2: migración

**Ficheros:**
- Crear: `backend/supabase/migrations/20261111100000_debug_alerts.sql`
- Modificar: `frontend/shared/database.types.ts`, regenerado con `pnpm gen:types`.

**Interfaces que produce:**
- `debug_subscriptions(id bigint identity pk, endpoint text unique not null, p256dh text not null, auth text not null, created_at timestamptz default now(), last_sent_at timestamptz)`.
- `debug_alert_state(device_id text references devices, alert text check (alert in ('silent','sensor','rain_noise','rejected','reboot')), active boolean not null default false, since timestamptz, last_sent_at timestamptz, last_seen_at timestamptz, detail text, count integer not null default 0, primary key (device_id, alert))`.
  - `count` es decisión mía: lo necesita «4 reinicios».
- `debug_alert_cursor(id smallint primary key check (id = 1), last_event_id bigint not null)`.
  - Se crea con `last_event_id = coalesce((select max(id) from device_events), 0)`, para que el historial no dispare alertas.

- [ ] **Paso 1:** escribe la migración.
  - RLS activada sin políticas, y `revoke all ... from anon, authenticated` en las tres tablas.
  - Permisos de `service_role`:
    - `debug_subscriptions`: `select, insert, delete` y `update (endpoint, p256dh, auth, last_sent_at)`.
    - `debug_alert_state`: `select, insert, update`.
    - `debug_alert_cursor`: `select, update`.
  - `cron.schedule('station-alerts', '*/5 * * * *', ...)` con `net.http_post`.
    - La URL sale del secreto de Vault `station_alerts_url`. La cabecera es `Authorization: Bearer <secreto>`, con el secreto `station_alerts_secret`.
    - `timeout_milliseconds := 30000`.
    - La consulta lleva `where url is not null and secret is not null`: sin los secretos en Vault, el job no hace nada.
- [ ] **Paso 2:** el usuario ejecuta `pnpm db:push`. Espera su confirmación.
- [ ] **Paso 3:** ejecuta `pnpm gen:types` y `pnpm typecheck` en `frontend/`. Resultado esperado: sin errores.
- [ ] **Paso 4: commit** `feat(db): debug alert tables and station-alerts cron`.

### Tarea 3: `ingest` registra `reading_rejected`

**Ficheros:**
- Crear: `backend/supabase/functions/ingest/rejections.ts` y `rejections.test.ts`
- Modificar: `backend/supabase/functions/ingest/index.ts`

**Interfaces que produce:** `rejectionEvents(deviceId: string, now: Date, rejected: { index: number | null; reason: string }[]): EventRow[]`, con `kind: "reading_rejected"`.
- `ts`: `now` al segundo (`YYYY-MM-DDTHH:MM:SSZ`).
- `message`: `reading <index>: <reason>`, o `batch: <reason>` si `index` es `null`. Recortado a `MAX_MESSAGE_LENGTH`.

- [ ] **Paso 1: tests que fallan.**
  - `turns each rejected reading into a reading_rejected event`: entra `[{index: 2, reason: "wind_avg_ms out of range"}]` y sale `message === "reading 2: wind_avg_ms out of range"` con `ts === "2026-10-20T10:15:30Z"` (con `NOW` como en `validate.test.ts`).
  - `a whole batch rejection has no index`: entra `index: null` y sale `"batch: events must be an array"`.
  - `cuts long reasons to the message limit`.
- [ ] **Paso 2:** ejecuta `deno test --node-modules-dir=none backend/supabase/functions/ingest`. Resultado esperado: falla, porque el módulo no existe.
- [ ] **Paso 3:** implementa `rejectionEvents`. En `index.ts`:
  - Añade `rejectionEvents(deviceId, now, rejected)` a `events` antes del upsert.
  - Si `parseBody` falla (después de conocer la estación), inserta `rejectionEvents(deviceId, new Date(), [{ index: null, reason: batch.reason }])` y devuelve el mismo 400. Si ese insert falla, solo `console.error`: el 400 no cambia.
  - Haz lo mismo con el 400 de «body is not valid JSON».
- [ ] **Paso 4:** ejecuta `deno test` y `deno check --node-modules-dir=none backend/supabase/functions/ingest/index.ts`. Resultado esperado: todo pasa.
- [ ] **Paso 5: commit** `feat(ingest): log rejected readings as reading_rejected events`.

### Tarea 4: lógica de decisión (`decide.ts`)

**Ficheros:**
- Crear: `backend/supabase/functions/station-alerts/decide.ts` y `decide.test.ts`

**Interfaces que produce:**
```ts
export const SILENT_AFTER_MS = 10 * 60_000;
export const RECOVER_AFTER_MS = 30 * 60_000;
export const REMIND_EVERY_MS = 6 * 60 * 60_000;
export const NOTICE_TTL_S = 60 * 60;
export type AlertName = "silent" | "sensor" | "rain_noise" | "rejected" | "reboot";
export type AlertRow = { device_id: string; alert: AlertName; active: boolean; since: string | null;
  last_sent_at: string | null; last_seen_at: string | null; detail: string | null; count: number };
export type StationEvent = { id: number; ts: string; inserted_at: string; kind: string; message: string };
export type Station = { device_id: string; display_name: string };
export type Notice = { tag: string; title: string; body: string; url: string };
export function alertOf(event: StationEvent): AlertName | null;
export function decide(input: { station: Station; now: Date; lastReadingTs: string | null;
  events: StationEvent[]; previous: AlertRow[] }): { rows: AlertRow[]; notices: Notice[] };
```
- `alertOf` asigna cada evento a una alerta:
  - `value_dropped` → `sensor`.
  - `rain_dropped` y `rain` → `rain_noise`.
  - `reading_rejected` → `rejected`.
  - `boot` → `reboot`, salvo cuando el motivo (el texto tras `reset: `) es `restart by the firmware`: entonces `null`.
  - Cualquier otro tipo → `null`.
- `decide` devuelve siempre las 5 filas de la estación. Las que faltan en `previous` empiezan inactivas con `count` 0.
- Cada aviso lleva `tag: "debug-<alert>"` y `url: "/?station=<device_id>"`.
- Las horas se muestran en Madrid con formato `H:MM`, usando `Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "numeric", minute: "2-digit" })`.
- `formatDuration(ms)` da `"menos de 1 min"`, `"47 min"`, `"2 h"` o `"2 h 10 min"`.

Reglas (el algoritmo que los tests no dejan del todo cerrado):
- **`silent`:**
  - Se activa si `lastReadingTs` no es `null` y `now - lastReadingTs > SILENT_AFTER_MS`, con `since = lastReadingTs`.
  - Se recupera si `now - lastReadingTs <= SILENT_AFTER_MS`.
  - Sin ninguna lectura, nunca se activa.
- **Alertas de eventos:**
  - `since` es el `ts` más antiguo del primer grupo de eventos; `last_seen_at` es el `inserted_at` más reciente; `detail` es el último `message`; `count` suma los eventos.
  - Si ya estaba activa, los eventos nuevos actualizan `last_seen_at`, `detail` y `count` sin avisar.
  - Se recupera cuando no hay eventos nuevos y `now - last_seen_at >= RECOVER_AFTER_MS`. Al recuperarse vuelve a `active: false`, `count: 0`.
- **Recordatorio:** si la alerta sigue activa, sin otro aviso en esta pasada, y `now - last_sent_at >= REMIND_EVERY_MS`. Cada aviso pone `last_sent_at = now`.

Textos (título, cuerpo; `N` es el `display_name`; las horas son de Madrid):

| Alerta | Activación | Recordatorio | Recuperación |
|---|---|---|---|
| `silent` | «N: sin datos», «Última lectura a las 9:04.» | igual, «Sigue sin datos desde las 9:04.» | «N: vuelve a mandar datos», «Tras 47 min sin datos.» (`now - since`) |
| `sensor` | «N: valores imposibles del sensor», `detail` | igual, «Desde las 9:04. Último: `detail`» | «N: sensor normal», «Desde las 9:04 hasta las 11:20.» |
| `rain_noise` | «N: ruido en el pluviómetro», `detail` | ídem | «N: pluviómetro normal», ídem |
| `rejected` | «N: el servidor rechaza lecturas», `detail` | ídem | «N: el servidor vuelve a aceptar lecturas», ídem |
| `reboot` | un arranque: «N: ha vuelto la luz (power on)» o «N: reinicio (task watchdog)»; varios en la misma pasada: «N: 4 reinicios en 12 min (crash)», con el lapso entre el primer y el último `ts` y el último motivo. Cuerpo: `detail` | igual, «`count` reinicios desde las 9:04.» | «N: sin reinicios», «`count` reinicios entre las 9:04 y las 9:16.» |

- [ ] **Paso 1: tests que fallan** (con `now` y eventos fijos en UTC):
  - `alertOf maps each event kind`: `boot` con `"fw 0.5.1, reset: restart by the firmware"` da `null`; con `"reset: power on"` da `"reboot"`; `ota` da `null`.
  - `silent activates after 10 min without readings and notifies once`: lectura a las 08:04Z y `now` a las 08:15Z. Una fila activa con `since: "2026-11-11T08:04:00Z"` y un aviso `{ tag: "debug-silent", title: "Las Rozas: sin datos", body: "Última lectura a las 9:04." }`. En la pasada siguiente, con esas filas como `previous`, no hay avisos.
  - `silent recovers when a reading arrives, with the duration`: el cuerpo es `"Tras 47 min sin datos."`.
  - `a station that never sent a reading is not silent`.
  - `sensor activates on value_dropped, stays quiet while active, recovers after 30 min`.
  - `reminds every 6 hours while active`: `last_sent_at` hace 6 h da un recordatorio; hace 5 h 55 min, no.
  - `several boots in one run give one notice with the count`: 4 boots `crash` en 12 min dan un solo aviso, `"Las Rozas: 4 reinicios en 12 min (crash)"`, y `count: 4`.
  - `power on reads as power back`.
  - `late events from a buffered station do not recover on the next run`: eventos con `ts` de hace 2 h e `inserted_at` de ahora. Activa, y la pasada siguiente (5 min después) no recupera. (Foco 4.)
  - `formatDuration`: `30_000` da `"menos de 1 min"`, 47 min da `"47 min"`, 120 min da `"2 h"` y 130 min da `"2 h 10 min"`.
- [ ] **Paso 2:** ejecuta `deno test --node-modules-dir=none backend/supabase/functions/station-alerts`. Resultado esperado: falla.
- [ ] **Paso 3:** implementa `decide.ts` (puro: sin red, sin base de datos, sin `Deno.env`).
- [ ] **Paso 4:** ejecuta los tests. Resultado esperado: todos pasan.
- [ ] **Paso 5: commit** `feat(station-alerts): pure alert decision logic`.

### Tarea 5: función `station-alerts`

**Ficheros:**
- Crear en `backend/supabase/functions/station-alerts/`: `auth.ts`, `auth.test.ts`, `send.ts` e `index.ts`.

**Interfaces:**
- Usa: `decide`, `NOTICE_TTL_S` y los tipos de la tarea 4; las tablas de la tarea 2.
- Produce `secretMatches(header: string | null, secret: string | undefined): boolean`. Espera `Bearer <secret>`, compara en tiempo constante (SHA-256 de ambos y luego `timingSafeEqual` de `node:crypto`) y da `false` si el secreto está vacío o falta.
- Produce `sendToAll(subs: { id: number; endpoint: string; p256dh: string; auth: string }[], notice: Notice, vapid: { subject: string; publicKey: string; privateKey: string }): Promise<{ sent: number[]; gone: number[]; failed: number }>`.
  - Usa la librería de la tarea 1.
  - Payload: `JSON.stringify({ title, body, url, tag })`.
  - Opciones: `TTL: NOTICE_TTL_S`, `topic: notice.tag` y `timeout` de 10 s. Un 404 o 410 va a `gone`.
- Variables de entorno: `STATION_ALERTS_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, más las de Supabase que ya usa `ingest`. Copia aquí `secretKey()` de `ingest/index.ts`: las carpetas se despliegan por separado.

- [ ] **Paso 1: tests que fallan** para `secretMatches`:
  - Correcto da `true`.
  - Sin cabecera, con otro secreto, con otra longitud, sin `Bearer` o con el secreto vacío o `undefined`: `false`. (Foco 5, lado servidor.)
- [ ] **Paso 2:** ejecuta `deno test`. Resultado esperado: falla.
- [ ] **Paso 3:** implementa `auth.ts`, `send.ts` e `index.ts`. Flujo de `index.ts`:
  1. Si no es `POST` o `secretMatches` da falso: 401.
  2. Estaciones con `active` y `listed`.
  3. Cursor.
  4. Eventos con `id > cursor`, por `id`, máximo 1000.
  5. La última lectura de cada estación vigilada.
  6. Las filas de `debug_alert_state`.
  7. `decide` para cada estación.
  8. Upsert de las filas y del cursor (el `id` máximo leído, incluidos los eventos de estaciones no vigiladas).
  9. Los avisos, con `sendToAll` a todas las filas de `debug_subscriptions`. Las filas `gone` se borran y `last_sent_at` se actualiza en las enviadas.
  10. Responde `{ stations, events, notices, sent, gone, failed }`.

  El estado se guarda antes de enviar: si el envío falla, se pierde un aviso, nunca se repite en bucle.
- [ ] **Paso 4:** ejecuta `deno test` y `deno check --node-modules-dir=none backend/supabase/functions/station-alerts/index.ts`. Resultado esperado: todo pasa.
- [ ] **Paso 5: commit** `feat(station-alerts): monitor function with web push`.

### Tarea 6: Vercel, `debug-subscribe` y `debug-unsubscribe`

**Ficheros:**
- Modificar:
  - `frontend/api/push.ts`
  - `frontend/server/push-validation.ts`
  - `frontend/server/push-store.ts`
  - `frontend/server/push-sender.ts`
  - `frontend/vercel.json`
  - `frontend/public/sw.js`
  - `frontend/server/vercel-config.test.ts`
  - `frontend/server/push-validation.test.ts`
- Crear: `frontend/server/push-debug.test.ts`. No va en `api/`: allí cada `.ts` es una función.

**Interfaces que produce:**
- `parseDebugSubscribe(body: unknown): Parsed<{ subscription: PushSubscriptionInput; code: string; test: boolean }>`
  - `code`: un string de 1 a 200 caracteres.
  - `test`: booleano, `false` si no viene.
- `codeMatches(given: string, expected: string): boolean`. Compara en tiempo constante (HMAC o SHA-256 de ambos y `timingSafeEqual`) y da `false` si `expected` está vacío.
- `saveDebugSubscription(sub): Promise<'saved' | 'full'>`, con `MAX_DEBUG_SUBSCRIPTIONS = 20`, y `deleteDebugSubscription(endpoint): Promise<void>`.
- `sendToAll(subs, payload, details, options?: { ttlSeconds?: number; topic?: string })`. Sin `options` se comporta como hoy.
- Acciones `'debug-subscribe'` y `'debug-unsubscribe'` en `ACTIONS`.
- Rewrite: `/api/push/:action(subscribe|unsubscribe|debug-subscribe|debug-unsubscribe)`.
- Variable de entorno `DEBUG_CODE`.

- [ ] **Paso 1: tests que fallan.**
  - `push-validation.test.ts`:
    - `parseDebugSubscribe` acepta `{...subscription, code, test: true}`.
    - Rechaza un código ausente, vacío o de más de 200 caracteres.
    - Rechaza una suscripción no válida.
    - `codeMatches` da `true` con el código igual, `false` con otro o con otra longitud, y `false` si `expected` es `''`.
  - `push-debug.test.ts`, con `vi.mock` de `push-store` y `push-sender` y `vi.stubEnv` de `DEBUG_CODE`, `CRON_SECRET` y las VAPID. Llama a `POST(new Request('https://x/api/push?action=debug-subscribe', ...))`:
    - `wrong code is 403 and still counts against the limit`: `allowRequest` se llamó y `saveDebugSubscription` no.
    - `over the limit is 429 before checking the code`.
    - `right code saves and sends a test push only when test is true`: `sendToAll` se llama una vez con el título «Alertas de la estación activadas» y `topic: 'debug-test'`. Con `test: false`, no se llama.
    - `debug-unsubscribe deletes by endpoint without a code`: 204.
    - `debug-subscribe never touches push_subscriptions`: no se llama a `saveSubscription`.
  - `vercel-config.test.ts`: añade `/api/push/debug-subscribe` y `/api/push/debug-unsubscribe` a las URL públicas.
- [ ] **Paso 2:** ejecuta `pnpm test` en `frontend/`. Resultado esperado: fallan los nuevos.
- [ ] **Paso 3:** implementa.
  - El orden en `debugSubscribe` es: JSON, parse, `allowRequest`, `codeMatches`, guardar, prueba opcional.
  - Si `test` es `true`, el payload de prueba es `{ title: 'Alertas de la estación activadas', body: 'Así llegarán los avisos de la estación.', url: '/', tag: 'debug-test' }`, enviado con `ttlSeconds: 3600` y `topic: 'debug-test'`.
  - Si falla el envío de prueba, devuelve 502 y deja la fila guardada.
  - `sw.js`: `tag: data.tag || 'daily-forecast'`; actualiza el comentario del payload.
- [ ] **Paso 3b:** cambia el comentario de cabecera de `api/push.ts` para describir las cuatro acciones.
- [ ] **Paso 4:** ejecuta `pnpm test` y `pnpm typecheck`. Resultado esperado: todo pasa.
- [ ] **Paso 5: commit** `feat(push): debug-subscribe and debug-unsubscribe actions`.

### Tarea 7: estado de cada mundo en la PWA (`src/lib`)

**Ficheros:**
- Crear: `frontend/src/lib/push-flags.ts`, `frontend/src/lib/debug-push.ts` y `frontend/src/lib/debug-push.test.ts`
- Modificar: `frontend/src/lib/push.ts` y `frontend/src/lib/push.test.ts`

**Interfaces que produce:**
- `push-flags.ts`: `dailyFlag(): 'on' | 'off' | null`, `setDailyFlag(v: 'on' | 'off'): void`, `debugFlag(): { code: string; endpoint: string } | null` y `setDebugFlag(v: { code: string; endpoint: string } | null): void`.
  - Claves de `localStorage`: `push-daily` y `push-debug`.
  - Cada acceso va en `try/catch`. Si falla, la lectura da `null` y la escritura no hace nada.
- `push.ts`, exporta lo que comparte con debug: `currentSubscription()`, `postJson()` y `ensureSubscription(): Promise<PushSubscription | AlertState>`.
  - `ensureSubscription` pide permiso, reutiliza `getSubscription()` si existe o se suscribe con la clave VAPID.
  - Si el permiso no es `granted`, devuelve `'blocked'` u `'off'`.
- `push.ts`, cambios en lo que ya existe:
  - `alertState()`: `'on'` si `dailyFlag() === 'on'`, o si `dailyFlag() === null` y hay suscripción (instalación antigua).
  - `subscribe()`: usa `ensureSubscription`, después `setDailyFlag('on')`. Si falla el POST, solo llama a `unsubscribe()` del navegador cuando la suscripción es nueva y `debugFlag()` es `null`.
  - `unsubscribe()`: POST de baja y `setDailyFlag('off')`. Solo llama a `subscription.unsubscribe()` si `debugFlag()` es `null`.
  - `syncSubscription()`: solo reenvía si el aviso diario está activado según la regla de `alertState`.
- `debug-push.ts`:
  - `debugState(): Promise<AlertState>`: los mismos estados previos, y `'on'` si `debugFlag()` existe y hay suscripción.
  - `debugSubscribe(code: string): Promise<AlertState>`: lanza `WrongCodeError` si recibe 403. Usa `ensureSubscription`, hace POST a `/api/push/debug-subscribe` con `{ ...toJSON(), code, test: true }` y guarda `setDebugFlag({ code, endpoint })`.
  - `debugUnsubscribe(): Promise<AlertState>`: POST de baja, `setDebugFlag(null)`, y `unsubscribe()` del navegador solo si el aviso diario está apagado.
  - `syncDebugSubscription(): Promise<void>`: una vez por carga de página. Reenvía con `test: false` solo si el `endpoint` actual es distinto de `debugFlag().endpoint`, y luego lo guarda.
  - `export class WrongCodeError extends Error {}`.

- [ ] **Paso 1: tests que fallan.** Amplía `stubBrowser` con un `localStorage` falso y una opción `storageThrows`.
  - `push.test.ts`:
    - `legacy install with a subscription and no flag is on`. (Foco 2.)
    - `daily flag off with a debug subscription is off`.
    - `syncSubscription does not post when daily is off, even with a browser subscription`: `fetch` no se llama. (Foco 1.)
    - `daily unsubscribe keeps the browser subscription while debug is on`. (Foco 3.)
    - `daily subscribe reuses the existing debug subscription`: `pushManager.subscribe` no se llama.
    - `works as today when localStorage throws`.
  - `debug-push.test.ts`:
    - `debugSubscribe posts code and test true to debug-subscribe, never to /api/push/subscribe`. (Foco 1.)
    - `403 throws WrongCodeError and stores nothing`.
    - `debugUnsubscribe keeps the browser subscription while daily is on, drops it when daily is off`. (Foco 3.)
    - `syncDebugSubscription posts with test false only when the endpoint changed`.
    - `without localStorage debugState is off`.
- [ ] **Paso 2:** ejecuta `pnpm test`. Resultado esperado: fallan los nuevos.
- [ ] **Paso 3:** implementa.
- [ ] **Paso 4:** ejecuta `pnpm test` y `pnpm typecheck`. Resultado esperado: todo pasa.
- [ ] **Paso 5: commit** `feat(pwa): separate daily and debug push state`.

### Tarea 8: panel «Alertas de la estación»

**Ficheros:**
- Crear: `frontend/src/components/StationAlerts.tsx`
- Modificar: `frontend/src/components/Footer.tsx` y `frontend/src/index.css`

**Interfaces que usa:** `debugState`, `debugSubscribe`, `debugUnsubscribe`, `syncDebugSubscription` y `WrongCodeError`, de la tarea 7.

- [ ] **Paso 1:** en `Footer.tsx`, dentro de `.attribution`, añade un botón con aspecto de enlace, «Alertas de la estación». Abre un `<dialog>` nativo con `showModal()`, que contiene `StationAlerts`.
- [ ] **Paso 2:** en `Footer.tsx`, un `useEffect` llama a `syncDebugSubscription()` y solo hace `console.error` si falla.
- [ ] **Paso 3:** escribe `StationAlerts`, con la misma estructura y los mismos textos de estado previo que `DailyAlert`:
  - `not-installed`, `unsupported` y `blocked`: los mismos textos.
  - `off`: campo de contraseña «Código» y botón «Activar».
  - `on`: «Recibes las alertas de la estación.» y un botón secundario «Desactivar».
  - Si el código es incorrecto: «Código incorrecto.» Cualquier otro error: el mismo texto que `DailyAlert`.
  - Botón «Cerrar».
  - Estilos: reutiliza las clases de `.daily-alert` donde se pueda, más lo mínimo para el `dialog`.
- [ ] **Paso 4:** ejecuta `pnpm test`, `pnpm typecheck` y `pnpm build` con salida en el scratchpad (`--outDir`). Resultado esperado: sin errores.
- [ ] **Paso 5:** el usuario lo prueba con `pnpm dev` y comprueba que el pie se ve igual en móvil. Espera su confirmación.
- [ ] **Paso 6: commit** `feat(pwa): station alerts panel in the footer`.

### Tarea 9: documentación, PR y puesta en marcha

**Ficheros:**
- Modificar: `README.md`, `frontend/.env.example` (`DEBUG_CODE=`) y `docs/hardware-log.md` (solo si la prueba en el móvil sale bien).

- [ ] **Paso 1:** en `README.md`, añade la sección «Station debug alerts», en inglés y en pocas líneas:
  - Qué hace, con enlace a la spec.
  - `DEBUG_CODE` en Vercel (`openssl rand -hex 16`).
  - En Coolify: `STATION_ALERTS_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`. Deben ser las mismas VAPID que en Vercel. Cambiarlas reinicia el contenedor de funciones unos segundos; la estación guarda las lecturas en su búfer.
  - En Vault: `select vault.create_secret('<url>', 'station_alerts_url'); select vault.create_secret('<secret>', 'station_alerts_secret');`.
  - Despliegue de `station-alerts`: igual que `ingest`.
  - Comprobación: `select * from debug_alert_state;` y `select status_code from net._http_response order by created desc limit 5;`.
  - Añade también `debug-subscribe` y `debug-unsubscribe` a la lista de `api/` en la estructura del repo.
- [ ] **Paso 2: commit** `docs: station debug alerts setup`. Pregunta al usuario si hace push y abre el PR.
- [ ] **Paso 3:** después del merge, desde `main` y con el visto bueno del usuario:
  - El usuario pone las variables de entorno (Vercel y Coolify) y los secretos de Vault.
  - Despliega `ingest` y `station-alerts`.
  - Comprueba que `curl -X POST <url>` sin cabecera da 401.
  - Comprueba que la siguiente pasada del cron devuelve 200 en `net._http_response`.
- [ ] **Paso 4:** prueba manual (spec, sección 10):
  - Activar en el móvil con el código: llega la prueba.
  - Un móvil con el aviso diario apagado y debug encendido no recibe la previsión de la mañana.
  - Desactivar debug no quita el aviso diario.
  - Una alerta real de `sensor` llega mientras el BME280 siga mojado. Anótalo en `docs/hardware-log.md`.
- [ ] **Paso 5:** `bd close` de la bead de la funcionalidad.
