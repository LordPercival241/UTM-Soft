# UTMachine Lab -- Plataforma de Instrumentacion y Ensayos Mecanicos

Sistema de software y firmware para la adquisicion determinista de datos en tiempo real, caracterizacion mecanica de materiales, procesamiento metrologico de curvas esfuerzo-deformacion y gestion de ensayos uniaxiales de traccion en una Maquina Universal de Ensayos (UTM) de bajo costo.

---

## 1. Descripcion General

UTMachine Lab es una plataforma integrada hardware-software disenada para operar como el nucleo de control logico, telemetria y metrologia de una UTM uniaxial orientada a cargas de hasta 100 N, construida con componentes accesibles para entornos academicos.

El sistema se compone de dos subsistemas principales:

1. **Firmware embebido (ESP32 Dual-Core):** Ejecuta en tiempo real la generacion de pulsos para el motor paso a paso, la adquisicion sincrona de la celda de carga mediante el convertidor HX711 y los protocolos de seguridad fisica (finales de carrera, parada de emergencia). Utiliza FreeRTOS con asignacion de tareas por nucleo para garantizar determinismo temporal.

2. **Plataforma web (Next.js / React):** Establece comunicacion serial bidireccional punto a punto mediante la Web Serial API (W3C), recibe y valida los paquetes de telemetria con verificacion CRC-16/CCITT, calcula las magnitudes de ingenieria mecanica (esfuerzo, deformacion, modulo de Young), renderiza la curva esfuerzo-deformacion en tiempo real y genera reportes formales PDF y archivos CSV para exportacion local.

### Principios de Diseno

* **Aislamiento de tareas de tiempo real critico:** El microcontrolador opera de manera autonoma; la plataforma web no interviene en la temporizacion de pulsos ni en la lectura del ADC.
* **Adquisicion determinista en el cliente:** La comunicacion serial directa elimina la latencia de servidores intermedios.
* **Metrologia sin inyeccion sintetica:** Las magnitudes derivadas se calculan exclusivamente a partir de muestras verificadas por CRC. No se inyectan curvas simuladas ni datos interpolados artificialmente.
* **Politica Cero-Cloud para datos de ensayo:** Las series temporales permanecen en la memoria volatil del navegador. Los servicios en la nube se restringen a autenticacion de operadores (Supabase Auth) y asistencia contextual (Google Gemini API).

---

## 2. Pila Tecnologica

| Componente | Tecnologia | Version | Funcion |
| :--- | :--- | :--- | :--- |
| Microcontrolador | ESP32 DevKit V1 | -- | Controlador de motor, ADC y seguridad fisica |
| Controlador Motor | DRV8825 | -- | Driver bipolar con microstepping 1/8 |
| Celda de Carga ADC | HX711 | -- | Conversion analogica-digital a 10 SPS |
| Framework Web | Next.js (App Router) | 15.1.6 | Renderizado en cliente y Route Handlers serverless |
| Libreria de UI | React | 19.0.0 | Componentes declarativos y estado reactivo |
| Tipado Estatico | TypeScript | 5.7.2 | Tipado estricto en tiempo de compilacion |
| Validacion | Zod | 3.24.2 | Validacion formal de entradas y contratos de payload |
| Comunicacion Hardware | Web Serial API | W3C | Acceso bidireccional a puertos serie USB (UART) |
| Graficacion | Recharts | 2.15.1 | Renderizado vectorial SVG de curvas en tiempo real |
| Reportes | jsPDF | 4.2.1 | Compilacion de documentos PDF con rasterizacion de graficos |
| Autenticacion | Supabase Auth | 2.49.4 | Gestion de sesiones JWT y perfiles con RLS |
| Asistencia IA | Google Gemini API | gemini-2.5-flash | Diagnostico metrologico contextualizado |
| Estilos | Tailwind CSS | 3.4.19 | Diseno responsivo con soporte de tema claro y oscuro |

---

## 3. Arquitectura del Sistema

