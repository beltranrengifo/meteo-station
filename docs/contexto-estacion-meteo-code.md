# Contexto para Claude Code: estación meteorológica

Traspaso desde la sesión de chat del 8 de octubre de 2026. El documento completo de diseño está en `docs/estacion-meteo-spec.md` (objetivo, compra, hardware, fases, SQL de Supabase, Edge Function, front-end). **Este fichero manda sobre la spec donde haya diferencias**: recoge lo validado en el banco de pruebas.

Las reglas de trabajo para agentes están en `AGENTS.md`.

## Repositorio (monorepo)

```
meteo-station/
├── firmware/   # proyecto PlatformIO (platformio.ini en la raíz de esta carpeta)
├── backend/    # migraciones SQL y Edge Function de Supabase
├── frontend/   # web con gráficas (React/TS)
├── docs/       # spec, montaje-estacion.svg, este contexto
└── README.md
```

`firmware/platformio.ini` actual: board `esp32dev` (Espressif ESP32 Dev Module), framework Arduino, `monitor_speed = 115200`, `lib_deps` con `adafruit/Adafruit BME280 Library` y `adafruit/Adafruit Unified Sensor`.

## Estado: banco de pruebas COMPLETADO

Los cuatro sensores leen correctamente en la mesa, por separado y juntos (BME280 + anemómetro probados a la vez).

| Sensor | Estado | Resultado |
|---|---|---|
| BME280 | ✅ | 0x77. Lectura de prueba: 22,3 °C, 59,1 %, 941,2 hPa (coherente con ~700 m de altitud) |
| Anemómetro | ✅ | Cuenta pulsos al girar; se para al parar |
| Veleta | ✅ | 8 direcciones distinguibles (ver tabla) |
| Pluviómetro | ✅ | Cuenta vuelcos; **rebota** (un vuelco suma 6–9 pulsos sin antirrebote) |

**Siguiente fase:** firmware completo + backend en Supabase. El front-end después.

## Hardware real

- **ESP32** clásico, 38 pines, USB-C, chip **CP2102**. `LED_BUILTIN` no está definido: el LED azul es el **GPIO 2**.
- **Placa de expansión DT-Y6549** con bornas de tornillo verdes. Solo hay **una borna 3V3**.
- **Kit de viento y lluvia** BricoGeek SEN-0051 (equivalente a SparkFun SEN-15901).
- **BME280** Adafruit con STEMMA QT, ya instalado en la funda TFA del mástil.
- Resistencias: solo hay de **10 kΩ** (pack de 50).
- **2 WAGO 221-415** en uso: uno de 3V3 y otro de GND (se compraron 5).

## Pines (validados)

| Función | GPIO | Montaje |
|---|---|---|
| I²C SDA (BME280) | 21 | `Wire.begin(21, 22)` |
| I²C SCL (BME280) | 22 | |
| Anemómetro | 32 | Pull-up 10 kΩ a 3V3, `INPUT_PULLUP`, interrupción `FALLING` |
| Pluviómetro | 33 | Pull-up 10 kΩ a 3V3, `INPUT_PULLUP`, interrupción `FALLING` |
| Veleta | 34 | Hilo a 3V3, hilo a GPIO 34, **10 kΩ de GPIO 34 a GND** (divisor). ADC1 |
| LED estado | 2 | Opcional |

Nota: en el montaje final se podrá **reasignar pines** para que el cableado sea cómodo (p. ej. GPIO 17 está libre y accesible). Reglas: contadores en pines con interrupción; veleta solo en ADC1 (32–39); nunca 6–11 (flash). Si se cambia, cambiar código y documentación a la vez. **Por ahora no se cambia nada.**

## Cableado actual

**WAGO rojo (3,3 V), 5 de 5 huecos:** latiguillo desde la borna 3V3 · rojo del BME280 · pull-up del anemómetro · hilo 1 de la veleta · pull-up del pluviómetro.

