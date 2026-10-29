# UTM Lab — Arquitectura, Protocolos y Funcionamiento del Software

Sistema de software para la adquisicion determinista de datos en tiempo real, caracterizacion mecanica de materiales, procesamiento metrologico de curvas esfuerzo-deformacion y gestion de ensayos uniaxiales de traccion.

---

## 1. Descripcion General y Enfoque Arquitectonico

UTM Lab es una plataforma de software disenada para operar como el nucleo de control logico, telemetria y metrologia de una Maquina Universal de Ensayos (UTM) uniaxial orientada a cargas de hasta 100 N.

El diseno del software se rige por un **modelo de responsabilidades desacopladas entre el borde fisico (microcontrolador) y la capa de aplicacion web**:

1. **Aislamiento de tareas de tiempo real critico:** El microcontrolador ejecuta de forma autonoma las rutinas de lazo cerrado, temporizacion de muestreo, generacion de pulsos para el actuador paso a paso y accionamiento inmediato de paradas de emergencia o finales de carrera.
2. **Adquisicion determinista en el cliente:** La aplicacion web establece comunicacion serial bidireccional punto a punto mediante la API estandar Web Serial (W3C), eliminando la latencia de servidores intermedios y garantizando el procesamiento directo en la memoria del navegador.
3. **Metrologia estricta sin interpolacion artificial:** El software calcula las magnitudes derivadas (esfuerzo $\sigma$ y deformacion $\varepsilon$) exclusivamente a partir de las muestras que superan la verificacion de redundancia ciclica (CRC-16/CCITT). Queda terminantemente prohibida la inyeccion de curvas sintetizadas o datos simulados.
4. **Politica Cero-Cloud para datos masivos (Zero Cloud Storage Footprint):** Las series temporales de medicion y los reportes generados se procesan en memoria volatil local y se exportan directamente al disco del operador en formatos CSV y PDF formal. Los servicios cloud se restringen exclusivamente a la autenticacion de operadores (Supabase Auth) y a la evaluacion contextual asistida por modelos de lenguaje (Google Gemini API).

---

## 2. Pila Tecnologica y Dependencias

| Componente / Capa | Tecnologia | Version | Funcion Especifica |
| :--- | :--- | :--- | :--- |
| Framework Base | Next.js (App Router) | 15.1.6 | Arquitectura de renderizado en cliente y Route Handlers serverless. |
| Libreria de UI | React | 19.0.0 | Manejo declarativo del arbol de componentes y estado reactivo. |
| Tipado Estatico | TypeScript | 5.7.2 | Tipado estricto en tiempo de compilacion para el dominio metrologico. |
| Validacion de Esquemas | Zod | 3.24.2 | Validacion formal de entradas de formulario y contratos de payload serial/API. |
| Comunicacion Hardware | Web Serial API | Estandar W3C | Acceso bidireccional directo a puertos seriales USB (UART). |
| Graficacion Vectorial | Recharts | 2.15.1 | Renderizado vectorial SVG de la curva esfuerzo-deformacion en tiempo real. |
| Generacion de Reportes | jsPDF | 4.2.1 | Compilacion programatica de documentos PDF con rasterizacion del grafico. |
| Autenticacion y DB | @supabase/supabase-js | 2.49.4 | Cliente singleton para gestion de sesiones JWT y perfiles con RLS. |
| Motor de IA | Google Generative AI | gemini-2.5-flash | Diagnostico metrologico y soporte tecnico contextualizado. |
| Estilos y Layout | Tailwind CSS | 3.4.19 | Diseno de interfaces responsivas y paneles de instrumentos. |

---

## 3. Arquitectura del Sistema y Flujo de Datos

