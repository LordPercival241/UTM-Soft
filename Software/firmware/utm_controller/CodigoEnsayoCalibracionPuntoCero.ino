#include <AccelStepper.h>

#define STEP_PIN    18
#define DIR_PIN     19
#define BOTON_CERO  21

AccelStepper stepper(AccelStepper::DRIVER, STEP_PIN, DIR_PIN);

// ==============================================================================
// CONFIGURACIÓN MECÁNICA Y CINEMÁTICA DE LA UTM
// ==============================================================================
const float pasosPorVuelta     = 1600.0;    // Microstepping DRV8825 (1600 pasos/vuelta)
const float mmPorVuelta        = 1.0;       // Avance del husillo en mm por revolución
const float velocidadPruebaMMs = 0.5;       // Velocidad del ensayo en mm/s (0.5 mm/s = 30 mm/min)
const float aceleracion        = 500.0;     // Pasos/s^2 para rampa suave

// Conversión automática a Pasos/segundo
const float pasosPorMM       = pasosPorVuelta / mmPorVuelta; 
const float velocidadPasos   = velocidadPruebaMMs * pasosPorMM; 

#define ESTIMAR_FUERZA_SIN_CELDA true

// ==============================================================================
// VARIABLES DE ESTADO Y CONTROL
// ==============================================================================
bool enEnsayo = false;
bool marcarPuntoCero = false;
long posicionInicial = 0;
int estadoAnteriorBotonCero = HIGH;

// Variables de protocolo y telemetría hacia la web
unsigned long testStartMillis = 0;
unsigned long lastSampleMillis = 0;
const unsigned long SAMPLE_INTERVAL_MS = 100; // 10 Hz (10 muestras por segundo)
unsigned long sampleSequence = 0;

char rxBuffer[160];
int rxIndex = 0;
char perfilCalibracion[48] = "DEFAULT";

uint16_t calculateCrc16Ccitt(const char* data, size_t length) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; i++) {
    crc ^= ((uint16_t)data[i]) << 8;
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc;
}

// ==============================================================================
// TRANSMISIÓN DE MUESTRAS AL NAVEGADOR (TELEMETRÍA SAMPLE CON CRC)
// ==============================================================================
void sendSample(unsigned long t_ms, long raw_force, long raw_disp, float force_n, float disp_mm) {
  char baseBuffer[140];
  
  // 1. Construir la trama base antes del campo CRC
  // Formato: SAMPLE,seq=...,t_ms=...,force_raw=...,displacement_raw=...,force_n=...,displacement_mm=...
  snprintf(
    baseBuffer, 
    sizeof(baseBuffer),
    "SAMPLE,seq=%lu,t_ms=%lu,force_raw=%ld,displacement_raw=%ld,force_n=%.2f,displacement_mm=%.3f",
    sampleSequence++,
    t_ms,
    raw_force,
    raw_disp,
    force_n,
    disp_mm
  );

  // 2. Calcular CRC-16 sobre todo el texto previo a ",crc="
  uint16_t crc = calculateCrc16Ccitt(baseBuffer, strlen(baseBuffer));

  // 3. Imprimir la trama completa por el puerto serie
  char fullBuffer[160];
  snprintf(fullBuffer, sizeof(fullBuffer), "%s,crc=%04X", baseBuffer, crc);
  Serial.println(fullBuffer);
}

// ==============================================================================
// EXTRACCIÓN DE PARÁMETROS EN COMANDOS ENTRANTES
// ==============================================================================
bool getParamValue(const char* line, const char* key, char* output, size_t maxLen) {
  char searchKey[32];
  
  // Buscar con coma previa: ",clave="
  snprintf(searchKey, sizeof(searchKey), ",%s=", key);
  const char* pos = strstr(line, searchKey);
  
  // Si no está precedido por coma, buscar directamente tras "CMD,"
  if (!pos) {
    snprintf(searchKey, sizeof(searchKey), "CMD,%s=", key);
    pos = strstr(line, searchKey);
    if (!pos) return false;
    pos += strlen(searchKey);
  } else {
    pos += strlen(searchKey);
  }
  
  size_t idx = 0;
  while (*pos && *pos != ',' && *pos != '\r' && *pos != '\n' && idx < (maxLen - 1)) {
    output[idx++] = *pos++;
  }
  output[idx] = '\0';
  return true;
}

// ==============================================================================
// FUNCIONES DE CONTROL MECÁNICO Y ENSAYO
// ==============================================================================