**WAGO negro (GND):** latiguillo desde una borna GND · negro del BME280 · hilo 3 del anemómetro · resistencia del divisor de la veleta · hilo 3 del pluviómetro. Todas las bornas GND de la placa son el mismo punto.

**RJ11 de viento** (adaptador QUARKZMAN de tornillo; el anemómetro se enchufa a la veleta y sale un solo cable):
- Hilos **1 y 4 → veleta** (1 a 3V3, 4 a GPIO 34)
- Hilos **2 y 3 → anemómetro** (2 a GPIO 32, 3 a GND)

**RJ11 de lluvia** (otro adaptador):
- Hilos **2 y 3 → pluviómetro** (2 a GPIO 33, 3 a GND). Sin polaridad.

**Código de colores:** rojo = 3,3 V · negro = GND · amarillo = señal anemómetro · azul = señal veleta. En la mesa el pluviómetro también usa un latiguillo azul por falta de colores; en el montaje final darle **otro color** (p. ej. verde).

Lecciones del banco de pruebas:
- No meter más de dos cosas en una borna de tornillo: para eso están los WAGO.
- El WAGO 221 necesita **10–11 mm** de cobre pelado; si muerde el plástico no hay contacto (le pasó a la veleta).
- Un hilo fino junto a una pata de resistencia en la misma borna baila: doblar la punta para darle grosor (en el montaje final, punteras).

## Constantes de calibración

| Constante | Valor | Origen |
|---|---|---|
| Anemómetro | 1 pulso/s = 0,667 m/s = 2,4 km/h | Hoja de datos SparkFun |
| Pluviómetro | 0,2794 mm por vuelco | Hoja de datos SparkFun |
| BME280 | dirección **0x77** | Escáner I²C (confirmado) |

El anemómetro no necesita calibración con multímetro: solo cuenta pulsos.

## Veleta: solo 8 direcciones

SparkFun indica que, aunque la veleta tiene 16 posiciones, solo **8 se distinguen de forma fiable**. Confirmado en la mesa: ESE/SE/SSE dieron 3236/3255/3244 y NNE/NE/ENE ~2120/2096/2020, solapados. **Decisión: usar 8.**

Valores medidos (ADC de 12 bits, divisor de 10 kΩ, 3,3 V). La "N" es la marca grabada en la base de la veleta; al instalarla fuera hay que **orientar esa marca al Norte real** con una brújula.

```cpp
struct Position { int adc; float degrees; const char* name; };
const Position VANE[8] = {
  {  800,   0.0f, "N"},
  { 2096,  45.0f, "NE"},
  { 3765,  90.0f, "E"},
  { 3245, 135.0f, "SE"},
  { 2795, 180.0f, "S"},
  { 1420, 225.0f, "SW"},
  {  170, 270.0f, "W"},
  {  400, 315.0f, "NW"},
};
```

Lectura: **media de 20 lecturas** del ADC y asignación a la posición con valor **más cercano**. La separación mínima entre posiciones es de 230 (W–NW). Probado y funcionando. La dirección del minuto se calcula con **media circular** (atan2 de senos y cosenos), no con media aritmética de grados.

## Antirrebote

- Rebote típico de un reed switch: **0,5–1 ms** (dato de la industria del reed, buscado y confirmado en la sesión).
- **Anemómetro: 5 ms.** Justificación: a 150 km/h hay ~62 pulsos/s, uno cada ~16 ms; 5 ms filtra el rebote sin comerse pulsos reales.
- **Pluviómetro: 10 ms acordado.** ⚠️ Validar en la mesa: al bascular a mano despacio, un vuelco produjo 6–9 pulsos, y el imán puede tardar más de 10 ms en cruzar. El pluviómetro admite un filtro mucho más largo sin riesgo (lluvia torrencial de 100 mm/h ≈ un vuelco cada 10 s), y la spec original proponía ~200 ms. Probar con 10 ms; si un vuelco sigue contando más de uno, subir hacia 100–200 ms.
- Implementarlo en la ISR comparando `millis()` (o `micros()`) con el último pulso aceptado.