```text
+-----------------------------------------------------------------------------------------+
|                                    CONTROLADOR LOCAL                                    |
|                                                                                         |
|   [ Sensor Celda de Carga ] ---> [ Acondicionamiento ADC ]                              |
|                                            |                                            |
|   [ Paro / Finales de Carrera ] ---------> [ Firmware C/C++ en MCU ]                    |
|                                            | (Arduino ATmega328P / ESP32)               |
|                                            v                                            |
|                                   Buffer Serial UART                                    |
+--------------------------------------------+--------------------------------------------+
                                             | Cable USB (115200 baud, 8N1)
                                             v
+-----------------------------------------------------------------------------------------+
|                             NAVEGADOR CLIENTE (CHROME / EDGE)                           |
|                                                                                         |
|   +-- Web Serial API (ReadableStreamDefaultReader / TextDecoder)                        |
|   |                                                                                     |
|   +-- Hook useSerialTestSession                                                         |
|   |   +-- Demultiplexor de Tramas (CMD / ACK / SAMPLE / EVENT)                          |
|   |   +-- Verificador CRC-16/CCITT (Polinomio 0x1021, Semilla 0xFFFF)                   |
|   |   +-- Monitor de Secuencia Monotona (Deteccion de muestras descartadas/perdidas)    |
|   |   +-- Despachador de Transacciones (Registro y Timeout de Comandos - 3000 ms)       |
|   |                                                                                     |
|   +-- Pipeline Metrologico (test-domain.ts)                                             |
|   |   +-- Calculo de Esfuerzo de Ingenieria: sigma = F / A_0                            |
|   |   +-- Calculo de Deformacion Unitaria:   epsilon = Delta_L / L_0                    |
|   |                                                                                     |
|   +-- Capa de Renderizado en Vivo                                                       |
|   |   +-- Grafico SVG Dinamico (Recharts - LineChart)                                   |
|   |   +-- Instrumental Digital (Lectura puntual F, sigma, epsilon, delta_L, alertas)    |
|   |                                                                                     |
|   +-- Modulo de Exportacion Local en Memoria                                            |
|       +-- Generador CSV con Sanitizacion de Formulas (csv.ts)                           |
|       +-- Generador de Reporte PDF Metrologico Formal (pdf-report.ts)                   |
+--------------------------------------------+--------------------------------------------+
                                             | HTTPS / JSON (Route Handlers)
                                             v
+-----------------------------------------------------------------------------------------+
|                                   SERVICIOS DE SOPORTE                                  |
|                                                                                         |
|   +-- /api/assistant (Next.js Serverless)                                               |
|   |   +-- Validacion de Token JWT Supabase                                              |
|   |   +-- Prompt Metrologico Estructurado (Normas ASTM D638 / ISO 527)                  |
|   |   +-- Inferencia con Google Gemini API (gemini-2.5-flash)                           |
|   |                                                                                     |
|   +-- /api/cron/keep-alive (Next.js Serverless)                                         |
|   |   +-- Validacion de Encabezado Authorization: Bearer <CRON_SECRET>                  |
|   |   +-- Transaccion SQL Minima sobre Supabase PostgreSQL (Prevencion de Pausa)        |
|   |                                                                                     |
|   +-- Supabase Platform (PostgreSQL)                                                    |
|       +-- Esquema auth.users (Cuentas de Operadores)                                    |
|       +-- Tabla public.profiles con Row Level Security (RLS)                            |
+-----------------------------------------------------------------------------------------+
```

---

## 4. Protocolo de Comunicacion Serial v1

La comunicacion fisica se realiza a traves de un puerto serie virtual UART sobre USB.

### 4.1. Parametros de Enlace Fisico

* **Velocidad de transmision:** 115200 baudios.
* **Configuracion de bits:** 8 bits de datos, sin paridad, 1 bit de parada (8N1).
* **Control de flujo:** Ninguno (manejo de flujo por software mediante tramas transaccionales).
* **Delimitador de linea:** Retorno de carro y salto de linea (`\r\n`) o salto de linea estandar (`\n`).

### 4.2. Formato General de Tramas

Todas las cadenas de datos se codifican en formato ASCII estandar, delimitadas por comas. El primer token define el tipo de mensaje:

* `CMD`: Orden enviada desde la aplicacion web hacia el microcontrolador.
* `ACK`: Respuesta obligatoria del microcontrolador ante un `CMD`.
* `SAMPLE`: Trama periodica de medicion generada por el microcontrolador durante la ejecucion de un ensayo.
* `EVENT`: Notificacion asincrona de estado o interrupcion de seguridad emitida por el microcontrolador.

### 4.3. Handshake y Control Transaccional