```text
+-----------------------------------------------------------------------------------+
|                        CONTROLADOR LOCAL (ESP32 Dual-Core)                        |
|                                                                                   |
|  NUCLEO 0 (FreeRTOS Task - Prioridad 2):                                         |
|    [ HX711 ADC ] --> [ Lectura sincrona a 10 SPS ]                                |
|    [ Tara de celda de carga (offset calibrable) ]                                 |
|    [ Par atomico: (masa, posicion) con portMUX ]                                  |
|                                                                                   |
|  NUCLEO 1 (loop Arduino):                                                         |
|    [ AccelStepper ] --> [ Pulsos DRV8825 a 800 Hz nominal ]                       |
|    [ Parser de comandos serial no bloqueante ]                                    |
|    [ Maquina de estados: READY -> ARMED -> RUNNING -> STOPPED ]                   |
|    [ Botones fisicos: CERO (GPIO 21) + LIMITE (GPIO 5) ]                          |
|    [ Telemetria SAMPLE con CRC-16/CCITT cada 100 ms ]                             |
|                                                                                   |
|  Buffer UART TX: 512 bytes (evita bloqueo de pulsos del motor)                    |
+--------------------------------------+--------------------------------------------+
                                       | Cable USB (115200 baud, 8N1)
                                       v
+-----------------------------------------------------------------------------------+
|                      NAVEGADOR CLIENTE (Chrome / Edge)                            |
|                                                                                   |
|  +-- Web Serial API (ReadableStreamDefaultReader / TextDecoder)                   |
|  |                                                                                |
|  +-- Hook useSerialTestSession                                                    |
|  |   +-- Demultiplexor de Tramas (CMD / ACK / SAMPLE / EVENT)                     |
|  |   +-- Verificador CRC-16/CCITT (Polinomio 0x1021, Semilla 0xFFFF)             |
|  |   +-- Monitor de Secuencia Monotona (Deteccion de muestras perdidas)           |
|  |   +-- Despachador Transaccional (UUID + Timeout 3000 ms)                       |
|  |                                                                                |
|  +-- Pipeline Metrologico (test-domain.ts)                                        |
|  |   +-- Esfuerzo: sigma = F / A_0  [MPa]                                        |
|  |   +-- Deformacion: epsilon = Delta_L / L_0  [adimensional]                     |
|  |                                                                                |
|  +-- Renderizado en Vivo                                                          |
|  |   +-- Curva sigma vs epsilon (Recharts LineChart SVG)                           |
|  |   +-- KPIs: F_max, sigma_max, epsilon_max, desplazamiento                     |
|  |   +-- Consola serial y contador de paquetes perdidos                            |
|  |                                                                                |
|  +-- Exportacion Local                                                            |
|      +-- PDF formal con grafica (fondo blanco), Modulo de Young, tabla            |
|      +-- CSV con metadatos y sanitizacion contra inyeccion de formulas            |
+--------------------------------------+--------------------------------------------+
                                       | HTTPS / JSON (Route Handlers)
                                       v
+-----------------------------------------------------------------------------------+
|                            SERVICIOS DE SOPORTE                                   |
|                                                                                   |
|  +-- /api/assistant (Serverless)                                                  |
|  |   +-- Validacion JWT Supabase + Prompt metrologico ASTM D638 / ISO 527         |
|  |   +-- Inferencia Google Gemini API                                             |
|  |                                                                                |
|  +-- /api/cron/keep-alive (Serverless, cada 5 dias)                               |
|  |   +-- Transaccion SQL minima para prevencion de pausa Supabase                 |
|  |                                                                                |
|  +-- Supabase Platform (PostgreSQL)                                               |
|      +-- auth.users (Cuentas de operadores)                                       |
|      +-- public.profiles con Row Level Security (RLS)                             |
+-----------------------------------------------------------------------------------+
```

---

## 4. Hardware: Asignacion de Pines del ESP32

| Funcion | GPIO | Componente | Notas |
| :--- | :--- | :--- | :--- |
| Pulso STEP | 18 | DRV8825 STEP | Señal de paso del motor NEMA 17 |
| Direccion DIR | 19 | DRV8825 DIR | Sentido de giro (invertido por firmware) |
| Datos celda | 15 | HX711 DOUT | Linea de datos del ADC |
| Reloj celda | 2 | HX711 SCK | Señal de reloj del ADC |
| Boton Cero | 21 | Pulsador NC | Parada de seguridad / origen mecanico (INPUT_PULLUP) |
| Boton Limite | 5 | Final de carrera | Limite de ensayo / fin de carrera (INPUT_PULLUP) |

### Parametros Mecanicos del Firmware