## Firmware a construir (siguiente sesión)

Base en la sección 6.2 de la spec. Resumen y decisiones:
- Contadores en ISR `IRAM_ATTR`, variables `volatile`, lectura en sección crítica.
- Viento medio = pulsos del minuto / 60 × 0,667 m/s. Racha = máximo de medias de 3 s dentro del minuto.
- Lluvia: enviar **mm del minuto** (vuelcos × 0,2794), **nunca acumulados**.
- BME280 en modo forzado, una lectura por minuto.
- NTP, timestamps UTC; no enviar sin hora válida.
- Buffer en RAM de lecturas pendientes y reenvío en lote al volver el WiFi.
- HTTPS POST en lote a una **Edge Function** con cabecera `x-device-key`. **Nunca** la service role key en el firmware.
- Sin deep sleep (va enchufado y cuenta pulsos).
- Watchdog, reconexión WiFi, reinicio si lleva mucho sin enviar.
- `secrets.h` fuera de git (SSID, contraseña, URL, clave del dispositivo). Calibración en `config.h`.
- **OTA** incluido desde el primer flasheo, para actualizar por WiFi sin bajar la caja. Probar antes cualquier firmware en la mesa; valorar rollback.
- Payload por lectura: `device_id, ts, temp_c, humidity_pct, pressure_hpa, wind_avg_ms, wind_gust_ms, wind_dir_deg, rain_mm, rssi, uptime_s, fw`.

## Backend (Supabase)

SQL, Edge Function y esquema de la tabla en la sección 6.3 de la spec. Clave única `(device_id, ts)` para que los reenvíos sean idempotentes. **Pendiente decidir:** lectura pública o restringida. Índice UV desde Open-Meteo, no desde sensor.

## Montaje físico definitivo (decidido, sin hacer)

- **Caja IP65 de plástico** anclada al mástil **justo debajo de la funda TFA**. Tramo del BME280 ≈ 30 cm: un solo cable Qwiic, sin problema de distancia I²C.
- La caja **no se abraza directamente** (se agrietaría) y sus orejetas están en la junta tapa-cuerpo, inservibles. Solución: **pletina metálica atornillada a la cara trasera** desde dentro, tornillos sellados con silicona neutra, y la pletina al mástil con **abrazaderas metálicas**. Nada de bridas para la caja.
- Adaptadores RJ11 **dentro** de la caja; los cables RJ11 entran por un cono o prensaestopas sellado. Latiguillos internos de ~10 cm.
- WAGO de GND colocado **cerca de los adaptadores RJ11**. WAGO y placa fijados a la base (doble cara o separadores). Sobrantes recogidos con bridas.
- **Todos los cables con puntera crimpada** en bornas y WAGO.
- Cableado definitivo: se puede montar y probar en la mesa ya con el material final para luego solo trasladarlo a la caja.
- Veleta **nivelada** y con su N al Norte real.
- Alimentación: enchufe exterior → schuko → Mean Well LPV-20-5 → conector IP68 → cable 2 × 0,75 mm² → borna 5V/GND de la placa. Bucles de goteo.
- Lista de compra del montaje final: `docs/compra-montaje-final.html`.

## Futuro (no ahora)

- Cámara: módulo **independiente** (recomendado ESP32-S3 con OV2640), compartiendo solo los 5 V. Fotos periódicas a Supabase Storage; vídeo en directo no pasa por Supabase.

## Pendiente de documentación

Actualizar `docs/estacion-meteo-spec.md` con: 0x77 confirmada, mapeo de hilos RJ11, WAGO de 3V3 y GND, código de colores, veleta a 8 direcciones con su tabla, antirrebotes, montaje con pletina y punteras. Rellenar los enlaces de Amazon pendientes.
