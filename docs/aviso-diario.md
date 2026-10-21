# Aviso diario con la previsión

Guía para el dueño del proyecto. El diseño completo está en
[`docs/superpowers/specs/2026-10-21-daily-forecast-push-design.md`](superpowers/specs/2026-10-21-daily-forecast-push-design.md).

## 1. Qué es

Cada día a las 9:00 de Madrid, quien tenga la web instalada como app en el móvil y se haya apuntado recibe una notificación con la previsión del día para la estación. Funciona en iPhone (iOS 16.4 o superior) y en Android, sin app nativa. Al tocarla se abre la pestaña de previsión (si la app ya estaba abierta, la trae al frente y la lleva a esa pestaña). El mensaje sale a las 9:05, para que ya haya llegado la lectura de las 9:00.

Ejemplo:

> **🌦️ Madrid, Las Rozas · jueves 22**
> ☀️ Soleado por la mañana, 🌦️ chubascos por la tarde y 🌙 despejado por la noche. Se acerca una borrasca, la presión baja.
> 🌡️ Entre 9 °C (7 h) y 21 °C (16 h).
> 💧 Lluvia (70 %) de 15 a 20 h, unos 4 mm.
> 💨 Viento moderado, 25 km/h del oeste, con rachas de 45 km/h hacia las 17 h.

## 2. Cómo funciona

1. El usuario instala la web como app (PWA) y toca "Avisarme cada mañana".
2. El móvil crea la suscripción y la web la manda a `POST /api/push/subscribe`, que la guarda en la tabla `push_subscriptions`.
3. `pg_cron` de Supabase llama a `/api/cron/daily-forecast` a las 07:05 y a las 08:05 UTC, con `Authorization: Bearer` y el secreto.
4. La función solo actúa si en `Europe/Madrid` son las 9. La otra llamada responde "not 9:00 in Madrid" y no hace nada (una cae a las 9 en verano y la otra en invierno).
5. Lee la estación (`readings` y `readings_daily`) y Open-Meteo (previsión y ejecución del día anterior).
6. Monta el texto una sola vez.
7. Reserva el día en `push_daily_runs`. Si ya estaba reservado, no envía.
8. Envía el mensaje a todas las suscripciones, de 10 en 10.
9. Borra las suscripciones a las que el servicio de push responde 404 o 410. Guarda el texto y los recuentos en `push_daily_runs`.

Ficheros (los que no empiezan por `backend/` están en `frontend/`):

| Fichero | Para qué |
|---|---|
| `api/push/subscribe.ts` | Guarda la suscripción de un móvil. |
| `api/push/unsubscribe.ts` | Borra la suscripción de un móvil. |
| `api/cron/daily-forecast.ts` | El envío de las 9:05, y los modos de prueba. |
| `server/daily-data.ts` | Reúne los datos de la estación y de Open-Meteo. |
| `server/daily-temperature.ts` | Corrección de temperatura, máxima y mínima. |
| `server/daily-message.ts` | Monta el título y las cuatro líneas del texto. |
| `server/push-validation.ts` | Valida endpoint y claves; calcula el hash de la IP; compara el secreto. |
| `server/push-store.ts` | Acceso a Supabase: suscripciones, límite por IP, reserva del día. |
| `server/push-sender.ts` | Envía con `web-push` (VAPID). |
| `public/sw.js` | Service worker: enseña la notificación y, al tocarla, abre la web o lleva a la pestaña de previsión la que ya está abierta. |
| `public/manifest.webmanifest` | Datos de la app instalada. |
| `src/lib/push.ts` | Lógica de la suscripción en el móvil. |
| `src/components/DailyAlert.tsx` | El bloque "Aviso diario" de la pestaña de previsión. |
| `backend/supabase/migrations/20261021100000_push_notifications.sql` | Tablas, permisos y trabajos de `pg_cron`. |

## 3. Cómo se corrigen las temperaturas

La garita se calienta con el sol, así que Open-Meteo suele quedarse corto. El texto se corrige con lo que mide la estación:

- Se calculan dos diferencias, cada una solo si hay datos:
  - la temperatura medida a las 9:00 menos la del modelo a las 9:00;
  - la máxima medida ayer menos la que el modelo preveía ayer. Solo cuenta si ayer hay al menos 1200 muestras de 1440.
- La corrección es la media de las diferencias que haya, con un tope de ±5 °C. Sin ninguna, vale 0.
- **Máxima**: la mayor del modelo de 9 a 23 h, más la corrección.
- **Mínima**: la menor entre la mínima medida desde las 00:00 (solo cuenta con al menos 430 lecturas de 540) y la del modelo de 9 a 23 h más la corrección. Sin mínima medida, la menor del modelo de todo el día más la corrección.
- Si la estación no tiene datos, sale la previsión de Open-Meteo sin corregir, con el mismo formato y sin avisar.

