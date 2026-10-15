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

*Pendiente (meteo-no6).* Hoy la clave y el Wi-Fi van en `firmware/include/secrets.h` y el `device_id` en `firmware/platformio.ini`.

## 4. Configurar el Wi-Fi y la clave desde el móvil

*Pendiente (meteo-no6), con WiFiManager.*

## 5. Elegir su versión de firmware

*Pendiente (meteo-gel y meteo-pto).*

## 6. Comprobar que llegan sus lecturas

En Supabase → *Table Editor* → `readings`, filtra por su `device_id`: debe aparecer una lectura por minuto. *En el dashboard, con el selector de estación: pendiente (meteo-1wd).*