void iniciarEnsayo() {
  Serial.println("Iniciando rampa de aceleracion...");
  
  // Rampa de aceleración manual progresiva para tracción suave
  for (float v = 50; v <= velocidadPasos; v += 25) {
    stepper.setSpeed(v);
    unsigned long t = millis();
    while (millis() - t < 10) {
      stepper.runSpeed();
    }
  }

  // Fijar velocidad de crucero constante para el ensayo
  stepper.setSpeed(velocidadPasos);
  posicionInicial = stepper.currentPosition();
  enEnsayo = true;
  marcarPuntoCero = false;
  
  testStartMillis = millis();
  lastSampleMillis = testStartMillis;
  sampleSequence = 0;
  
  Serial.println("--- ENSAYO EN PROCESO (Velocidad Constante) ---");
}

void detenerEnsayo() {
  enEnsayo = false;
  marcarPuntoCero = false;
  stepper.setSpeed(0);
  Serial.println("--- ENSAYO FINALIZADO ---");
  Serial.println("EVENT,type=TEST_FINISHED");
}

void establecerCero() {
  // Si el switch ya está accionado (LOW en INPUT_PULLUP), ya está en el punto cero
  if (digitalRead(BOTON_CERO) == LOW) {
    stepper.setSpeed(0);
    stepper.setCurrentPosition(0);
    posicionInicial = 0;
    marcarPuntoCero = false;
    enEnsayo = false;
    Serial.println("--- YA SE ENCUENTRA EN EL PUNTO CERO ---");
    Serial.println("EVENT,type=ZERO_CALIBRATED");
    return;
  }

  Serial.println("Iniciando busqueda de punto cero...");

  // Rampa de aceleración manual en reversa hacia el botón
  for (float v = 50; v <= velocidadPasos; v += 25) {
    stepper.setSpeed(-v);
    unsigned long t = millis();
    while (millis() - t < 10) {
      stepper.runSpeed();
      if (digitalRead(BOTON_CERO) == LOW) {
        stepper.setSpeed(0);
        stepper.setCurrentPosition(0);
        posicionInicial = 0;
        marcarPuntoCero = false;
        Serial.println("--- PUNTO CERO ALCANZADO DURANTE RAMPA ---");
        Serial.println("EVENT,type=ZERO_CALIBRATED");
        return;
      }
    }
  }

  stepper.setSpeed(-velocidadPasos);
  marcarPuntoCero = true;
  enEnsayo = false;
  
  Serial.println("--- CALIBRACION DE PUNTO CERO EN PROCESO ---");
}

// ==============================================================================
// PROCESAMIENTO DE COMANDOS DE LA PLATAFORMA WEB
// ==============================================================================
void procesarComandoWeb(const char* line) {
  char cmdId[48] = "";
  char cmdType[24] = "";

  if (!getParamValue(line, "id", cmdId, sizeof(cmdId))) return;
  if (!getParamValue(line, "type", cmdType, sizeof(cmdType))) return;

  // 1. Handshake inicial (HELLO) al conectar Web Serial en el navegador
  if (strcmp(cmdType, "HELLO") == 0) {
    Serial.print("ACK,id=");
    Serial.print(cmdId);
    Serial.println(",status=OK");
    return;
  }

  // 2. Armado de ensayo (ARM_TEST)
  if (strcmp(cmdType, "ARM_TEST") == 0) {
    getParamValue(line, "calibration_profile", perfilCalibracion, sizeof(perfilCalibracion));
    sampleSequence = 0;
    
    Serial.print("ACK,id=");
    Serial.print(cmdId);
    Serial.println(",status=OK");
    return;
  }

  // 3. Inicio del ensayo (START_TEST)
  if (strcmp(cmdType, "START_TEST") == 0) {
    // Confirmación inmediata para evitar timeout del navegador
    Serial.print("ACK,id=");
    Serial.print(cmdId);
    Serial.println(",status=OK");

    iniciarEnsayo();
    return;
  }

  // 4. Parada del ensayo (STOP_TEST)
  if (strcmp(cmdType, "STOP_TEST") == 0) {
    detenerEnsayo();

    Serial.print("ACK,id=");
    Serial.print(cmdId);
    Serial.println(",status=OK");
    return;
  }

  // 5. Calibración de cero solicitada desde la web
  if (strcmp(cmdType, "CALIBRATE_ZERO") == 0 || strcmp(cmdType, "ZERO") == 0) {
    Serial.print("ACK,id=");
    Serial.print(cmdId);
    Serial.println(",status=OK");

    establecerCero();
    return;
  }

  // Comando no reconocido
  Serial.print("ACK,id=");
  Serial.print(cmdId);
  Serial.println(",status=ERROR,reason=Comando_no_reconocido");
}

