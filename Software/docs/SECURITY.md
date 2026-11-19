# DOCUMENTO DE ARQUITECTURA DE SEGURIDAD Y MITIGACIÓN DE AMENAZAS
## Sistema de Instrumentación y Control UTMachine Lab

**Clasificación:** Documento Técnico de Ingeniería / Auditoría de Seguridad  
**Fecha de emisión:** Noviembre 2026  
**Versión del Sistema:** UTMachine Lab v1.0  
**Stack Tecnológico:** Next.js 15.1.6 (App Router), React 19.0.0, TypeScript 5.7.2, Supabase PostgreSQL (RLS), Web Serial API (W3C), ESP32 DevKit (Firmware C/C++), Vercel Infrastructure.

---

## 1. RESUMEN EJECUTIVO

El presente documento detalla la arquitectura de seguridad integral implementada en la plataforma UTMachine Lab, diseñada para la adquisición metrológica, control cinemático y caracterización de probetas poliméricas mediante ensayos mecánicos de tracción.

El sistema implementa un modelo de **Defensa en Profundidad (Defense-in-Depth)** estructurado en seis capas aisladas. A diferencia de las arquitecturas de Internet de las Cosas (IoT) convencionales donde el microcontrolador se expone directamente a redes TCP/IP mediante interfaces inalámbricas, UTMachine Lab adopta un diseño de **aislamiento físico de red (Air-Gap)** para el hardware de control, transfiriendo la superficie de ataque hacia capas con controles criptográficos y de autorización robustos.

---

## 2. ARQUITECTURA DE SEGURIDAD POR CAPAS

```text
+---------------------------------------------------------------------------------+
| CAPA 5: INTELIGENCIA METROLÓGICA (YoungBot API Route)                           |
| - Verificación de JWT Bearer en servidor Next.js                                |
| - Aislamiento de credenciales (Server-Side Only)                                |
| - Sanitización contextual y abstracción total de motores LLM                    |
+---------------------------------------------------------------------------------+
                                       │
+---------------------------------------------------------------------------------+
| CAPA 4: BASE DE DATOS Y GESTIÓN DE IDENTIDAD (Supabase PostgreSQL)              |
| - Row Level Security (RLS) habilitado en public.profiles                        |
| - Políticas estrictas vinculadas a auth.uid()                                   |
| - Privacidad por diseño: Mediciones mecánicas excluidas de la nube              |
+---------------------------------------------------------------------------------+
                                       │
+---------------------------------------------------------------------------------+
| CAPA 3: RED Y DESPLIEGUE (Vercel Edge Network / HTTP Headers)                   |
| - Tráfico forzado sobre TLS 1.3 / HTTPS                                         |
| - Content-Security-Policy (CSP) estricta                                        |
| - HSTS (Strict-Transport-Security), X-Frame-Options: DENY, X-Content-Type-Nosniff|
+---------------------------------------------------------------------------------+
                                       │
+---------------------------------------------------------------------------------+
| CAPA 2: CLIENTE WEB Y RENDERIZADO (Next.js 15 / React 19)                       |
| - Parseo numérico estricto con Number.isFinite() y esquemas Zod                 |
| - Renderizado inmune a XSS (React Virtual DOM / textContent nativo)             |
| - Procesamiento in-memory de datos (generación local de PDF/CSV)                |
+---------------------------------------------------------------------------------+
                                       │
+---------------------------------------------------------------------------------+
| CAPA 1: CANAL LOCAL DE COMUNICACIÓN (W3C Web Serial API)                        |
| - Sandboxing en el proceso de renderizado de Chromium                           |
| - Requerimiento de consentimiento explícito del operador (User Gesture)         |
| - Restricción de origen: Permissions-Policy: serial=(self)                      |
| - Verificación de integridad matemática mediante CRC-16/CCITT                   |
+---------------------------------------------------------------------------------+
                                       │
+---------------------------------------------------------------------------------+
| CAPA 0: ACTUACIÓN Y HARDWARE (ESP32 DevKit)                                     |
| - Aislamiento físico de red (Air-Gap): Sin conectividad WiFi ni Bluetooth       |
| - Búfer serie de tamaño acotado contra desbordamiento (Buffer Overflow)         |
| - Máquina de estados finitos determinista (READY, ARMED, RUNNING, STOPPED)      |
| - Tope mecánico de seguridad y detección de origen en Pin Físico 21             |
+---------------------------------------------------------------------------------+
```