| Parametro | Valor | Descripcion |
| :--- | :--- | :--- |
| `pasosPorVuelta` | 1600 | Microstepping 1/8 en DRV8825 (200 pasos x 8) |
| `mmPorVuelta` | 1.0 mm | Paso del husillo trapezoidal T8 |
| `pasosPorMM` | 1600 pasos/mm | Resolucion espacial: 0.625 um/paso |
| `velocidadPruebaMMs` | 0.5 mm/s | Velocidad por defecto del ensayo |
| `aceleracion` | 500 pasos/s^2 | Rampa de arranque suave |
| `PENDIENTE` | -220.858444 | Factor de calibracion de la celda de carga (HX711) |
| `offset` | -213236.88 | Valor de tara inicial (actualizable por comando TARE) |

---

## 5. Protocolo de Comunicacion Serial v1

### 5.1. Parametros de Enlace Fisico

* **Velocidad:** 115200 baudios
* **Configuracion:** 8 bits de datos, sin paridad, 1 bit de parada (8N1)
* **Control de flujo:** Ninguno (manejo por tramas transaccionales)
* **Delimitador:** `\r\n` o `\n`

### 5.2. Tipos de Tramas

| Prefijo | Direccion | Funcion |
| :--- | :--- | :--- |
| `CMD` | Web --> ESP32 | Orden de control con identificador UUID |
| `ACK` | ESP32 --> Web | Respuesta obligatoria ante un CMD |
| `SAMPLE` | ESP32 --> Web | Trama periodica de medicion (10 Hz durante ensayo) |
| `EVENT` | ESP32 --> Web | Notificacion asincrona de estado o seguridad |

### 5.3. Maquina de Estados

```text
[disconnected] ---> (connect) ---> [connecting] ---> (HELLO / ACK) ---> [ready]
                                                                          |
                                                                     (ARM_TEST)
                                                                          v
[stopped] <--- (STOP_TEST / EVENT:TEST_FINISHED) <--- [running] <--- [arming]
    |                                                    |
    +-------------------> [fault] <----------------------+
                    (EVENT:FAULT/LIMIT/OVERLOAD)
```

### 5.4. Comandos Soportados

| Tipo de Comando | Descripcion | Ejemplo de Trama |
| :--- | :--- | :--- |
| `HELLO` | Sondeo de presencia del controlador | `CMD,id=<uuid>,type=HELLO` |
| `ARM_TEST` | Armado del ensayo | `CMD,id=<uuid>,type=ARM_TEST,calibration_profile=CAL-DEFAULT` |
| `START_TEST` | Inicio de accionamiento y muestreo | `CMD,id=<uuid>,type=START_TEST` |
| `STOP_TEST` | Detencion del ensayo | `CMD,id=<uuid>,type=STOP_TEST` |
| `TARE` | Tara de la celda de carga a cero | `CMD,id=<uuid>,type=TARE` |
| `JOG` | Desplazamiento manual de mordaza | `CMD,id=<uuid>,type=JOG,distance=10.0` |
| `SET_SPEED` | Configuracion de velocidad de ensayo | `CMD,id=<uuid>,type=SET_SPEED,speed=0.5` |

### 5.5. Telemetria en Tiempo Real (Trama SAMPLE)

Durante la fase activa del ensayo, el microcontrolador transmite paquetes de medicion a 10 Hz:

```text
SAMPLE,seq=42,t_ms=4200,force_raw=8320,displacement_raw=840,force_n=41.500,displacement_mm=2.100,crc=3B9A
```

| Campo | Tipo | Descripcion |
| :--- | :--- | :--- |
| `seq` | Entero | Contador secuencial monotonamente creciente |
| `t_ms` | Entero | Marca temporal en milisegundos desde inicio del ensayo |
| `force_raw` | Entero | Valor crudo del ADC de la celda de carga |
| `displacement_raw` | Entero | Conteo acumulado de pasos del motor |
| `force_n` | Flotante (3 dec.) | Fuerza calibrada en Newtons [N] |
| `displacement_mm` | Flotante (3 dec.) | Desplazamiento lineal en milimetros [mm] |
| `crc` | Hexadecimal (4 car.) | CRC-16/CCITT sobre la cadena anterior a `,crc=` |

### 5.6. Verificacion de Integridad (CRC-16/CCITT)