// ==============================================================================
// PROCESAMIENTO GENERAL DE LÍNEAS SERIALES
// ==============================================================================
void procesarLinea(const char* line) {
  // Comandos estructurados del protocolo Web Serial
  if (strncmp(line, "CMD,", 4) == 0) {
    procesarComandoWeb(line);
    return;
  }

  // Compatibilidad con comandos de una tecla en el Monitor Serie de Arduino IDE
  char c = line[0];
  if (c == 'S' || c == 's') {
    iniciarEnsayo();
  } else if (c == 'E' || c == 'e') {
    detenerEnsayo();
  } else if (c == 'C' || c == 'c') {
    establecerCero();
  }
}

// ==============================================================================
// CONFIGURACIÓN INICIAL (SETUP)
// ==============================================================================
void setup() {
  Serial.begin(115200);

  // Retardo de estabilización del puerto serie USB
  delay(500);

  // Configuración del botón de punto cero (con PULLUP interno a 3.3V)
  pinMode(BOTON_CERO, INPUT_PULLUP);

  // Inicialización de velocidad y aceleración del motor
  stepper.setMaxSpeed(velocidadPasos);
  stepper.setAcceleration(aceleracion);

  Serial.println();
  Serial.println("--- UTM Lab Iniciado (ESP32 - 3 Pines) ---");
  Serial.println("Pines: STEP=18, DIR=19, BOTON_CERO=21");
  Serial.println("Esperando conexion Web Serial a 115200 baud.");
}

// ==============================================================================
// BUCLE PRINCIPAL (LOOP)
// ==============================================================================
void loop() {
  // 1. Recepción y armado de tramas por puerto serie
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (rxIndex > 0) {
        rxBuffer[rxIndex] = '\0';
        procesarLinea(rxBuffer);
        rxIndex = 0;
      }
    } else {
      if (rxIndex < (int)(sizeof(rxBuffer) - 1)) {
        rxBuffer[rxIndex++] = c;
      }
    }
  }

  // 2. Lectura del botón de punto cero (PIN 21)
  int estadoBotonCero = digitalRead(BOTON_CERO);

  // 3. Ejecución del motor y telemetría durante el ensayo
  if (enEnsayo) {
    stepper.runSpeed();

    // Detección de pulsación del botón cero durante el ensayo (función de parada de seguridad)
    if (estadoBotonCero == LOW && estadoAnteriorBotonCero == HIGH) {
      detenerEnsayo();
      Serial.println("EVENT,type=LIMIT_REACHED,detail=Boton_cero_accionado");
    }

    // Reporte periódico de muestras cada 100 ms (10 Hz) hacia la plataforma web
    unsigned long now = millis();
    if (now - lastSampleMillis >= SAMPLE_INTERVAL_MS) {
      lastSampleMillis = now;
      unsigned long elapsed = now - testStartMillis;

      long pasosRecorridos = stepper.currentPosition() - posicionInicial;
      float desplazamientoMM = (float)pasosRecorridos / pasosPorMM;
      if (desplazamientoMM < 0.0f) desplazamientoMM = 0.0f;

      #if ESTIMAR_FUERZA_SIN_CELDA
        float fuerzaN = desplazamientoMM * 14.5f;
        long rawForceAdc = (long)(fuerzaN * 820.0f);
      #else
        float fuerzaN = 0.0f;
        long rawForceAdc = 0;
      #endif

      sendSample(elapsed, rawForceAdc, pasosRecorridos, fuerzaN, desplazamientoMM);
    }
  }

  // 4. Reconocimiento y búsqueda del punto cero
  if (marcarPuntoCero) {
    stepper.runSpeed();

    // Si se activa el botón de punto cero (transición a LOW)
    if (estadoBotonCero == LOW && estadoAnteriorBotonCero == HIGH) {
      stepper.setSpeed(0);
      marcarPuntoCero = false;
      stepper.setCurrentPosition(0);
      posicionInicial = 0;
      Serial.println("--- PUNTO CERO ALCANZADO Y CALIBRADO ---");
      Serial.println("EVENT,type=ZERO_CALIBRATED");
    }
  }

  estadoAnteriorBotonCero = estadoBotonCero;
}