Cada orden emitida por el hook `useSerialTestSession` genera un identificador universal unico (UUID v4) y se asocia a un temporizador de rechazo de 3000 ms. Si el firmware no responde con un `ACK` que contenga el mismo identificador dentro de dicho plazo, la promesa se rechaza y el sistema pasa a estado de falla.

Secuencia de estados de la maquina de software:

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

Tiempos y transacciones:

1. **Sondeo de Presencia (HELLO):**
   * Transmision: `CMD,id=b1899120-6d43-455b-b9f1-d0eb9f18a230,type=HELLO`
   * Respuesta esperada: `ACK,id=b1899120-6d43-455b-b9f1-d0eb9f18a230,status=OK`

2. **Armado de Ensayo (ARM_TEST):**
   * Transmision: `CMD,id=1c6b12d5-9bf6-4b89-a292-1a48c6bf9087,type=ARM_TEST,calibration_profile=CAL-DEFAULT`
   * Respuesta esperada: `ACK,id=1c6b12d5-9bf6-4b89-a292-1a48c6bf9087,status=OK`
   * Si el firmware detecta una condicion anomala (paro pulsado o sensor no calibrado), responde:
     `ACK,id=1c6b12d5-9bf6-4b89-a292-1a48c6bf9087,status=ERROR,reason=Paro_de_emergencia_activado`

3. **Inicio de Accionamiento y Muestreo (START_TEST):**
   * Transmision: `CMD,id=3a95bf2e-0678-43b9-a9a2-94ea480f2d31,type=START_TEST`
   * Respuesta esperada: `ACK,id=3a95bf2e-0678-43b9-a9a2-94ea480f2d31,status=OK`

4. **Detencion de Ensayo (STOP_TEST):**
   * Transmision: `CMD,id=52d9c57e-fbb6-4d51-86be-e4d7759ad234,type=STOP_TEST`
   * Respuesta esperada: `ACK,id=52d9c57e-fbb6-4d51-86be-e4d7759ad234,status=OK`

### 4.4. Telemetria en Tiempo Real (Trama SAMPLE)

Durante la fase activa del ensayo (`running`), el microcontrolador transmite paquetes de medicion con una frecuencia nominal de 10 Hz (periodo de 100 ms).

Estructura de la trama:
```text
SAMPLE,seq=42,t_ms=4200,force_raw=8320,displacement_raw=840,force_n=41.50,displacement_mm=2.100,crc=3B9A
```

Definicion de campos:
* `seq` (entero sin signo): Contador secuencial monotonamente creciente asignado por el firmware.
* `t_ms` (entero sin signo): Marca temporal en milisegundos desde el inicio del ensayo, generada por el timer del procesador.
* `force_raw` (entero): Valor directo digitalizado del conversor analogico-digital de la celda de carga.
* `displacement_raw` (entero): Conteo acumulado de pasos del motor o pulsos del codificador de posicion.
* `force_n` (flotante con 2 decimales): Fuerza fisica calculada por el firmware en Newtons [N].
* `displacement_mm` (flotante con 3 decimales): Desplazamiento lineal de la mordaza movil en milimetros [mm].
* `crc` (hexadecimal de 4 caracteres en mayusculas): Suma de verificacion CRC-16/CCITT calculada sobre la totalidad de la cadena anterior a `,crc=`.

### 4.5. Validacion de Integridad mediante CRC-16/CCITT

Para evitar que errores de transmision UART o interferencias electromagneticas por conmutacion del motor paso a paso alteren los valores metrologicos, el software recalcula en el cliente el algoritmo CRC-16/CCITT sobre cada cadena recibida:

* **Polinomio generador:** $G(x) = x^{16} + x^{12} + x^5 + 1$ (representacion canonica `0x1021`).
* **Valor inicial de registro:** `0xFFFF`.
* **Procesamiento de bits:** Desplazamiento a la izquierda con mascara `0x8000`.

Implementacion algoritmica en TypeScript ([`src/hooks/use-serial-test-session.ts`](src/hooks/use-serial-test-session.ts)):

```typescript
const crc16Ccitt = (input: string): number => {
  let crc = 0xffff;
  for (let index = 0; index < input.length; index += 1) {
    crc ^= input.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
};
```

Regla de descarte: si el valor hexadecimal contenido en el campo `crc` no coincide de forma exacta con el valor computado sobre la porcion previa a `,crc=`, la muestra es rechazada de inmediato y descartada del pipeline metrologico.