* **Polinomio generador:** `0x1021`
* **Valor inicial:** `0xFFFF`
* **Regla de descarte:** Si el CRC recibido no coincide con el calculado por el cliente, la muestra se descarta y se incrementa el contador de paquetes perdidos.

### 5.7. Eventos de Seguridad

| Evento | Significado |
| :--- | :--- |
| `EVENT,type=LIMIT_REACHED` | Final de carrera o boton fisico activado |
| `EVENT,type=OVERLOAD` | Fuerza excede el umbral seguro del prototipo |
| `EVENT,type=FAULT` | Error de lectura de celda o datos corruptos recurrentes |
| `EVENT,type=TEST_FINISHED` | Finalizacion normal del ensayo |

---

## 6. Logica de Dominio y Modelo Metrologico

### 6.1. Conversion de Carga a Fuerza

En el firmware, la masa se obtiene del valor crudo del ADC y se convierte a fuerza:

$$M = \frac{\text{ADC} - \text{offset}}{\text{PENDIENTE}} \quad [\text{g}]$$

$$F = \left(\frac{M}{1000}\right) \times 9.80665 \quad [\text{N}]$$

Donde $g_0 = 9.80665\text{ m/s}^2$ es la aceleracion estandar de la gravedad (ISO 80000-3).

### 6.2. Conversion de Desplazamiento

$$d = \frac{\text{pasos}}{\text{pasosPorMM}} = \frac{\text{pasos}}{1600} \quad [\text{mm}]$$

Resolucion espacial: $\Delta d = 0.000625\text{ mm} = 0.625\,\mu\text{m/paso}$.

### 6.3. Esfuerzo de Ingenieria

$$\sigma = \frac{F}{A_0} \quad [\text{MPa}]$$

Donde $F$ es la fuerza en Newtons y $A_0 = w \times t$ es el area transversal inicial de la probeta en $\text{mm}^2$. Dado que $1\text{ N/mm}^2 = 1\text{ MPa}$, la unidad es directa.

### 6.4. Deformacion Unitaria de Ingenieria

$$\varepsilon = \frac{\Delta L}{L_0} \quad [\text{adimensional}]$$

Donde $\Delta L$ es el desplazamiento medido y $L_0$ es la longitud inicial calibrada (gauge length). En la interfaz y reportes se presenta tambien como porcentaje: $\varepsilon\% = \varepsilon \times 100\%$.

### 6.5. Modulo de Elasticidad de Young

$$E = \frac{\Delta \sigma}{\Delta \varepsilon} \quad [\text{MPa}]$$

Calculado en la region lineal elastica de la curva esfuerzo-deformacion, entre el 15% y el 45% de la zona previa al punto de fluencia. Se consigna de forma destacada en el reporte PDF.

### 6.6. Principio de Cero Inyeccion Sintetica

El arreglo de muestras permanece vacio hasta que el microcontrolador fisico transmite tramas verificadas. No existen generadores de datos aleatorios ni algoritmos de interpolacion sintetica en la base de codigo.

---

## 7. Generacion de Reportes

### 7.1. Reporte PDF Formal

El modulo `pdf-report.ts` genera un documento PDF metrologico directamente en el navegador:

1. **Encabezado institucional** con logo, fecha, referencia normativa (ASTM D638 / ISO 527).
2. **Informacion de la probeta:** ID, material, operador, longitud inicial, area transversal, perfil de calibracion.
3. **Propiedades mecanicas calculadas:** Fuerza maxima ($F_{\text{max}}$), esfuerzo maximo ($\sigma_{\text{max}}$), deformacion maxima ($\varepsilon_{\text{max}}$).
4. **Modulo de Young ($E$):** Recuadro destacado con formula, valor numerico y rango de regresion utilizado.
5. **Curva esfuerzo-deformacion:** Grafica renderizada con fondo blanco y colores adaptados para impresion.
6. **Tabla de muestreo representativo:** 8 puntos distribuidos uniformemente a lo largo del ensayo.
7. **Pie de pagina** con referencia institucional y numero de pagina.

### 7.2. Exportacion CSV

Archivo de texto plano con metadatos de cabecera, sanitizacion contra inyeccion de formulas en hojas de calculo, y la matriz completa de telemetria con columnas: `sequence`, `device_time_ms`, `force_raw`, `displacement_raw`, `force_n`, `displacement_mm`, `engineering_stress_mpa`, `engineering_strain`.

