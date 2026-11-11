# Alertas de debug de la estación (push solo para el dueño)

Fecha: 2026-11-11. Estado: borrador para revisar.

## 1. Objetivo

Que el dueño de la estación se entere en el móvil, sin mirar logs, cuando algo no es normal: la estación deja de mandar datos, un sensor manda valores imposibles, el servidor rechaza lecturas, la placa se reinicia por un fallo.

Por qué ahora: el 2026-11-10 y el 2026-11-11 hubo tres incidentes que se descubrieron a mano y tarde (ráfagas de lluvia fantasma, un BME280 mojado que mandaba 184 °C y lecturas rechazadas durante horas). Ver `docs/hardware-log.md` y los beads `meteo-0jr` y `meteo-zh8`.

Éxito: ante cada uno de esos incidentes llega **un** aviso en minutos, otro si sigue pasando horas después, y otro cuando se arregla. Nada más.

## 2. Dos mundos separados

Hay dos tipos de notificación y no se mezclan:

| | Previsión (público) | Debug (solo el dueño) |
|---|---|---|
| Quién | cualquiera que lo active | quien sepa el código |
| Alta | botón "Avisarme cada mañana" | panel "Alertas de la estación" con código |
| Tabla | `push_subscriptions` (sin cambios) | `debug_subscriptions` (nueva) |
| Quién envía | Vercel, `api/cron/daily-forecast` | Supabase propio, función `station-alerts` |
| Cuándo | 9:00 | cuando pasa algo |
| `tag` de la notificación | `daily-forecast` | `debug-<alerta>` |

Lo único compartido, porque el navegador no permite otra cosa: el móvil tiene **una** suscripción push y **un** service worker por app (mismo `endpoint`, mismas claves VAPID). Cada mundo guarda ese `endpoint` en su propia tabla y lo usa por su cuenta.

Reglas:

- Darse de baja de un mundo solo borra su fila en el servidor. `PushSubscription.unsubscribe()` en el navegador solo se llama cuando ningún mundo la usa.
- Un fallo de uno no afecta al otro: código de debug incorrecto, tabla de debug vacía, función de alertas caída, etc.
- El aviso de la mañana solo cambia en cómo sabe el móvil si está activado y en cómo se da de baja (sección 6.2). Lo que recibe y cuándo, igual.

## 3. No-objetivos y anti-objetivos

No-objetivos (por ahora):

- Elegir qué alertas recibir. Llegan todas.
- Varios destinatarios con permisos distintos. El código vale para cualquiera que lo tenga; en la práctica, el dueño.
- Avisar si cae el propio servidor de Supabase: el monitor corre ahí, así que caería con él. Eso sería un monitor externo, otro proyecto.
- Telegram, correo o cualquier otro canal.

Anti-objetivos (sería un fracaso aunque funcione):

- **Gastar cuota de Vercel en el monitor.** Nada periódico se ejecuta en Vercel. Ya pasó en otro proyecto: un estado de Kuma que lanzaba un pipeline entero agotó la cuota del mes.
- **Spam.** Un sensor mojado durante horas no puede mandar un aviso por minuto.
- Que el público vea algo nuevo aparte de un enlace discreto en el pie.
- Romper el aviso de la mañana o tocarlo más allá de la sección 6.2.

## 4. Coste

| Dónde | Qué | Frecuencia |
|---|---|---|
| Vercel | alta y baja de debug (una acción más en `api/push.ts`, sin función nueva), una notificación de prueba al tocar "Activar", y el reenvío solo si el navegador cambia el `endpoint` | casi nunca |
| Supabase propio (Coolify) | `pg_cron` + función `station-alerts` | cada 5 min, 288 al día, en un servidor propio sin cobro por llamada |
| Servicio push (Google, Apple) | el envío | solo cuando hay alerta |

## 5. Arquitectura

```
móvil (PWA) --debug subscribe/unsubscribe + código--> Vercel api/push?action=debug-* --> debug_subscriptions
                                                      (y una notificación de prueba)

ingest --> readings, device_events (ya existe: value_dropped, rain_dropped; nuevo: reading_rejected)
firmware --> device_events (ya existe: boot, rain, wifi, upload, ota...)

Supabase pg_cron (*/5) --pg_net POST + secreto--> función station-alerts (Supabase propio)
  -> lee devices, la última lectura de cada estación, device_events nuevos y debug_alert_state
  -> decide (lógica pura, con tests) -> web-push a debug_subscriptions -> guarda el estado
```

## 6. Piezas

### 6.1 Datos (una migración)