### 4.6. Deteccion y Registro de Perdida de Paquetes

El software mantiene en memoria una referencia al ultimo numero de secuencia validado (`lastSequenceRef`). Si al arribar una nueva muestra valida se cumple la condicion:

$$\text{seq}_{\text{actual}} > \text{seq}_{\text{anterior}} + 1$$

El contador de paquetes perdidos (`droppedSamples`) se incrementa por la diferencia exacta:

$$\Delta_{\text{perdida}} = \text{seq}_{\text{actual}} - \text{seq}_{\text{anterior}} - 1$$

Esta metrica se conserva en el estado de la sesion y se consigna de forma permanente tanto en el archivo CSV como en el reporte formal PDF, garantizando la trazabilidad experimental.

### 4.7. Eventos Asincronos de Seguridad (Trama EVENT)

El firmware posee prioridad de corte y puede emitir en cualquier momento mensajes de evento que suspenden de inmediato el ensayo:

* `EVENT,type=OVERLOAD,detail=Fuerza_excede_100N`: La carga leida ha superado el umbral seguro del prototipo.
* `EVENT,type=LIMIT_REACHED,detail=Final_de_carrera_superior`: El carro alcanzo el switch de carrera fisico.
* `EVENT,type=FAULT,detail=Error_lectura_celda`: Perdida de comunicacion con el convertidor ADC o datos corruptos recurrentes.
* `EVENT,type=TEST_FINISHED`: Condicion de finalizacion programada del ensayo alcanzada normalmente.

Al recibir cualquiera de los eventos de falla (`FAULT`, `LIMIT_REACHED`, `OVERLOAD`), el software conmuta de forma sincronizada el estado a `fault` y despliega la advertencia correspondiente al operador.

---

## 5. Logica de Dominio y Modelo Metrologico

### 5.1. Validacion de Parametros Iniciales

Antes de autorizar la transicion a estado armado (`ARM_TEST`), el software somete los datos ingresados a validacion estricta mediante Zod ([`src/lib/test-domain.ts`](src/lib/test-domain.ts)):

```typescript
export const testSetupSchema = z.object({
  specimenId: z.string().trim().min(1, "Identifique la probeta").max(80),
  material: z.string().trim().min(1, "Indique el material").max(120),
  gaugeLengthMm: z.coerce.number().positive("La longitud inicial debe ser mayor a cero"),
  areaMm2: z.coerce.number().positive("El área inicial debe ser mayor a cero"),
  calibrationProfileId: z.string().trim().min(1, "Seleccione un perfil de calibración")
});
```

### 5.2. Ecuaciones de Ingenieria Mecanica

Por cada trama `SAMPLE` validada por CRC, el software computa inmediatamente los parametros de ingenieria mediante la funcion `calculateEngineeringValues`:

1. **Esfuerzo de Ingenieria ($\sigma$):**

   $$\sigma = \frac{F}{A_0} \quad [\text{MPa}]$$

   Donde $F$ es la fuerza calibrada en Newtons [N] transmitida por el microcontrolador y $A_0$ es el area de la seccion transversal calibrada de la probeta en milimetros cuadrados [$\text{mm}^2$]. Dado que $1\text{ N/mm}^2 = 10^6\text{ Pa} = 1\text{ MPa}$, la unidad directa del sistema es Megapascales.

2. **Deformacion Unitaria de Ingenieria ($\varepsilon$):**

   $$\varepsilon = \frac{\Delta L}{L_0} \quad [\text{adimensional}]$$

   Donde $\Delta L$ es el desplazamiento medido en milimetros [mm] y $L_0$ es la longitud inicial calibrada (gauge length) entre marcas de la probeta en milimetros [mm]. En la interfaz grafica y reportes se presenta tambien como porcentaje: $\varepsilon\% = \varepsilon \times 100\%$.

### 5.3. Principio de Cero Inyeccion Sintetica

A diferencia de simuladores o software demostrativo, la base de codigo de UTM Lab no contiene generadores aleatorios de curvas ni algoritmos de interpolacion sintetica. El arreglo de muestras (`samplesRef`) permanece vacio hasta que el microcontrolador fisico transmite tramas autenticadas a traves del canal serial USB. Si la transmision se detiene o se corrompe, el grafico congela su trazo en el ultimo punto verificado.