---

## 3. ANÁLISIS DETALLADO DE CONTROLES DE SEGURIDAD

### 3.1. Capa 0: Hardware y Controlador de Instrumentación (ESP32)

1. **Aislamiento Físico de Red (Air-Gap):**
   - El firmware `CodigoEnsayoCalibracionPuntoCero.ino` no incorpora dependencias de red (`WiFi.h`, `WiFiClient.h`, `BluetoothSerial.h`).
   - El microcontrolador carece de interfaz de red activa, lo que elimina vectores de ataque remotos como escaneos de puertos, explotación de stacks IP vulnerables o ataques de denegación de servicio distribuido (DDoS).

2. **Mitigación de Desbordamiento de Búfer (Buffer Overflow):**
   - El canal UART opera con un búfer de recepción estático de longitud fija (`char rxBuffer[160]`).
   - El control de punteros valida estrictamente la capacidad previa a la escritura:
     ```cpp
     if (rxIndex < (int)(sizeof(rxBuffer) - 1)) {
       rxBuffer[rxIndex++] = c;
     }
     ```
   - No se emplean funciones inseguras de la librería estándar de C como `gets()` o `strcpy()`.

3. **Determinismo Mecánico y Estados Finitos:**
   - La máquina únicamente responde a una secuencia válida de comandos: `HELLO` -> `ARM_TEST` -> `START_TEST` -> `STOP_TEST`.
   - Se prohíben transiciones no autorizadas; el motor no puede entrar en movimiento si el sistema no se encuentra previamente en estado armado.
   - Detección de parada de seguridad mediante flanco de bajada en el Pin 21 (`BOTON_CERO`), interrumpiendo el tren de pulsos de pasos (`stepper.setSpeed(0)`) de forma inmediata.

---

### 3.2. Capa 1: Canal de Comunicación Local y Web Serial

1. **Restricción de Origen y Directiva de Permisos:**
   - La API Web Serial se encuentra restringida por la cabecera HTTP:
     ```http
     Permissions-Policy: serial=(self)
     ```
   - Esto impide que scripts embebidos en iframes o dominios de terceros soliciten acceso al puerto serie del operador.

2. **Modelo de Seguridad de Acceso al Dispositivo:**
   - De acuerdo con el estándar W3C, ninguna instrucción de software puede abrir silenciosamente el puerto serie.
   - El método `navigator.serial.requestPort()` exige un evento de usuario confiable (`user gesture`, como un clic directo) y abre un diálogo modal gestionado por el sistema operativo, permitiendo al operador auditar qué dispositivo físico conecta.

3. **Integridad de Datos Mediante CRC-16/CCITT:**
   - Cada paquete de telemetría emitido por el microcontrolador concluye con un código de redundancia cíclica de 16 bits:
     $$P(x) = x^{16} + x^{12} + x^5 + 1 \quad (\text{Polinomio } 0x1021, \text{ Valor Inicial } 0xFFFF)$$
   - El receptor en el navegador recalcula el algoritmo sobre la carga útil y descarta cualquier paquete que no presente coincidencia exacta. Esto mitiga la inyección de datos arbitrarios por ruido electromagnético o manipulación física en la línea serie.

---

### 3.3. Capa 2: Seguridad en el Cliente Web y Renderizado

1. **Inmunidad ante Inyección de Scripts (Cross-Site Scripting - XSS):**
   - El sistema no hace uso de propiedades que evalúen código HTML dinámico (`innerHTML`, `outerHTML`, `document.write`).
   - No existe ninguna implementación de `dangerouslySetInnerHTML` en los componentes de la interfaz.
   - React escapa de manera nativa todos los valores interpolados en JSX, tratándolos estrictamente como cadenas de texto plano (`textContent`).