---

## 8. Interfaz de Usuario

La plataforma cuenta con soporte de **tema dual** (modo oscuro y modo calido/claro) conmutable desde la interfaz. El panel de control principal incluye:

* **Enlace serial:** Selector de baud rate, indicador de checksum CRC, boton de conexion/desconexion de puerto COM, consola de mensajes del microcontrolador y contador de paquetes perdidos.
* **Calibracion rapida:** Boton de tara de celda de carga (puesta a cero) y mandos de ajuste manual de mordaza (JOG: -10, -1, +1, +10 mm).
* **Parametros de probeta:** Formulario con ID, material, ancho, espesor, longitud inicial, area calculada automaticamente y perfil de calibracion.
* **Visualizacion en tiempo real:** Curva esfuerzo vs deformacion (Recharts SVG), KPIs instantaneos (fuerza, esfuerzo, deformacion, desplazamiento) y metricas extremales.
* **Exportacion:** Botones de descarga CSV y PDF con indicador de progreso.
* **Asistente tecnico (YoungBot):** Chat contextualizado con conocimiento metrologico (ASTM D638, ISO 527, Ley de Hooke).

---

## 9. Seguridad

La arquitectura de seguridad se documenta en detalle en [`docs/SECURITY.md`](docs/SECURITY.md). Los controles principales son:

| Capa | Control |
| :--- | :--- |
| Hardware (ESP32) | Aislamiento fisico de red (Air-Gap): sin WiFi ni Bluetooth. Buffer serial acotado contra desbordamiento. |
| Canal Serial | Verificacion CRC-16/CCITT por paquete. Permissions-Policy: serial=(self). Consentimiento explicito del operador (User Gesture). |
| Cliente Web | React escapa XSS de forma nativa. Validacion numerica estricta con `Number.isFinite()` y Zod. Datos de ensayo en RAM local. |
| Cabeceras HTTP | CSP estricta, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy. |
| Autenticacion | Supabase Auth con JWT. Row Level Security (RLS) en base de datos. Validacion de correo electronico. |
| Asistencia IA | Validacion de JWT en servidor. Claves API exclusivas del entorno servidor. El asistente no puede emitir comandos al hardware. |

---

## 10. Estructura del Proyecto

```text
Software/
+-- docs/
|   +-- SECURITY.md                    Documento de arquitectura de seguridad
|   +-- SETUP.md                       Guia de puesta en marcha
+-- firmware/
|   +-- utm_controller/
|   |   +-- utm_controller.ino         Firmware principal del ESP32 (produccion)
|   +-- CodigoFinal_Prueba04/
|       +-- CodigoFinal_Prueba04.ino   Firmware sincronizado (respaldo/pruebas)
+-- scripts/
|   +-- grafica_utm.py                 Script Python de graficacion local (legacy)
+-- src/
|   +-- app/
|   |   +-- api/
|   |   |   +-- assistant/
|   |   |   |   +-- route.ts           Endpoint del asistente metrologico (POST)
|   |   |   +-- cron/
|   |   |       +-- keep-alive/
|   |   |           +-- route.ts       Endpoint de mantenimiento Supabase (GET)
|   |   +-- auth/
|   |   |   +-- callback/
|   |   |       +-- page.tsx           Manejador del ciclo de retorno de autenticacion
|   |   +-- dashboard/
|   |   |   +-- page.tsx               Panel de control, graficado y exportacion
|   |   +-- globals.css                Directivas Tailwind y definicion de temas
|   |   +-- layout.tsx                 Layout raiz con ThemeProvider
|   |   +-- page.tsx                   Pantalla de acceso y autenticacion
|   +-- components/
|   |   +-- theme-toggle.tsx           Control de alternancia de tema visual
|   |   +-- utm-logo.tsx               Componente del logotipo institucional
|   +-- hooks/
|   |   +-- use-serial-test-session.ts Hook de comunicacion serial, tramas y CRC
|   +-- lib/
|   |   +-- csv.ts                     Generacion y sanitizacion de archivos CSV
|   |   +-- email-validation.ts        Validacion de correos ficticios/desechables
|   |   +-- logo-base64.ts             Logo codificado para insercion en PDF
|   |   +-- pdf-report.ts             Generacion de reporte PDF con grafica y Young
|   |   +-- supabase.ts                Cliente singleton de Supabase
|   |   +-- test-domain.ts             Esquemas Zod, calculos y tipos del dominio
|   |   +-- theme-context.tsx           Contexto React para gestion de tema visual
|   +-- types/
|       +-- web-serial.d.ts            Tipos TypeScript para Web Serial API
+-- supabase/
|   +-- migrations/
|       +-- 202609180001_initial.sql   Script DDL (tablas, RLS, trigger)
+-- public/
|   +-- logo.png                       Logotipo principal
|   +-- logo.svg                       Logotipo vectorial
|   +-- logo-white.png                 Logotipo para fondos oscuros
|   +-- logo-accent.png                Logotipo con acento de color
+-- .env.example                       Plantilla de variables de configuracion
+-- eslint.config.mjs                  Configuracion de analisis estatico
+-- next.config.ts                     Configuracion Next.js y cabeceras HTTP
+-- package.json                       Dependencias y scripts
+-- tailwind.config.ts                 Configuracion de diseno visual
+-- tsconfig.json                      Parametros del compilador TypeScript
+-- vercel.json                        Tareas programadas (Crons)
```