- `debug_subscriptions`: `id`, `endpoint` (único), `p256dh`, `auth`, `created_at`, `last_sent_at`. RLS activada sin políticas y los mismos `grant` mínimos que `push_subscriptions`: solo `service_role`.
- `debug_alert_state`: una fila por estación y alerta: `device_id`, `alert`, `active`, `since`, `last_sent_at`, `last_seen_at` (último evento que la alimentó), `detail` (texto del último valor visto). Clave primaria `(device_id, alert)`.
- Cursor de eventos: cómo sabe la función qué `device_events` son nuevos desde la última pasada (por ejemplo, el último `id` procesado). Lo decide el builder.
- `pg_cron` cada 5 minutos con `net.http_post` a la función. **La URL y el secreto salen de Supabase Vault**, nunca de la migración: el host de la instancia no va en el repo (commit `c315bf5`).

### 6.2 Web (PWA), `frontend/`

Estado local de cada mundo. Hoy `alertState()` da por hecho que "hay suscripción en el navegador" quiere decir "aviso diario activado", y `syncSubscription()` la reenvía a `/api/push/subscribe` en cada apertura. Con debug, un móvil con el aviso diario apagado tendría suscripción igualmente: se apuntaría solo a la previsión. Por eso cada mundo guarda su propio estado en `localStorage`:

- `daily` activado o no. Instalaciones de antes, con suscripción y sin la marca: se toma como activado, que es lo que son hoy. Así ningún suscriptor actual pierde el aviso.
- `debug`: el código y el último `endpoint` enviado.
- `alertState()` del aviso diario mira su marca, no solo si hay suscripción.
- Sin `localStorage` (acceso bloqueado): el aviso diario se comporta como hoy y el panel de debug pide el código cada vez.

Panel:

- Enlace "Alertas de la estación" en el pie de la app. Abre un panel:
  - campo para el código y botón "Activar";
  - activado: "Recibes las alertas de la estación", botón "Desactivar";
  - mismos estados previos que el aviso diario (no instalada, sin soporte, permiso bloqueado).
- "Activar": pide permiso si hace falta, se suscribe con `pushManager` (o reutiliza la suscripción existente) y llama a `api/push?action=debug-subscribe` con la suscripción, el código y `test: true`, para que llegue la notificación de prueba.
- Al abrir la app, si debug está activado y el `endpoint` actual es distinto del último enviado, se reenvía con `test: false`. Si es el mismo, no hay llamada. Así Vercel casi nunca recibe nada, y el límite por IP no se toca.

Bajas:

- "Dejar de recibirlo" (aviso diario) borra su fila en `push_subscriptions` y apaga su marca. Solo llama a `unsubscribe()` del navegador si debug está apagado.
- "Desactivar" (debug) lo mismo al revés.

Service worker:

- `public/sw.js`: el `tag` viene en el payload (`{ title, body, url, tag }`); si no viene, `daily-forecast`, para que el cron de la mañana no cambie.

### 6.3 Vercel, `api/push.ts`

Dos acciones nuevas en la misma función (rewrite en `vercel.json`, como `subscribe` y `unsubscribe`):

- `debug-subscribe`: `POST { subscription, code, test }`.
  - Validación de la suscripción: la misma de `server/push-validation.ts`.
  - El código se compara con `DEBUG_CODE` (variable de entorno, nunca en el repo) en tiempo constante.
  - Mismo límite por IP que hoy (10 por hora, `push_requests`), contando también los intentos fallidos: probar códigos a ciegas no sirve.
  - Código incorrecto: 403 sin más detalle.
  - Correcto: upsert en `debug_subscriptions`. Si `test` es `true`, una notificación "Alertas de la estación activadas" a esa suscripción, que prueba el camino completo.
- `debug-unsubscribe`: `POST { endpoint }`. Borra la fila. Mismo límite. No pide código: solo el móvil conoce su `endpoint`, igual que en el aviso diario.

### 6.4 `ingest`

- Cada lectura rechazada se guarda además como evento `reading_rejected` con el motivo (`index` y `reason` ya se calculan).
- También cuando se rechaza el lote entero con 400 (lote vacío, demasiado grande, envoltorio mal formado) **después** de saber qué estación es: un evento `reading_rejected` con el motivo. La estación descarta esas lecturas, así que es justo el caso que hay que saber.
- Una petición sin clave o con clave mala no se registra: no hay estación a la que asignarla.

### 6.5 Función `station-alerts` (Supabase propio)