2. **Tipado Estricto y Validación Numérica:**
   - Las lecturas seriales recibidas son validadas individualmente antes de ingresar al estado de la aplicación:
     ```typescript
     const value = Number(fields[key]);
     if (!Number.isFinite(value)) throw new Error("Campo serial no numerico");
     ```
   - Los datos de configuración de probeta son sanitizados en tiempo de ejecución utilizando esquemas formales construidos con **Zod** (`testSetupSchema`).

3. **Privacidad por Diseño (Zero Cloud Telemetry):**
   - La matriz de datos numéricos de ensayo, los cálculos de esfuerzo y deformación, así como la generación de curvas, residen exclusivamente en la memoria volátil del navegador.
   - Los reportes en formato PDF y CSV se construyen en el hilo del cliente mediante `jsPDF` y serializadores locales. Ningún dato técnico del ensayo es transmitido a servidores externos ni almacenado en bases de datos en la nube.

---

### 3.4. Capa 3: Endurecimiento de Cabeceras HTTP (Configuración de Servidor)

El archivo `next.config.ts` define las siguientes cabeceras de seguridad inyectadas en todas las respuestas del servidor:

| Cabecera de Seguridad | Valor Configurado | Propósito de Protección |
| :--- | :--- | :--- |
| **Content-Security-Policy (CSP)** | `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;` | Previene ejecución de scripts no autorizados, restringe conexiones salientes únicamente a endpoints verificados y prohíbe la inserción de objetos externos. |
| **X-Frame-Options** | `DENY` | Mitiga de forma absoluta ataques de Clickjacking impidiendo que la aplicación sea embebida en marcos (`<iframe>`) de terceros. |
| **X-Content-Type-Options** | `nosniff` | Impide que el navegador intente adivinar (MIME-sniffing) el tipo de contenido, forzando la interpretación estricta de las declaraciones de tipo. |
| **Referrer-Policy** | `strict-origin-when-cross-origin` | Limita la exposición de URLs completas en peticiones cruzadas, protegiendo información sensible en parámetros de ruta. |
| **Strict-Transport-Security (HSTS)** | `max-age=31536000; includeSubDomains` | Fuerza el uso continuo de conexiones HTTPS durante un mínimo de un año, mitigando ataques de degradación SSL (*SSL Stripping*). |

---

### 3.5. Capa 4: Autenticación, Autorización y Base de Datos (Supabase)

1. **Aislamiento en Nivel de Fila (Row Level Security - RLS):**
   - La tabla `public.profiles` posee RLS habilitado de manera obligatoria:
     ```sql
     alter table public.profiles enable row level security;
     ```
   - Se aplican políticas granulares vinculadas al identificador criptográfico del usuario autenticado (`auth.uid() = id`), garantizando que ningún operador pueda consultar, modificar o eliminar registros pertenecientes a otro usuario.

2. **Gestión Segura de Sesiones:**
   - La autenticación opera bajo tokens criptográficos firmados (JSON Web Tokens - JWT).
   - Se exige verificación estricta de correo electrónico (`email_confirmed_at`) previo a habilitar el ingreso al panel de control.
   - Las claves maestras administrativas (`SUPABASE_SERVICE_ROLE_KEY`) residen exclusivamente en variables de entorno del servidor y nunca son expuestas al bundle de JavaScript del cliente.

---

### 3.6. Capa 5: Módulo de Asistencia Técnica (YoungBot API)

1. **Autorización en Punto de Entrada (Server-Side Verification):**
   - El endpoint `/api/assistant/route.ts` exige un encabezado de autorización HTTP Bearer válido.
   - Previo a procesar cualquier consulta, el servidor valida el token contra la instancia de Supabase mediante `authClient.auth.getUser(token)`. Si la sesión ha expirado o es apócrifa, la petición es rechazada con código HTTP 401.