---

## 6. Politica de Persistencia y Exportacion Cero-Cloud

### 6.1. Justificacion Tecnica del Diseno

Un ensayo de traccion a 10 Hz que se prolonga por 10 minutos produce 6,000 registros de telemetria multicampo. Almacenar este volumen de datos crudos en bases de datos relacionales en la nube (como PostgreSQL sobre Supabase) generaria:

1. Consumo acelerado de las cuotas de almacenamiento y ancho de banda en planes gratuitos o acotados.
2. Latencias innecesarias de sincronizacion de red que afectarian el rendimiento del navegador.
3. Riesgo de filtracion o perdida de propiedad intelectual sobre disenos de probetas y formulaciones experimentales.

Por este motivo, **la totalidad de las mediciones se almacena en memoria de acceso aleatorio (RAM) del navegador cliente** durante la sesion activa. La persistencia definitiva se delega a formatos de archivo estandarizados descargados localmente.

### 6.2. Generacion de Reportes en Formato PDF

El modulo [`src/lib/pdf-report.ts`](src/lib/pdf-report.ts) realiza la compilacion de un reporte formal metrologico directamente en el cliente mediante la biblioteca `jsPDF`:

1. **Rasterizacion Vectorial:** Clona el elemento `<svg>` generado por Recharts en el DOM, le asigna dimensiones estandares (escala 2x para calidad de impresion de 300 DPI), lo dibuja sobre un elemento `<canvas>` HTML5 con fondo solido y extrae una imagen PNG en codificacion Base64 Data URL.
2. **Encabezado y Metadatos:** Imprime numero de serie de reporte, fecha y hora de generacion, operador responsable, identificador de probeta, material ensayado, area de seccion inicial ($A_0$), longitud calibrada ($L_0$) y perfil de calibracion aplicado.
3. **Resumen Metrologico:** Calcula y consigna en tabla destacada:
   * Fuerza Maxima soportada: $F_{\text{max}}$ [N].
   * Esfuerzo Maximo (Resistencia a la Traccion / UTS): $\sigma_{\text{max}}$ [MPa].
   * Deformacion a Fuerza Maxima: $\varepsilon_{F\text{max}}$ [%].
   * Deformacion Ultima alcanzada: $\varepsilon_{\text{max}}$ [%].
   * Total de muestras adquiridas y numero de muestras descartadas por error de comunicacion.
4. **Insercion Grafica:** Inserta la curva esfuerzo-deformacion en alta definicion dentro de la primera pagina.
5. **Tabla de Muestras Representativas:** Genera una muestra decodificada a intervalos regulares que cubre el 100% de la extension del ensayo para verificacion visual sin necesidad de software externo.

### 6.3. Generacion y Descarga de Datos Crudos en CSV

El modulo [`src/lib/csv.ts`](src/lib/csv.ts) estructura la totalidad de la serie temporal en texto plano delimitado por comas:

1. **Seccion de Metadatos (Cabecera Semantica):**
   ```text
   "format","utm-lab-csv-v1"
   "specimen_id","PROBETA-PLA-001"
   "material","PLA Infill 100%"
   "gauge_length_mm","50"
   "initial_area_mm2","12.5"
   "calibration_profile_id","CAL-DEFAULT"
   "sample_count","1450"
   "detected_dropped_samples","0"
   ```
2. **Sanitizacion contra Inyeccion de Formulas (CSV Injection):** Para prevenir ataques de ejecucion de comandos en hojas de calculo (Microsoft Excel, LibreOffice Calc), cualquier valor de texto que inicie con caracteres de control de formulas (`=`, `+`, `-`, `@`, tabulador o retorno de carro) es prefijado con un apostrofe aislante (`'`).
3. **Matriz de Telemetria Completa:** Incluye columnas con encabezados tecnicos: `sequence`, `device_time_ms`, `force_raw`, `displacement_raw`, `force_n`, `displacement_mm`, `engineering_stress_mpa` y `engineering_strain`.

---

## 7. Modulo de Autenticacion, Seguridad y Persistencia en Supabase