---

## 11. Requisitos de Entorno

### 11.1. Requisitos de Ejecucion

* **Node.js:** Version 20.x LTS o superior
* **npm:** Version 10.x o superior
* **Navegador:** Google Chrome 89+ o Microsoft Edge 89+ (soporte obligatorio de Web Serial API)
* **Arduino IDE:** Version 2.x para compilacion y carga del firmware
* **Placa ESP32:** Paquete de soporte `esp32` de Espressif en el Board Manager

### 11.2. Librerias del Firmware

* `AccelStepper` -- Control de motor paso a paso con aceleracion
* `HX711` -- Interfaz con el convertidor analogico-digital de la celda de carga

### 11.3. Contexto de Seguridad del Navegador

La Web Serial API requiere un Contexto Seguro (Secure Context):
* **Local:** `http://localhost` o `http://127.0.0.1`
* **Produccion:** Conexion HTTPS con certificado valido (proporcionado automaticamente por Vercel)

---

## 12. Instalacion y Despliegue

### 12.1. Variables de Entorno

Crear `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local
```

Variables requeridas:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clave-publica-anonima>
SUPABASE_SERVICE_ROLE_KEY=<clave-secreta-service-role>
CRON_SECRET=<cadena-aleatoria-sha256>
GEMINI_API_KEY=<clave-api-google-ai-studio>
GEMINI_MODEL=gemini-2.5-flash
```

### 12.2. Desarrollo Local

```bash
npm install
npm run dev        # Servidor de desarrollo en puerto 3000
npm run typecheck  # Verificacion de tipos TypeScript
npm run lint       # Analisis estatico ESLint
npm run build      # Compilacion optimizada para produccion
npm run start      # Servidor de produccion
```

### 12.3. Carga del Firmware

1. Abrir `firmware/utm_controller/utm_controller.ino` en Arduino IDE.
2. Seleccionar placa **ESP32 Dev Module** y el puerto COM correspondiente.
3. Verificar la configuracion de microstepping del DRV8825 (jumpers MS1/MS2/MS3 para 1/8).
4. Compilar y cargar al ESP32.

### 12.4. Despliegue en Vercel

1. Vincular el repositorio en Vercel.
2. Configurar **Root Directory** como `Software` si el codigo reside en un subdirectorio.
3. Registrar las variables de entorno en **Settings > Environment Variables**.
4. Ejecutar el despliegue.
5. Verificar que el cron `/api/cron/keep-alive` este registrado (`0 8 */5 * *`).
6. Configurar en Supabase la URL canonica de Vercel y la ruta de callback (`/auth/callback`).

---

## 13. Normativa de Referencia

* **ASTM D638** -- Standard Test Method for Tensile Properties of Plastics
* **ISO 527-1 / ISO 527-2** -- Plastics: Determination of Tensile Properties
* **ISO 80000-3** -- Quantities and Units: Space and Time (aceleracion estandar de gravedad)

---

## 14. Licencia y Creditos

Proyecto academico desarrollado en la Facultad de Ciencias de la Universidad Nacional de Ingenieria (FC-UNI) como parte del curso de Instrumentacion.