- Nueva carpeta `backend/supabase/functions/station-alerts/`. Se despliega igual que `ingest` (README, sección de despliegue).
- En este Supabase las funciones se llaman por la URL pública `/functions/v1/<nombre>`, sin comprobación de JWT ni de apikey (repo `infra`, `docs/supabase.md`). Así que la función comprueba el secreto de `pg_cron` ella misma, en tiempo constante. Si no, 401.
- Estaciones vigiladas: `active = true` y `listed = true`. Así las de prueba (`meteo-station-test`, sin datos desde octubre) no avisan.
- La decisión va en un módulo puro (`decide.ts` o similar), sin red ni base de datos, con `deno test`: recibe el estado anterior, la hora, la última lectura y los eventos nuevos, y devuelve el estado nuevo y las notificaciones a enviar.
- Envío con `web-push` (o equivalente, ver 9.1) a cada fila de `debug_subscriptions`. 404 o 410: se borra la fila.
- Variables en Coolify: `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y la clave pública. **Tienen que ser las mismas que en Vercel**: la suscripción del móvil está atada a esa clave pública.
- Todas las funciones ven todo el entorno del contenedor, así que `ingest` también verá las claves VAPID. Aceptado: `ingest` ya tiene la clave secreta de Supabase, que da más poder que estas.

## 7. Alertas

| Alerta | Se activa | Se recupera | Ejemplo |
|---|---|---|---|
| `silent` | más de 10 min sin lecturas | llega una lectura | "Las Rozas: sin datos desde las 9:04" / "Las Rozas: vuelve a mandar datos tras 47 min" |
| `sensor` | eventos `value_dropped` nuevos | 30 min sin ellos | "Las Rozas: valores imposibles del BME280 (temp_c 184.1)" |
| `rain_noise` | eventos `rain_dropped` o `rain` nuevos | 30 min sin ellos | "Las Rozas: ruido en el pluviómetro (35.5 mm en un minuto)" |
| `rejected` | eventos `reading_rejected` nuevos | 30 min sin ellos | "Las Rozas: el servidor rechaza lecturas (wind_avg_ms out of range)" |
| `reboot` | evento `boot` con un motivo distinto de `restart by the firmware`, incluido `power on` (decisión del dueño: también los cortes de luz cortos) | 30 min sin arranques | "Las Rozas: reinicio (task watchdog)" / "Las Rozas: ha vuelto la luz (power on)" / "Las Rozas: 4 reinicios en 12 min (crash)" |

Cuándo se envía cada una:

1. Al pasar de inactiva a activa.
2. Mientras siga activa, un recordatorio cada 6 horas.
3. Al recuperarse, con cuánto duró.

Notificación:

- Título con el nombre de la estación (`display_name`); cuerpo con el detalle. Texto en español, como el resto de la interfaz.
- `tag` `debug-<alerta>`: la siguiente de la misma alerta sustituye a la anterior en el móvil, y nunca a la previsión.
- TTL de 1 hora: una alerta vieja no sirve.
- Al tocarla abre el dashboard de esa estación.

Los tiempos (5, 10, 30 min, 6 h) van como constantes en un sitio, para cambiarlos sin tocar la lógica.

## 8. Secretos y configuración

| Secreto | Dónde | Notas |
|---|---|---|
| `DEBUG_CODE` | Vercel (Production y Preview) | largo y aleatorio; lo genera el dueño |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, clave pública | Coolify, función `station-alerts` | copia de los de Vercel |
| URL de la función y secreto de `pg_cron` | Supabase Vault | a mano en el editor SQL, nunca en una migración |

## 9. Decisiones del builder

### 9.1 A verificar antes de nada

- Si `npm:web-push` funciona en el runtime de funciones de Supabase (Deno). Si no, una librería hecha para Web Crypto, como `jsr:@negrel/webpush`. Es el primer paso del plan: un envío de prueba a una suscripción real.

### 9.2 Lo deja al builder

- Nombres de ficheros, el cursor de eventos, el texto exacto de cada notificación dentro de lo de la sección 7.
- Cómo se ve el panel, siguiendo los estilos de `DailyAlert`.

## 10. Pruebas

- `deno test`: la lógica de decisión (cada alerta: activar, recordar a las 6 h, recuperar; varios reinicios seguidos dan un solo aviso con la cuenta; estación no vigilada) y el evento `reading_rejected` en `ingest`, por lectura y por lote.
- Vitest: validación de `debug-subscribe` y `debug-unsubscribe` (código correcto, incorrecto, límite por IP, `test`), el estado local de cada mundo (incluida una instalación antigua sin marca) y la regla de baja compartida en `src/lib/push.ts`.
- A mano: un móvil con el aviso diario apagado y debug encendido no recibe la previsión.
- A mano, en el móvil del dueño: activar con el código (llega la notificación de prueba), desactivar, y que el aviso de la mañana siga llegando con y sin debug.