Supabase se utiliza con un proposito estrictamente acotado: **autenticacion de operadores y control de sesiones seguras**.

### 7.1. Modelo Relacional y Politicas de Control de Acceso (RLS)

El esquema de base de datos ([`supabase/migrations/202609180001_initial.sql`](supabase/migrations/202609180001_initial.sql)) define la tabla `public.profiles`, vinculada mediante clave foranea a la tabla interna de usuarios del motor de autenticacion:

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'operator',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Operadores pueden ver su propio perfil" 
  on public.profiles for select 
  using (auth.uid() = id);

create policy "Operadores pueden actualizar su propio perfil" 
  on public.profiles for update 
  using (auth.uid() = id);
```

La activacion de **Row Level Security (RLS)** garantiza que ningun cliente pueda consultar o modificar registros pertenecientes a otros operadores, restringiendo las operaciones exclusivamente a la clave primaria coincidente con el UUID del token de sesion emitido (`auth.uid() = id`).

### 7.2. Trigger Automatizado de Registro

Para asegurar la integridad referencial sin requerir transacciones multiples desde la aplicacion web, se implementa una funcion en PL/pgSQL ejecutada con privilegios `SECURITY DEFINER`:

```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'Operador')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 7.3. Mecanismo Keep-Alive de Prevencion de Pausa

Las politicas de infraestructura de Supabase pausan de forma automatica los proyectos bajo plan gratuito que registren 7 dias consecutivos de inactividad total de base de datos. Para evitar la interrupcion del servicio en periodos no operativos del laboratorio, UTM Lab implementa un subsistema de mantenimiento:

1. **Endpoint de Verificacion ([`src/app/api/cron/keep-alive/route.ts`](src/app/api/cron/keep-alive/route.ts)):** Route handler HTTP `GET` protegido mediante token Bearer. Ejecuta una transaccion SQL minima (`SELECT id FROM profiles LIMIT 1`) que reactiva el contador de actividad en el motor de almacenamiento de PostgreSQL.
2. **Programacion de Tareas (Cron):** El archivo [`vercel.json`](vercel.json) programa la invocacion automatizada del endpoint cada 5 dias (`0 8 */5 * *`), garantizando un margen de 48 horas antes de alcanzar la ventana critica de congelamiento:
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/keep-alive",
         "schedule": "0 8 */5 * *"
       }
     ]
   }
   ```
3. **Mecanismo de Autenticacion del Cron:** Vercel inyecta de manera segura el encabezado `Authorization: Bearer <CRON_SECRET>`. Si el secreto recibido no coincide exactamente con el valor definido en variables de entorno, la peticion se rechaza con codigo `401 Unauthorized`.

### 7.4. Validacion y Verificacion Estricta de Correos de Operadores

Para mitigar el registro de cuentas fraudulentas o con direcciones de correo ficticias, el software aplica una estrategia de proteccion en dos capas:

1. **Filtro de Validacion en Cliente y Dominio (`src/lib/email-validation.ts`):**
   - **Analisis Sintactico:** Aplica validacion compatible con RFC 5322, verificando extensiones TLD legitimas de al menos dos caracteres.
   - **Lista Negra de Proveedores Desechables:** Bloquea de forma determinista proveedores de correo temporal y buzones descartables (`mailinator`, `yopmail`, `tempmail`, `10minutemail`, `guerrillamail`, entre otros).
   - **Bloqueo de Dominios Ficticios y Reservados:** Rechaza dominios genericos de prueba (`test.com`, `example.com`, `ficticio.com`, `asdf.com`, etc.) y patrones de usuario ficticios.
2. **Exigencia de Activacion por Correo Real (Supabase Confirm Email):**
   - La creacion de cuentas emite un token de confirmacion con callback seguro hacia `/auth/callback`.
   - Se restringe el acceso al panel instrumental hasta que el usuario demuestre propiedad del buzon mediante activacion por enlace.

---

## 8. Modulo de Asistencia Tecnica con Inteligencia Artificial

### 8.1. Arquitectura del Route Handler Serverless

El modulo de asistencia tecnica opera a traves de una ruta API serverless aislada en [`src/app/api/assistant/route.ts`](src/app/api/assistant/route.ts) bajo metodo `POST`.

### 8.2. Validacion de Sesion y Contexto de Ensayo

Para prevenir uso no autorizado y exposicion publica de la API de Google Gemini:

1. **Autenticacion de Origen:** El handler verifica el token de autorizacion en el encabezado `Authorization: Bearer <token>` consultando directamente la instancia de Supabase (`supabase.auth.getUser(token)`). Las solicitudes no autenticadas son rechazadas de inmediato.
2. **Esquema de Payload Zod:** La solicitud debe conformar de manera estricta el contrato de datos, que incluye el mensaje del usuario, historial previo y un objeto `context` compuesto por:
   * Estado de la maquina (`machineStatus`).
   * Ultimo mensaje de telemetria recibido por el puerto serial (`lastMessage`).
   * Dimensiones y material de la probeta (`specimen`: ID, material, longitud inicial, area transversal).
   * Metricas instantaneas y extremales (`telemetry`: fuerza actual/maxima, esfuerzo actual/maximo, deformacion actual/maxima, muestras adquiridas y muestras perdidas).
3. **Contexto de Sistema Especializado:** El servidor inyecta un prompt de sistema inmutable con conocimientos metrologicos avanzados:
   * Ley de Hooke ($\sigma = E \cdot \varepsilon$) y determinacion del Modulo de Young en el rango elastico lineal.
   * Criterio de limite elastico convencional por metodo de offset del 0.2% de deformacion plastica.
   * Normas internacionales de ensayo: **ASTM D638** (probetas Tipo IV y V para termoplasticos) e **ISO 527-1 / ISO 527-2**.
   * Identificacion de anomalias en la adquisicion: deslizamiento en mordazas (caida subita de esfuerzo sin fractura visible), fluencia termoplastica y concentracion de esfuerzos.

### 8.3. Aislamiento Operacional y Seguridad

El modelo de lenguaje funciona de manera estrictamente consultiva y pasiva. **El asistente de IA no posee enlaces de control, funciones RPC ni capacidad para emitir tramas de comando (`CMD`) hacia el microcontrolador**. Toda modificacion de parametros fisicos, armado de ensayos y detencion de motores requiere la intervencion directa y explicita del operador humano a traves de los controles de la interfaz.

---

## 9. Estructura Modular del Codigo Fuente

```text
Software/
+-- docs/
|   +-- SETUP.md                       Guia paso a paso de puesta en marcha
+-- firmware/
|   +-- utm_controller/
|       +-- utm_controller.ino         Codigo fuente del controlador para microcontrolador
+-- src/
|   +-- app/
|   |   +-- api/
|   |   |   +-- assistant/
|   |   |   |   +-- route.ts           Endpoint del asistente metrologico Gemini (POST)
|   |   |   +-- cron/
|   |   |       +-- keep-alive/
|   |   |           +-- route.ts       Endpoint de mantenimiento de actividad Supabase (GET)
|   |   +-- auth/
|   |   |   +-- callback/
|   |   |       +-- page.tsx           Manejador del ciclo de retorno de autenticacion
|   |   +-- dashboard/
|   |   |   +-- page.tsx               Panel de control instrumental y graficado en vivo
|   |   +-- globals.css                Definicion de directivas Tailwind y temas visuales
|   |   +-- layout.tsx                 Layout raiz del arbol de componentes
|   |   +-- page.tsx                   Pantalla de acceso y autenticacion de operadores
|   +-- hooks/
|   |   +-- use-serial-test-session.ts Hook de gestion del puerto serie, tramas y CRC
|   +-- lib/
|   |   +-- csv.ts                     Generacion y sanitizacion de archivos CSV
|   |   +-- email-validation.ts        Validacion y descarte de correos ficticios/desechables
|   |   +-- pdf-report.ts              Compilacion de reportes PDF y rasterizacion grafica
|   |   +-- supabase.ts                Instancia cliente de Supabase (singleton)
|   |   +-- test-domain.ts             Validacion de esquemas Zod, calculos y tipos
|   +-- types/
|       +-- web-serial.d.ts            Definiciones de tipos TypeScript para Web Serial API
+-- supabase/
|   +-- migrations/
|       +-- 202609180001_initial.sql   Script DDL inicial (tablas, politicas RLS y trigger)
+-- .env.example                       Plantilla formal de variables de configuracion
+-- eslint.config.mjs                  Configuracion de analisis estatico de codigo
+-- next.config.ts                     Configuracion del compilador Next.js y cabeceras HTTP
+-- package.json                       Definicion de dependencias y scripts de ejecucion
+-- tailwind.config.ts                 Configuracion de diseno y componentes visuales
+-- tsconfig.json                      Parametros del compilador TypeScript
+-- vercel.json                        Definicion de tareas programadas (Crons)
```

---

## 10. Requisitos de Entorno y Permisos del Navegador

### 10.1. Requisitos de Ejecucion

* **Entorno Node.js:** Version 20.x LTS o superior.
* **Gestor de paquetes:** npm 10.x o superior.
* **Navegador del Operador:** Google Chrome (version 89+) o Microsoft Edge (version 89+). Los navegadores Mozilla Firefox, Apple Safari y variantes en sistemas operativos moviles no implementan la Web Serial API y no son compatibles.

### 10.2. Contexto de Seguridad Criptografica (HTTPS) y Permisos

Por especificacion formal del consorcio W3C, la Web Serial API unicamente puede ejecutarse dentro de un **Contexto Seguro (Secure Context)**:

1. **Entorno local:** `http://localhost` o `http://127.0.0.1`.
2. **Entorno de produccion:** Requiere de forma obligatoria conexion cifrada bajo protocolo TLS/HTTPS con certificado valido.
3. **Cabecera de Politica de Permisos:** El archivo [`next.config.ts`](next.config.ts) declara de manera explicita la directiva HTTP necesaria para autorizar al navegador a solicitar interfaces serie:
   ```typescript
   headers: async () => [
     {
       source: "/(.*)",
       headers: [
         {
           key: "Permissions-Policy",
           value: "serial=(self)"
         }
       ]
     }
   ]
   ```

