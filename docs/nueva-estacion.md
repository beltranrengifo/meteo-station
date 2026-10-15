# Dar de alta una estación

Pasos para añadir una estación nueva (por ejemplo, la de la casa del pueblo). Cada estación tiene su propia clave; si se pierde o roban una placa, se desactiva solo esa.

Esta guía crece con el trabajo multi-estación: los pasos marcados como *pendiente* llegan con su bead.

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

Para publicar una versión, sube `FW_VERSION` en `firmware/include/config.h`, compila y, desde la raíz del repo:

```sh
pnpm publish:firmware firmware/.pio/build/station/firmware.bin "qué cambia"
```

El script comprueba que el archivo es un firmware de ESP32, que cabe en la partición y que lleva dentro esa versión; lo sube al bucket privado `firmware` y lo apunta en `firmware_releases`. Necesita `frontend/.env.local` (`vercel env pull`). Una versión publicada no se sobrescribe: para corregirla, sube otra.

Después, estación por estación (primero la de la mesa), en Supabase → *SQL Editor*:

```sql
update public.devices set target_fw = '0.2.0' where device_id = 'meteo-station-bench';
```

*Que la placa descargue e instale la actualización: pendiente (meteo-pto).*

## 6. Comprobar que llegan sus lecturas

En Supabase → *Table Editor* → `readings`, filtra por su `device_id`: debe aparecer una lectura por minuto. *En el dashboard, con el selector de estación: pendiente (meteo-1wd).*