La lluvia y el viento son de Open-Meteo, sin corregir.

## 4. Configuración (una vez)

Los valores los crea y guarda el dueño. No se escriben en el repositorio ni en el chat.

1. Genera las claves y el secreto, y guárdalos donde no se pierdan:

   ```sh
   npx web-push generate-vapid-keys
   openssl rand -hex 32
   ```

   Lo primero da la clave pública y la privada VAPID. Lo segundo es el secreto del cron (`CRON_SECRET`).

2. En Vercel, en Production y en Preview, crea estas cuatro variables:

   | Variable | Valor |
   |---|---|
   | `VITE_VAPID_PUBLIC_KEY` | la clave pública VAPID |
   | `VAPID_PRIVATE_KEY` | la clave privada VAPID |
   | `VAPID_SUBJECT` | un `mailto:` de contacto, todo junto: `mailto:tu@correo.com` (sin `mailto:` Apple rechaza el envío) |
   | `CRON_SECRET` | el secreto de `openssl rand -hex 32` |

   Vuelve a desplegar: `VITE_*` se fija al construir la web. Si la clave pública no estaba en el build, el botón falla.

3. En el editor SQL de Supabase, guarda el mismo secreto en el Vault:

   ```sql
   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
   ```

   Sustituye `<CRON_SECRET>` por el valor real. Sin este secreto el cron no puede autenticarse.

4. Aplica la migración `20261021100000_push_notifications.sql` si aún no está aplicada. Crea las tablas y los dos trabajos de `pg_cron`: `daily-forecast-push` (`'5 7,8 * * *'`) y `push-requests-cleanup` (`'30 3 * * *'`).

5. Para probar en local, pon la clave pública también en `frontend/.env.local` como `VITE_VAPID_PUBLIC_KEY`.

## 5. Probar

1. Mira el texto sin enviar nada (sustituye el secreto por el tuyo en `$CRON_SECRET`):

   ```sh
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://gorraplanistas.vercel.app/api/cron/daily-forecast?mode=preview"
   ```

   Devuelve el título, el cuerpo y los datos usados para la corrección. No reserva el día ni envía.

2. Instala la web como app en el móvil:
   - iPhone: Compartir → Añadir a pantalla de inicio.
   - Android: menú ⋮ → Instalar app.

3. Abre la app desde su icono, ve a la pestaña de previsión y toca "Avisarme cada mañana". Acepta el permiso.

4. Envía un aviso de prueba (misma petición con `?mode=send-now`):

   ```sh
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://gorraplanistas.vercel.app/api/cron/daily-forecast?mode=send-now"
   ```

   Envía ya, sin mirar la hora y sin reservar el día. Responde con los recuentos (`sent`, `failed`, `removed`). Al tocar la notificación se abre la pestaña de previsión, también si la app ya estaba abierta en otra pestaña.

5. Toca "Dejar de recibirlo" y comprueba que la fila desaparece de `push_subscriptions` (consulta de la sección 6).

6. Vuelve a apuntarte. Al día siguiente debe llegar el aviso a las 9:05.

## 6. Comprobar los envíos

En el editor SQL de Supabase:

```sql
-- Un día por fila: el texto enviado y los recuentos.
select * from push_daily_runs order by day desc;

-- Si el cron se ejecutó.
select jobname, status, start_time from cron.job_run_details order by start_time desc limit 10;

-- Cuántos móviles hay apuntados.
select count(*) from push_subscriptions;
```

`cron.job_run_details` solo dice si la llamada salió. La respuesta de Vercel (401, 200, 502…) queda en la tabla de `pg_net`:

```sql
select status_code, timed_out, error_msg, content, created from net._http_response order by created desc limit 5;
```

`pg_net` guarda las respuestas unas 6 horas: ejecútala poco después de las 9:05. Si la petición caducó o no conectó, `status_code` sale vacío: mira `timed_out` y `error_msg`.

El envío con `?mode=send-now` no escribe en `push_daily_runs`.

## 7. Cómo sabe la web si estás suscrito y cómo darse de baja

No hay cuentas de usuario. **La suscripción vive en el propio móvil.**