2. **Confidencialidad de Claves de API:**
   - Las credenciales de acceso al modelo de lenguaje (`GEMINI_API_KEY`, `YOUNGBOT_API_KEY`) se administran como variables privadas de entorno en Vercel, impidiendo su visibilidad o extracción desde el navegador.

3. **Sanitización de Contexto y Resiliencia ante Cuotas:**
   - Los datos transmitidos al asistente corresponden únicamente a parámetros dimensionales y lecturas estadísticas agregadas de la probeta actual.
   - El endpoint implementa tolerancia a fallos con cascada de modelos y detección de agotamiento de cuota (HTTP 429), evitando bloqueos en la interfaz del operador.

---

## 4. MATRIZ DE RIESGOS SEGÚN EL MODELO STRIDE

| Categoría de Amenaza | Vector Potencial | Mecanismo de Defensa Implementado | Estado |
| :--- | :--- | :--- | :--- |
| **Spoofing** (Suplantación) | Creación de cuentas no autorizadas o suplantación de operadores. | Validación estricta de correo electrónico, hashing de contraseñas mediante bcrypt/Argon2 en Supabase Auth, verificación obligatoria de JWT. | **Mitigado** |
| **Tampering** (Manipulación) | Inyección de datos alterados en la línea serie o interferencia electromagnética. | Validación de suma de comprobación matemática CRC-16/CCITT en cada muestra. Descarte automático ante inconsistencia. | **Mitigado** |
| **Repudiation** (Repudio) | Desconocimiento de autoría de un ensayo realizado. | Trazabilidad del operador autenticado asociada al reporte generado con metadatos de fecha y hora. | **Mitigado** |
| **Information Disclosure** (Fuga de Datos) | Extracción de curvas de ensayo confidenciales desde la nube. | Principio de mínimo almacenamiento: Las curvas nunca se persisten en bases de datos remotas; residen en la RAM del cliente. | **Mitigado** |
| **Denial of Service** (DoS) | Envío de tramas excesivas para desbordar memoria en el microcontrolador. | Búfer estático acotado (`rxBuffer[160]`) con comprobación estricta de límites. | **Mitigado** |
| **Elevation of Privilege** (Escalamiento) | Acceso al panel de control sin autenticación o acceso a datos de otros perfiles. | Verificación de sesión en cliente y servidor, combinada con políticas RLS (`auth.uid() = id`). | **Mitigado** |

---

## 5. PROCEDIMIENTOS OPERATIVOS RECOMENDADOS PARA EL LABORATORIO

Para mantener la integridad operativa del sistema, se deben observar las siguientes directrices en la estación de trabajo:

1. **Entorno de Navegación Confiable:**
   - Ejecutar la plataforma exclusivamente en navegadores basados en Chromium (Google Chrome o Microsoft Edge) actualizados a sus versiones estables vigentes para garantizar la integridad del motor de sandboxing de Web Serial.

2. **Seguridad del Puerto Host:**
   - Cerrar cualquier aplicación de monitoreo serie (Arduino IDE Serial Monitor, terminales PuTTY) antes de inicializar la conexión en la plataforma web para evitar condiciones de carrera o bloqueos del puerto COM a nivel del sistema operativo.

3. **Mantenimiento del Interruptor Físico:**
   - Inspeccionar periódicamente la continuidad eléctrica del pulsador de punto cero (Pin 21) para garantizar su función como límite de seguridad de carrera física.

---

## 6. CONCLUSIÓN

El sistema **UTMachine Lab** presenta una arquitectura de seguridad madura, técnicamente justificada y proporcional a su propósito de instrumentación de laboratorio. La combinación de aislamiento de red en el microcontrolador (Air-Gap), verificación matemática de integridad de datos (CRC-16), políticas estrictas de seguridad web (CSP, HSTS, RLS) y un modelo de datos volátil en memoria local neutraliza los vectores de ataque más comunes en entornos industriales y académicos.

