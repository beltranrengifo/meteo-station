# Dar de alta una estación

Pasos para añadir una estación nueva (por ejemplo, la de la casa del pueblo). Cada estación tiene su propia clave; si se pierde o roban una placa, se desactiva solo esa.

**En resumen:** eliges su identificador (1), creas su clave (2), la flasheas una vez por USB (3), le pones Wi-Fi, identificador y clave desde el móvil (4), le asignas versión de firmware (5), compruebas que sube datos (6) y la publicas en el dashboard (7). Desde el paso 4, todo se hace sin cable y desde cualquier sitio.

**Antes de empezar** necesitas:

- La placa montada y alimentada (cableado y fuente: [`estacion-meteo-spec.md`](estacion-meteo-spec.md), sección 4). Para los pasos 3 y 4 basta con el USB.
- En el portátil: PlatformIO, `firmware/include/secrets.h` (copia de `secrets.example.h`, con la dirección de `ingest`) y `backend/.env.local` (paso 5).

## 1. Elegir el identificador

Un `device_id` corto, en minúsculas, con números y guiones: `meteo-station-pueblo`. Es el nombre de la estación en la base de datos y no se cambia después.

## 2. Crear su clave y registrarla en Supabase

Desde la raíz del repo:

```sh
backend/scripts/station-key.sh new meteo-station-pueblo "Casa del pueblo"
```

El script imprime dos cosas:

1. **La clave**, una sola vez. Guárdala en tu gestor de contraseñas: va en la placa y nunca en git ni en un chat.
2. **Una línea SQL** con la huella (SHA-256) de la clave. Pégala en Supabase → *SQL Editor* → *Run*. En la base de datos solo queda la huella, no la clave.

Para una placa que ya tiene clave (la de la mesa, por ejemplo), usa `existing` en vez de `new`: el script te pide la clave sin mostrarla y saca la misma línea SQL.

Para desactivar una estación: `update public.devices set active = false where device_id = 'meteo-station-pueblo';`

## 3. Flashear la placa por USB (una vez)

Todas las estaciones llevan el mismo firmware: el Wi-Fi, el `device_id` y la clave no van compilados, cada placa los guarda en su memoria (NVS). `firmware/include/secrets.h` solo tiene la dirección de la función `ingest` (copia `secrets.example.h`).

Desde `firmware/`, con la placa por USB:

```sh
pio run -e station -t upload
```

Este primer flasheo por USB también pone la tabla de particiones con sitio para las actualizaciones por internet. A partir de aquí, las versiones nuevas llegan solas (paso 5).

Abre el monitor serie (`pio device monitor`): la placa arranca sin configurar y dice `[setup] opening the setup portal (station not set up): join the WiFi network "meteo-setup-XXXX"`.

## 4. Configurar el Wi-Fi, el identificador y la clave desde el móvil o el portátil

Una placa sin configurar abre su propia red Wi-Fi, `meteo-setup-XXXX` (las cuatro letras cambian de una placa a otra). El monitor serie dice cuál es. Sirve cualquier dispositivo con Wi-Fi y navegador; con el portátil puedes pegar la clave en vez de teclearla.

1. Conéctate a `meteo-setup-XXXX`. Se abre sola una página; si no, entra en `http://192.168.4.1`.
2. *Configure WiFi*: elige el Wi-Fi de la casa y escribe su contraseña.
3. Rellena *Device id* (el del paso 1) y *Device key* (la clave del paso 2).
4. *Save*. La placa se conecta y se reinicia con la configuración nueva. En el monitor serie verás `[wifi] connected` y luego `(HTTP 200)`.

Si algo falla, el monitor serie lo dice:

- `reason 15 (4-way handshake timeout, wrong password?)`: la contraseña del Wi-Fi está mal. Vuelve a abrir la red (abajo) y escríbela otra vez.
- `HTTP 401`: el identificador o la clave no coinciden con los de Supabase. Vuelve a abrir la red y pega la clave del paso 2.

La red `meteo-setup-XXXX` también se abre:

- **A mano**: mantén pulsado el botón **BOOT** de la placa 3 segundos con la placa ya encendida (no al enchufarla, que entonces arranca en modo flasheo), o escribe `w` en el monitor serie. En la página, deja *Device key* vacío para conservar la clave guardada.
- **Sola**, si la placa lleva 10 minutos sin conseguir conectarse desde que arrancó (por ejemplo, porque ha cambiado de casa o de router). Si nadie la configura en 10 minutos, se cierra y vuelve a probar el Wi-Fi guardado. Un corte del router cuando ya estaba conectada no la abre.

La red `meteo-setup-XXXX` no tiene contraseña: mientras está abierta, cualquiera cerca podría cambiar la configuración. Por eso solo se abre en esos casos y se cierra sola.

## 5. Elegir su versión de firmware

Cada estación tiene una versión objetivo (`devices.target_fw`). Si la que lleva es otra, en su siguiente subida la función `ingest` le contesta con un enlace temporal (10 min) para descargar la nueva y su huella SHA-256. Vacía: la estación se queda con la que tiene.

Una estación recién flasheada lleva el `FW_VERSION` de tu copia del repo. Para que siga a las demás, ponle de objetivo la última versión publicada (`pnpm firmware status` dice cuál llevan las otras): `pnpm firmware target meteo-station-pueblo <versión>`.

**Una vez**, crea `backend/.env.local` (git lo ignora) con la URL de Supabase, su clave `service_role` y la cadena de conexión a Postgres (las dos últimas, en la configuración de tu Supabase autoalojado; la cadena la usan `pnpm db:push` y `pnpm gen:types`):

```sh
SUPABASE_URL=https://<tu-supabase>
SUPABASE_SECRET_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres:<contraseña>@<tu-supabase>:5432/postgres?sslmode=require
```

Para publicar una versión nueva, sube `FW_VERSION` en `firmware/include/config.h` (por ejemplo de `0.3.0` a `0.3.1`) y, desde la raíz del repo:

```sh
pnpm firmware publish bench "qué cambia"     # o station
pnpm firmware target meteo-station-bench 0.3.1
pnpm firmware status
```

- `publish` compila ese entorno con PlatformIO, comprueba que es un firmware de ESP32, que cabe y que lleva dentro esa versión, y lo sube al bucket privado `firmware`. Una versión publicada no se sobrescribe: para corregirla, sube otra.
- `target` le dice a una estación qué versión debe llevar (primero la de la mesa). `none` la deja con la que tenga.
- `status` muestra, por estación, la versión con la que llegó su última lectura y la que tiene como objetivo.

Cada versión publicada es una sola compilación: si publicas `bench`, la estación de fuera también tendría la línea `[live]` cada 10 s, y si publicas `station`, la de la mesa la pierde.

En su siguiente subida (como mucho, un minuto) la placa descarga la versión, comprueba su tamaño y su SHA-256 y se reinicia con ella. Mientras descarga deja de medir unos segundos. En el monitor serie (tamaños y tiempos cambian):

```
[ota] installing 0.3.1 (1093353 bytes), readings pause meanwhile
[ota] 0.3.1 installed in 12 s, restarting
meteo station fw 0.3.1
[ota] first boot of 0.3.1: kept after its first upload, else back to the previous firmware in 10 min
[ota] 0.3.1 delivered its first upload: kept
```

**Si la versión nueva falla**, la placa vuelve sola a la anterior: si no consigue subir una lectura en 10 minutos, o si se reinicia antes de lograrlo (un cuelgue, el vigilante o un corte de luz). Esa versión queda apuntada como fallida y la placa no la vuelve a instalar aunque se la sigan ofreciendo (`[ota] 0.3.1 offered, skipped: it rolled back before`). Para reintentarlo, corrige y publica otra versión.

Si la descarga falla (red, enlace caducado, SHA-256 distinta), no se instala nada y la placa lo vuelve a intentar a la hora.

En Supabase, la columna `fw` de `readings` dice con qué versión se tomó cada lectura.