---

## 11. Procedimiento de Instalacion, Compilacion y Despliegue

### 11.1. Configuracion de Variables de Entorno

Crear el archivo `.env.local` en el directorio raiz del software a partir del archivo `.env.example`:

```bash
cp .env.example .env.local
```

Especificar los parametros de configuracion:

```dotenv
# Parametros publicos de Supabase (expuestos al cliente de autenticacion)
NEXT_PUBLIC_SUPABASE_URL=https://<identificador-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clave-publica-anonima-supabase>

# Clave de servicio para tareas administrativas (servidor unicamente)
SUPABASE_SERVICE_ROLE_KEY=<clave-secreta-service-role>

# Clave secreta para autorizacion de llamadas cron
CRON_SECRET=<cadena-aleatoria-de-autenticacion-sha256>

# Parametros privados de servidor para inferencia con IA
GEMINI_API_KEY=<clave-api-google-ai-studio>
GEMINI_MODEL=gemini-2.5-flash
```

### 11.2. Scripts del Ciclo de Desarrollo

En la terminal, dentro del directorio del software:

```bash
# Instalacion de dependencias declaradas
npm install

# Inicio del servidor de desarrollo local (puerto 3000)
npm run dev

# Verificacion estricta de tipos TypeScript sin emision de codigo
npm run typecheck

# Analisis estatico de sintaxis y reglas de diseno mediante ESLint
npm run lint

# Compilacion optimizada para produccion
npm run build

# Ejecucion del servidor de produccion compilado
npm run start
```

### 11.3. Despliegue en Infraestructura Serverless (Vercel)

1. Vincular el repositorio del proyecto en el panel de control de Vercel.
2. Si el codigo del software reside en un subdirectorio del repositorio, configurar la opcion **Root Directory** con el valor correspondiente (`Software`).
3. Registrar las variables de entorno detalladas en el apartado 11.1 dentro de **Settings -> Environment Variables**.
4. Ejecutar el despliegue (**Deploy**).
5. Verificar en el panel de **Settings -> Crons** que el trabajo `/api/cron/keep-alive` se encuentre registrado con la frecuencia correspondiente (`0 8 */5 * *`).
6. Configurar en el panel de Supabase (**Authentication -> URL Configuration**) la URL canonica asignada por Vercel (por ejemplo, `https://utm-lab.vercel.app`) y la ruta de retorno `https://utm-lab.vercel.app/auth/callback`.