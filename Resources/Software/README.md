# UTM Lab — Maquina Universal de Ensayos de Fuerza de Bajo Costo

> Sistema de instrumentacion, adquisicion de datos en tiempo real y caracterizacion mecanica de materiales (hasta 100 N) desarrollado con microcontrolador Arduino / ESP32, celda de carga de 10 kg, accionamiento NEMA 17 y plataforma web en Next.js 15 / Supabase / Google Gemini / Vercel.

---

## 1. Introduccion y Contexto

La **ciencia de materiales** estudia las propiedades mecanicas, fisicas y quimicas de los materiales para comprender su comportamiento bajo cargas externas y fundamentar aplicaciones tecnologicas. Entre las propiedades de mayor interes se encuentran la resistencia a la traccion, la deformacion elastica/plastica y el modulo de Young.

Las **maquinas universales de ensayos (UTM)** industriales convencionales son equipos voluminosos, de costo elevado (miles de dolares) y con caracteristicas excesivas para laboratorios de docencia o caracterizacion de probetas polimericas a pequena escala.

Ante esta necesidad, el proyecto propone el **diseno, construccion y validacion de una maquina universal de ensayos de fuerza de bajo costo y dimensiones reducidas**, integrando componentes comerciales accesibles, acondicionamiento de senales de precision, microcontrolador local y una aplicacion web moderna para adquisicion serial directa en el navegador, graficado en vivo y exportacion local trazable sin costos de almacenamiento cloud.

---

## 2. Objetivos

### Objetivo Principal
**Disenar, construir y validar un prototipo de maquina universal de ensayos de fuerza de bajo costo**, capaz de aplicar una fuerza controlada (con limite de seguridad de 100 N) y registrar la respuesta mecanica de probetas polimericas.

### Objetivos Especificos
* **Estructura mecanica:** Disenar y fabricar la estructura fisica, guias lineales y mordazas de sujecion para probetas.
* **Sistema de accionamiento:** Implementar el control de desplazamiento mediante un motor paso a paso NEMA 17 y su etapa de potencia.
* **Instrumentacion y acondicionamiento:** Integrar y calibrar una celda de carga de 10 kg (~100 N) con conversor ADC de alta resolucion (HX711 o similar).
* **Plataforma de software:** Desarrollar una interfaz web (UTM Lab) con Web Serial API, visualizacion en tiempo real y asistencia inteligente mediante Google Gemini.
* **Curvas esfuerzo-deformacion:** Calcular en tiempo real el esfuerzo (sigma) y la deformacion (epsilon) a partir de los datos geometricos de la probeta y las lecturas calibradas.
* **Evaluacion experimental:** Evaluar la resolucion, repetibilidad y respuesta del prototipo con diferentes muestras polimericas comerciales e impresas en 3D.

---

## 3. Integrantes y Responsabilidades

| Integrante | Rol / Especialidad | Responsabilidades Principales |
| :--- | :--- | :--- |
| **Dante Aliguere Olivas Huaman** | **Software y Plataforma Web** | Arquitectura de software en Next.js, adquisicion serial v1 con Web Serial API, validacion CRC-16, autenticacion y perfiles en Supabase, agente de IA con Google Gemini, exportacion local PDF/CSV, cron keep-alive y despliegue en Vercel. |
| **Jhosep A. Tineo Santa Cruz** | **Instrumentacion y Sensores** | Acondicionamiento de senal para celda de carga de 10 kg, etapa de amplificacion/digitalizacion, integracion con Arduino/ESP32, calibracion metrologica y evaluacion de estabilidad. |
| **Juan Jesus Aguero Ventura** | **Estructura Mecanica** | Modelado CAD 3D de la maquina, diseno y fabricacion de pinzas de sujecion (mordazas), calculo de tolerancias, soporte de guias y rigidez estructural. |
| **Andre Edmundo Sanchez Marquina** | **Potencia y Accionamiento** | Seleccion del motor paso a paso NEMA 17, driver de potencia, dimensionamiento electrico, fuente de alimentacion y control de velocidad/torque del actuador. |