## 6. Comprobar que llegan sus lecturas y ver qué le pasa

Desde la raíz del repo, sin cable y desde cualquier sitio:

```sh
pnpm station logs meteo-station-bench       # últimas 24 h
pnpm station logs meteo-station-bench 2     # últimas 2 h
```

Muestra su última lectura (versión, tiempo encendida, señal Wi-Fi, memoria libre, cortes de Wi-Fi desde que arrancó), cuántas lecturas llegaron (debería ser una por minuto) y sus eventos en hora de Madrid:

```
  16 Oct, 11:02:41  boot    fw 0.4.0, reset: power on
  16 Oct, 11:02:47  wifi    connected, RSSI -64 dBm
  16 Oct, 14:20:05  wifi    lost, reason 200 (beacon timeout)
  16 Oct, 14:21:12  wifi    back after 67 s, RSSI -66 dBm
```

Los eventos (arranques y su motivo, pasos de la OTA, Wi-Fi caído y recuperado, fallos de subida, portal de configuración) viajan con la siguiente subida, así que llegan con hasta un minuto de retraso, o cuando vuelve el Wi-Fi. Los que no llegaron a subirse antes de un reinicio se pierden; el evento `boot` dice por qué se reinició (`power on` es un corte de luz, `task watchdog` un cuelgue, `brownout` una fuente que no da suficiente).

## 7. Publicarla en el dashboard

Una estación nueva no sale en el dashboard hasta que la marcas. Así puedes montarla y probarla antes de que nadie la vea.

1. **Su nombre público y la marca**, en Supabase → *SQL Editor*. El nombre es lo que se ve en el selector y en el saludo (se usa lo que va tras la última coma: «Buenos días, Las Rozas»). Pon solo el pueblo, nunca la dirección:

   ```sql
   update public.devices set display_name = 'Provincia, Pueblo', listed = true
   where device_id = 'meteo-station-pueblo';
   ```

2. **Sus coordenadas, para el cielo y el UV**, en Vercel → *Settings → Environment Variables* → `STATION_COORDINATES` (Production y Preview). Es un JSON con todas las estaciones; añade la nueva y guarda:

   ```json
   {"meteo-station-bench": [40.0, -3.0], "meteo-station-pueblo": [41.0, -4.0]}
   ```

   Las coordenadas solo viven ahí: ni en git ni en Supabase, y la API nunca las devuelve. Después redespliega (*Deployments* → el último → *Redeploy*) para que la API las lea. Sin coordenadas, la estación sale igual, pero sin cielo.

3. En menos de un minuto aparece en el selector *Estación* de la barra superior. Con una sola estación publicada no hay selector. El primer día con datos es el de su primera lectura; el dashboard no ofrece fechas anteriores.

Una vez tiene `display_name`, puedes ponerla y quitarla del dashboard sin SQL: `pnpm station show <device_id>` y `pnpm station hide <device_id>`.

La estación con la que abre el dashboard es `STATION_DEVICE_ID` (Vercel). Cada estación tiene su propio enlace: `?station=<device_id>`.

## Retirar una estación

- **Quitarla del dashboard** sin borrar nada: `pnpm station hide <device_id>`.
- **Dejar de aceptar sus datos** (placa perdida o robada): `update public.devices set active = false where device_id = '...';`. Su clave deja de valer al momento; sus lecturas se quedan.
- Quita también su entrada de `STATION_COORDINATES` en Vercel.

## Estación de pruebas

`meteo-station-test` («Pueblo (pruebas)») no es una placa: sirve para probar el dashboard con varias estaciones. Su clave va en `backend/.env.local` como `FAKE_STATION_KEY`.

```sh
pnpm station fake meteo-station-test
```

Al arrancar la publica en el dashboard, manda las últimas 24 h de datos inventados y luego una lectura por minuto. Al pararlo con Ctrl+C la quita del dashboard. Si cierras la terminal sin Ctrl+C, quítala con `pnpm station hide meteo-station-test`.