- **¿Estás suscrito?** La web llama a `pushManager.getSubscription()`. Si devuelve una suscripción, ese móvil está apuntado; si devuelve `null`, no. Es lo único que mira la interfaz.
- **Sincronización:** cada vez que se abre la app y hay suscripción, se vuelve a mandar a `subscribe`. Si la fila se perdió en el servidor, se recupera.
- **Apuntarse:** si la web no consigue guardar la suscripción en el servidor, anula la del móvil y muestra el error. Así el móvil no cree estar apuntado sin estarlo.
- **Darse de baja** ("Dejar de recibirlo"):
  1. La web manda el `endpoint` a `POST /api/push/unsubscribe`, que borra la fila.
  2. Solo si el servidor responde bien, llama a `subscription.unsubscribe()`.

  Si el servidor falla, el móvil sigue suscrito y puedes reintentarlo. Para dar de baja un móvil hace falta su `endpoint`, y solo lo conoce ese móvil.
- **Bajas que no pasan por la web** (quitas el permiso en Ajustes o borras la app): en el siguiente envío el servicio de push responde 404 o 410 y se borra la fila.

## 8. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| No aparece el botón y se ven los pasos de instalación | La web no está instalada como app, o se abrió desde el navegador | Instálala y ábrela desde su icono. |
| "Tu móvil no admite avisos" | En iPhone, iOS anterior a 16.4; o el navegador no tiene Push | Actualiza iOS. |
| "Has bloqueado las notificaciones" | El permiso está denegado | Actívalo en los ajustes del móvil. |
| "No se pudo completar. Comprueba la conexión…" | Sin red; o 429 (más de 10 peticiones en una hora desde tu IP); o falta `VITE_VAPID_PUBLIC_KEY` en el build; o el servidor falló | Espera y reintenta; revisa la variable y vuelve a desplegar; mira los registros de Vercel. |
| "No se pudo completar" al apuntarte, y el servidor responde 503 | Se alcanzó el tope de 1000 suscripciones | Borra suscripciones que ya no se usen de `push_subscriptions`. |
| No llega a las 9:05 | Falta el secreto `cron_secret` en el Vault, o es distinto de `CRON_SECRET` de Vercel (401) | Revisa `net._http_response` y `cron.job_run_details`. Si falta, créalo (paso 3 de la configuración). Si existe pero es distinto, actualízalo (no se puede crear dos veces): `select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<CRON_SECRET>');` |
| No llega a las 9:05 | `push_daily_runs` ya tiene la fila de hoy (responde "already sent today") | Es lo normal tras un envío. Si el envío se cortó a medias, el día no se reintenta: se prefiere perder un aviso a mandarlo dos veces. |
| No llega a las 9:05 | No hay suscripciones, o se borraron por 404 o 410 | `select count(*) from push_subscriptions;` y vuelve a apuntarte. |
| Responde 502 "forecast unavailable" | Open-Meteo no responde (o falta una estación listada o sus coordenadas) | Ese día no hay aviso: el día no llega a reservarse, y no se reintenta solo. Con `?mode=send-now` puedes enviarlo a mano cuando vuelva. |
| `push_daily_runs` tiene la fila de hoy con título y recuentos vacíos | El envío falló después de reservar el día: falló la base de datos o el servicio de push, o se agotó el tiempo de la función | Mira los registros de Vercel de esa hora. El día no se reintenta: para mandarlo a mano usa `?mode=send-now`. |
| Responde 500 y no hay fila de hoy en `push_daily_runs` | Falta `VAPID_SUBJECT`, `VITE_VAPID_PUBLIC_KEY` o `VAPID_PRIVATE_KEY` en Vercel, o `VAPID_SUBJECT` no empieza por `mailto:` o `https:` (se comprueban antes de reservar el día) | Corrige la variable (el registro de Vercel dice cuál), vuelve a desplegar y repite la llamada. |
| Dejó de llegar el aviso a todos tras regenerar las claves VAPID | Las claves nuevas invalidan todas las suscripciones existentes: el servicio de push responde 403 y las filas cuentan como fallidas | Cada móvil debe darse de baja ("Dejar de recibirlo") y volver a apuntarse. No regeneres las claves si no hace falta. |
| Responde 401 | `Authorization` mal o `CRON_SECRET` distinto | Comprueba el valor en Vercel y que redesplegaste. |

## 9. Límites

- 10 peticiones por hora por IP, sumando `subscribe` y `unsubscribe` (se guarda solo un hash de la IP). Es por IP: los móviles de la misma WiFi de casa comparten el límite, y abrir la app también cuenta (sincroniza la suscripción).
- 1000 suscripciones como máximo.
- Una sola estación: la de por defecto (`STATION_DEVICE_ID`, o la primera listada).
- `TTL` de 6 h: si el móvil está sin red, el aviso aún llega hasta las 15:00.
- Un aviso al día, siempre a las 9:05 de Madrid.
- Solo se admiten servicios de push conocidos: Apple, Google (`fcm`), Mozilla y Windows.