---

## 4. Arquitectura del Sistema

El sistema opera bajo un modelo desacoplado: **el firmware local garantiza la seguridad fisica y la temporizacion critica**, mientras que **el navegador web visualiza, procesa y genera los reportes**.

```text
+------------------------------------------------------------------------------------+
|                             CAPA DE CONTROL LOCAL                                  |
|                                                                                    |
|   [ Celda de Carga 10 kg ] --> [ ADC / Acondicionamiento ]                         |
|                                         |                                          |
|   [ Finales de carrera / Paro ] ------> [ Microcontrolador ]                       |
|                                         | (Arduino Uno/Nano o ESP32 DevKit)        |
|                                         |                                          |
|   [ Driver de potencia ] <--------------+                                          |
|            |                                                                       |
|   [ Motor NEMA 17 + Tornillo ] --> [ Desplazamiento mecanico ]                     |
+-----------------------------------------+------------------------------------------+
                                          | Cable USB (Protocolo Serial v1, CRC-16)
                                          v
+------------------------------------------------------------------------------------+
|                          CAPA DE SOFTWARE (UTM LAB)                                |
|                                                                                    |
|   Navegador del Operador (Chrome / Edge)                                           |
|   +-- Web Serial API (Lectura bidireccional local, deteccion de saltos de seq)     |
|   +-- Motor de calculo en vivo (Esfuerzo en MPa, Deformacion de ingenieria)        |
|   +-- Interfaz grafica React 19 / Recharts (Curva sin datos sinteticos)            |
|   +-- Asistente de Operacion flotante (Chat contextual con Google Gemini)          |
|                                                                                    |
|   Servicios en la Nube                                                             |
|   +-- Vercel (Alojamiento Edge/Serverless, HTTPS, Cron keep-alive)                 |
|   +-- Supabase Auth (Acceso seguro por correo y contrasena)                        |
|   +-- Google Gemini API (Respuestas contextualizadas al operador)                  |
|                                                                                    |
|   * Cero Consumo de Almacenamiento Cloud: Todos los datos de ensayos (curvas,      |
|     muestras completas y reportes PDF/CSV) se generan en el navegador del          |
|     operador y se descargan directamente a su equipo local.                        |
+------------------------------------------------------------------------------------+
```

---

## 5. Plataforma de Software (UTM Lab)

La aplicacion web ha sido construida con los siguientes componentes y estandares:

* **Framework:** [Next.js 15](https://nextjs.org/) con React 19 y TypeScript en App Router.
* **Adquisicion Serial:** [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) en el cliente. Permite seleccionar puertos COM directamente desde el dialogo nativo del navegador, sin intermediarios en la nube. Compatible con cualquier dispositivo USB serial (Arduino Uno/Nano, ESP32 DevKit, etc.) sin filtros de fabricante.
* **Autenticacion y Perfiles:** [Supabase Auth](https://supabase.com/) con **correo y contrasena (Email/Password)** y tabla `profiles` protegida con RLS (*Row Level Security*). Supabase se utiliza unicamente para el control de acceso de operadores.
* **Visualizacion en Vivo:** [Recharts](https://recharts.org/) configurado para trazado en tiempo real sin datos de demostracion o sinteticos.
* **Exportacion Local (Cero Consumo Cloud):**
  - **Reporte PDF Formal:** Generacion directa en el navegador con `jsPDF`, capturando la curva en alta resolucion, metadatos de la probeta, resultados calculados (fuerza maxima, esfuerzo maximo, deformacion maxima) y tabla de puntos de muestreo representativos.
  - **Datos Crudos en CSV:** Descarga directa de la matriz completa de mediciones con metadatos versionados para analisis en Excel, Python o MATLAB.
* **Asistente de IA (Google Gemini):** Ruta API Serverless en `/api/assistant` integrada con Google Generative AI (`gemini-2.5-flash`). Asiste al operador en la interpretacion de mensajes del controlador, normas de ensayo y diagnostico de alertas. No posee permisos de control fisico directo sobre la maquina.
* **Cron Keep-Alive:** Endpoint `GET /api/cron/keep-alive` programado via Vercel Cron cada 5 dias para evitar la pausa automatica de Supabase en el plan gratuito (7 dias de inactividad). Configurado en `vercel.json`.

### 5.1. Estructura de Archivos del Software

```text
src/
  app/
    api/
      assistant/route.ts          Ruta API del asistente Gemini (POST)
      cron/keep-alive/route.ts    Cron keep-alive para Supabase (GET)
    auth/callback/page.tsx        Callback de autenticacion OAuth
    dashboard/page.tsx            Panel principal de operacion
    layout.tsx                    Layout raiz con fuentes e idioma
    page.tsx                      Pagina de inicio y autenticacion
    globals.css                   Estilos globales con Tailwind CSS
  hooks/
    use-serial-test-session.ts    Hook de conexion, lectura y escritura serial
  lib/
    csv.ts                        Generacion de archivos CSV
    pdf-report.ts                 Generacion de reportes PDF con jsPDF
    supabase.ts                   Cliente de Supabase (singleton)
    test-domain.ts                Esquemas Zod, tipos y calculos de ingenieria
  types/
    web-serial.d.ts               Declaraciones de tipos para Web Serial API
firmware/
  utm_controller/
    utm_controller.ino            Firmware completo para Arduino / ESP32
supabase/
  migrations/
    202609180001_initial.sql       Migracion inicial (tabla profiles, trigger, RLS)
vercel.json                       Configuracion de Vercel Cron (keep-alive)
```

---

## 6. Protocolo Serial v1 (Hardware - Software)

La comunicacion entre el microcontrolador y la aplicacion web se realiza a traves de tramas de texto estructuradas con confirmacion y suma de verificacion.

### 6.1. Comandos de Control (Handshake)

Todas las ordenes enviadas por la interfaz web llevan un identificador UUID unico. El firmware debe responder con un mensaje `ACK`:

```text
// 1. Handshake inicial
CMD,id=<uuid>,type=HELLO
ACK,id=<uuid>,status=OK

// 2. Armado de ensayo (con perfil de calibracion validado)
CMD,id=<uuid>,type=ARM_TEST,calibration_profile=<perfil_id>
ACK,id=<uuid>,status=OK

// 3. Inicio del desplazamiento y muestreo
CMD,id=<uuid>,type=START_TEST
ACK,id=<uuid>,status=OK

// 4. Parada de ensayo
CMD,id=<uuid>,type=STOP_TEST
ACK,id=<uuid>,status=OK
```

Si el firmware detecta una condicion insegura (paro presionado, sobrecarga, calibracion ausente), rechaza la orden de forma segura:
```text
ACK,id=<uuid>,status=ERROR,reason=Paro_de_emergencia_activado
```

El timeout de confirmacion en la aplicacion web es de 3 segundos. Si el microcontrolador no responde con `ACK` dentro de ese plazo, la operacion se declara fallida.

### 6.2. Tramas de Muestras (SAMPLE)

Cada punto de ensayo se transmite en una sola linea terminada en `\n`:

```text
SAMPLE,seq=42,t_ms=1200,force_raw=4567,displacement_raw=123,force_n=101.22,displacement_mm=0.42,crc=ABCD
```

* `seq`: Secuencia incremental entera (permite detectar perdidas de muestras si hay saltos).
* `t_ms`: Tiempo de ejecucion en milisegundos generado por el timer del microcontrolador.
* `force_raw` / `displacement_raw`: Lecturas crudas del ADC/contador de pasos.
* `force_n`: Fuerza fisica calculada y calibrada en Newtons (N).
* `displacement_mm`: Desplazamiento medido en milimetros (mm).
* `crc`: Checksum **CRC-16/CCITT** en formato hexadecimal de 4 digitos, calculado sobre todo el texto previo a `,crc=`.

> [!IMPORTANT]
> Las muestras recibidas con CRC invalido son descartadas de inmediato. Si se detecta un salto de secuencia (por ejemplo, de `seq=10` a `seq=14`), la interfaz registra las muestras perdidas y lo consigna en el reporte.

### 6.3. Eventos Asincronos de Seguridad (EVENT)

El firmware notifica eventos criticos de inmediato:
```text
EVENT,type=OVERLOAD,detail=Fuerza_excede_100N
EVENT,type=LIMIT_REACHED,detail=Final_de_carrera_superior
EVENT,type=FAULT,detail=Error_lectura_celda
EVENT,type=TEST_FINISHED
```

### 6.4. Firmware de Control (firmware/utm_controller/utm_controller.ino)

El proyecto incluye el codigo completo de firmware compatible con **Arduino Uno / Nano (ATmega328P)** y **ESP32 DevKit**:

* **Ruta del codigo:** [`firmware/utm_controller/utm_controller.ino`](firmware/utm_controller/utm_controller.ino)
* **Velocidad de transmision:** `115200 baudios`.
* **Frecuencia de telemetria:** `10 Hz` (cada 100 ms).
* **Inicializacion serial:** `delay(500)` en lugar de `while (!Serial)` para compatibilidad con ESP32-S2/S3 con USB nativo CDC.
* **Asignacion de Pines por Defecto:**

| Pin | Funcion | Conexion Fisica |
| :---: | :--- | :--- |
| **D2** | Paro de emergencia | Pulsador normalmente cerrado a GND (pull-up interno) |
| **D3** | Final de carrera superior | Switch normalmente cerrado a GND (pull-up interno) |
| **D4** | Final de carrera inferior | Switch normalmente cerrado a GND (pull-up interno) |
| **D5** | STEP | Entrada STEP del driver NEMA 17 (A4988 / DRV8825) |
| **D6** | DIR | Entrada DIR del driver NEMA 17 |
| **D7** | ENABLE | Entrada ENABLE del driver (LOW = activo) |

> [!NOTE]
> Para ESP32 DevKit, los pines GPIO deben remapearse segun la placa utilizada. Consultar el pinout del fabricante para identificar pines seguros para entrada digital con pull-up y salida PWM.

---

## 7. Modelo Matematico de Ensayos

A partir de la geometria inicial ingresada por el operador y los valores calibrados transmitidos por el microcontrolador:

$$\sigma = \frac{F}{A_0} \quad [\text{MPa}]$$

$$\varepsilon = \frac{\Delta L}{L_0} \quad [\text{adimensional}]$$

* **F:** Fuerza calibrada medida por la celda de carga en Newtons (N).
* **A_0:** Area transversal inicial de la probeta en mm^2 (A_0 = ancho x espesor).
* **Delta L:** Desplazamiento medido en mm.
* **L_0:** Longitud calibrada inicial de la probeta en mm.
* **sigma:** Esfuerzo de ingenieria en megapascales (1 N/mm^2 = 1 MPa).
* **epsilon:** Deformacion unitaria (mostrada en la interfaz como porcentaje).

---

## 8. Puesta en Marcha Local

### 8.1. Requisitos Previos

* **Node.js:** Version 20.x o superior.
* **Navegador:** Google Chrome o Microsoft Edge (requerido para Web Serial API).
* **Arduino IDE:** Version 1.8.x o 2.x con placa Arduino Uno / Nano o ESP32 DevKit conectada por USB.
* **Driver USB del microcontrolador:**
  - Arduino Uno/Nano: Normalmente incluido en Windows. Si no se detecta, instalar el driver CH340 o FTDI segun la placa.
  - ESP32 DevKit con CP2102/CP2104: Instalar el driver de [Silicon Labs CP210x](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers).
  - ESP32 DevKit con CH340/CH9102: Instalar el driver de [WCH CH340](https://www.wch-ic.com/downloads/CH341SER_EXE.html).
* **Supabase:** Proyecto en la nube (solo requiere autenticacion habilitada).
* **Google Gemini API:** Clave de API para el asistente tecnico (gratuita en [Google AI Studio](https://aistudio.google.com/)).

### 8.2. Carga del Firmware

1. Conecte el microcontrolador a la computadora mediante cable USB de datos.
2. Abra **Arduino IDE**.
3. Vaya a **Archivo - Abrir** y seleccione [`firmware/utm_controller/utm_controller.ino`](firmware/utm_controller/utm_controller.ino).
4. En **Herramientas - Placa**, seleccione la placa correspondiente:
   - Arduino Uno o Nano (si utiliza un clon Nano, seleccione el procesador *ATmega328P (Old Bootloader)*).
   - ESP32 Dev Module (requiere instalar el paquete de placas ESP32 en el Gestor de Placas).
5. En **Herramientas - Puerto**, seleccione el puerto COM detectado.
6. Haga clic en **Subir** (Upload).
7. Verifique que el dispositivo aparece en el Administrador de Dispositivos de Windows bajo "Puertos (COM y LPT)". Si aparece con un icono de advertencia, el driver USB no esta instalado correctamente.

> [!IMPORTANT]
> Cierre el Monitor Serie de Arduino IDE antes de conectar desde la aplicacion web. El puerto COM es de acceso exclusivo y la Web Serial API no podra abrirlo si Arduino IDE lo tiene retenido.

### 8.3. Configuracion y Ejecucion de la Plataforma Web

1. Clonar el repositorio y navegar a la carpeta del software:
   ```bash
   git clone https://github.com/LordPercival241/maquina-de-ensayos-esfuerzo-deformacion.git
   cd "UTM - Proyecto de Instrumentación/Resources/Software"
   npm install
   ```

2. Crear el archivo `.env.local` a partir de la plantilla:
   ```bash
   cp .env.example .env.local
   ```

3. Completar las variables en `.env.local`:
   ```dotenv
   # Variables publicas de Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>

   # Variables privadas de servidor (Google Gemini API)
   GEMINI_API_KEY=AIzaSy...
   GEMINI_MODEL=gemini-2.5-flash
   ```

4. Configurar la base de datos en Supabase:
   * Abra el **SQL Editor** de su proyecto en Supabase.
   * Ejecute la migracion [`supabase/migrations/202609180001_initial.sql`](supabase/migrations/202609180001_initial.sql).
   * Verifique en **Authentication - Providers** que **Email** este habilitado.
   * En **Authentication - URL Configuration**, agregue `http://localhost:3000/auth/callback` en las Redirect URLs.

5. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   Abra `http://localhost:3000` en Chrome o Edge.

### 8.4. Scripts Disponibles

```bash
npm run dev        # Servidor de desarrollo con Next.js
npm run build      # Compilacion optimizada para produccion
npm run start      # Servidor en modo produccion
npm run lint       # Analisis estatico de codigo con ESLint
npm run typecheck  # Verificacion estricta de tipos TypeScript
```

---

## 9. Despliegue en Produccion (Supabase + Vercel)

### 9.1. Configuracion de Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com):
   - **Name:** `utm-lab`
   - **Region:** `South America (Sao Paulo)` (el mas cercano a Peru)
   - **Plan:** Free
2. Una vez creado el proyecto, ir a **Settings - API** y copiar:
   - **Project URL** (sera `NEXT_PUBLIC_SUPABASE_URL`)
   - **anon public key** (sera `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role key** (sera `SUPABASE_SERVICE_ROLE_KEY`, solo para uso en servidor)
3. Ir a **SQL Editor**, crear una nueva consulta, pegar el contenido completo de [`supabase/migrations/202609180001_initial.sql`](supabase/migrations/202609180001_initial.sql) y ejecutar. El resultado esperado es "Success. No rows returned".
4. Ir a **Authentication - Providers** y verificar que **Email** esta habilitado (activado por defecto).
5. Ir a **Authentication - URL Configuration** y configurar:
   - **Site URL:** la URL de produccion en Vercel (se completara en el paso 9.2).
   - **Redirect URLs:** agregar las URLs de callback para cada entorno.

> [!CAUTION]
> La clave `service_role` tiene permisos completos sobre la base de datos. No debe exponerse en el frontend ni en repositorios publicos. Utilizarla exclusivamente como variable de entorno en el servidor (Vercel).

### 9.2. Obtencion de la Clave de Google Gemini

1. Ir a [Google AI Studio](https://aistudio.google.com/apikey).
2. Iniciar sesion con una cuenta de Google.
3. Hacer clic en **Create API Key** y seleccionar un proyecto de Google Cloud.
4. Copiar la clave generada (sera `GEMINI_API_KEY`).

La API de Gemini dispone de una cuota gratuita de 60 solicitudes por minuto para el modelo `gemini-2.5-flash`. No requiere tarjeta de credito.

### 9.3. Despliegue en Vercel

1. Subir el codigo a un repositorio en GitHub:
   ```bash
   git init
   git add .
   git commit -m "UTM Lab v1.1"
   git branch -M main
   git remote add origin https://github.com/<usuario>/utm-lab.git
   git push -u origin main
   ```

2. Ir a [vercel.com](https://vercel.com), crear una cuenta (se puede vincular con GitHub) y hacer clic en **Add New - Project**.

3. Seleccionar el repositorio de GitHub e importarlo. Vercel detectara automaticamente que es un proyecto Next.js.

4. **Configurar el Root Directory** antes de desplegar:
   - En la pantalla de configuracion, expandir **Root Directory**.
   - Ingresar: `Resources/Software`.

5. Configurar las **variables de entorno** en la misma pantalla (o posteriormente en **Settings - Environment Variables**):

   | Variable | Valor | Entornos |
   | :--- | :--- | :--- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://XXXXX.supabase.co` | Production, Preview, Development |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Production, Preview, Development |
   | `GEMINI_API_KEY` | `AIzaSy...` | Production, Preview, Development |
   | `GEMINI_MODEL` | `gemini-2.5-flash` | Production, Preview, Development |
   | `CRON_SECRET` | (generar con `openssl rand -base64 32`) | Production |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` (service_role) | Production |

6. Hacer clic en **Deploy** y esperar la compilacion (aproximadamente 1-2 minutos).

7. Vercel asignara una URL de produccion (por ejemplo, `https://utm-lab.vercel.app`).

8. Volver a **Supabase - Authentication - URL Configuration** y actualizar:
   - **Site URL:** `https://utm-lab.vercel.app`
   - **Redirect URLs:** agregar `https://utm-lab.vercel.app/auth/callback`

9. Verificar el cron keep-alive en **Vercel - Settings - Crons**. Debe aparecer el job `/api/cron/keep-alive` programado con la expresion `0 8 */5 * *`. Se puede ejecutar manualmente con el boton "Trigger" para validar que devuelve `{"ok": true}`.

> [!IMPORTANT]
> **Root Directory obligatorio:** Dado que el codigo fuente de la aplicacion no esta en la raiz del repositorio sino en `Resources/Software/`, es imprescindible configurar el Root Directory en Vercel. Sin esta configuracion, el build fallara porque Vercel no encontrara el `package.json`.

> [!TIP]
> La Web Serial API exige un contexto seguro (HTTPS). Al desplegar en Vercel, el dominio obtiene un certificado SSL automatico y el archivo `next.config.ts` ya contiene la cabecera `Permissions-Policy: serial=(self)` requerida para autorizar el acceso al puerto USB.

### 9.4. Keep-Alive de Supabase (Plan Gratuito)

Supabase pausa automaticamente los proyectos del plan gratuito si no detecta actividad en la base de datos durante 7 dias consecutivos. Para evitar esto, el proyecto incluye:

* **Endpoint:** `GET /api/cron/keep-alive` ejecuta una consulta minima (`SELECT id FROM profiles LIMIT 1`) para reiniciar el contador de inactividad.
* **Programacion:** Vercel Cron invoca el endpoint cada 5 dias (expresion: `0 8 */5 * *`), dejando 2 dias de margen respecto al limite de 7 dias.
* **Seguridad:** El endpoint esta protegido por la variable `CRON_SECRET`. Vercel Cron inyecta automaticamente el header `Authorization: Bearer <CRON_SECRET>` en cada invocacion.
* **Configuracion:** Definida en [`vercel.json`](vercel.json).

Si no se utiliza Vercel, el endpoint puede invocarse desde cualquier servicio de cron externo (cron-job.org, UptimeRobot, GitHub Actions) con una frecuencia maxima de 6 dias:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>.vercel.app/api/cron/keep-alive
```

---

## 10. Compatibilidad de Microcontroladores

### 10.1. Arduino Uno / Nano (ATmega328P)

Plataforma de referencia. El firmware funciona sin modificaciones. Driver USB incluido en Windows para la mayoria de placas oficiales. Para clones con chip CH340, instalar el driver correspondiente.

### 10.2. ESP32 DevKit

El firmware es compatible con ESP32 DevKit. Consideraciones especificas:

* **Driver USB:** Instalar el driver correspondiente al chip de la placa:
  - CP2102 / CP2104: [Silicon Labs CP210x](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
  - CH340 / CH9102: [WCH CH340](https://www.wch-ic.com/downloads/CH341SER_EXE.html)
* **Inicializacion serial:** El firmware utiliza `delay(500)` en lugar de `while (!Serial)` para evitar bloqueos en variantes con USB nativo CDC (ESP32-S2, ESP32-S3).
* **Cable USB:** Verificar que el cable sea de datos y no exclusivamente de carga. Algunos cables micro-USB o USB-C no incluyen los conductores de datos.
* **Verificacion:** Tras conectar el ESP32, debe aparecer un puerto COM en el Administrador de Dispositivos de Windows. Si no aparece o muestra un icono de advertencia, el driver no esta instalado.
* **Pines GPIO:** Los pines del firmware estan definidos para Arduino. Para ESP32, remapear segun el pinout de la placa utilizada. Evitar los pines reservados para funciones internas del ESP32 (GPIO 0, 2, 5, 12, 15 en el arranque).

### 10.3. Requisitos del Navegador para Web Serial API

La Web Serial API solo esta disponible en:

* Google Chrome (escritorio, version 89 o superior)
* Microsoft Edge (escritorio, version 89 o superior)

No esta soportada en Firefox, Safari ni en navegadores moviles. Adicionalmente, requiere un contexto seguro: `localhost` (HTTP permitido) o `https://` (obligatorio en produccion).

---

## 11. Estado del Proyecto y Hoja de Ruta

- [x] Definicion conceptual y parametros de diseno (limite 100 N).
- [x] Distribucion de responsabilidades entre los cuatro integrantes.
- [x] Adquisicion de componentes clave (Arduino, celda 10 kg, motor NEMA 17, driver).
- [x] Desarrollo de la plataforma web en Next.js con soporte Web Serial, Recharts y Google Gemini.
- [x] Autenticacion de operadores en Supabase con RLS y exportacion local de reportes PDF/CSV.
- [x] Implementacion completa del firmware con protocolo Serial v1, CRC-16/CCITT y bloqueos de seguridad.
- [x] Compatibilidad del firmware con Arduino Uno/Nano y ESP32 DevKit.
- [x] Cron keep-alive para evitar la pausa automatica de Supabase en el plan gratuito.
- [x] Validacion de compilacion y preparacion para despliegue en Vercel.
- [ ] Calibracion experimental con masas patron de la celda de carga de 10 kg.
- [ ] Fabricacion de piezas CAD definitivas (mordazas y soportes de guias).
- [ ] Ensayos de traccion con probetas polimericas (PLA, PETG, ABS) y trazado experimental de curvas.

---

## 12. Documentacion Complementaria

* [Firmware para Arduino / ESP32](firmware/utm_controller/utm_controller.ino)
* [Guia de puesta en marcha rapida](docs/SETUP.md)
* [Migracion de base de datos para Supabase](supabase/migrations/202609180001_initial.sql)
* [Configuracion de Vercel Cron](vercel.json)
* [Plantilla de variables de entorno](.env.example)
* [Documento de Estado del Arte](Estado%20del%20arte_Olivas_Tineo_Ag%C3%BAero_%20Sanchez.pdf)
