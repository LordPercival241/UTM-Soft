#include <AccelStepper.h>
#include "HX711.h"

// =========================================================================
// ASIGNACIÓN DE PINES (ESTRICTO HARDWARE PROBADO)
// =========================================================================
#define STEP_PIN 18
#define DIR_PIN 19

const int LOADCELL_DOUT_PIN = 15;
const int LOADCELL_SCK_PIN  = 2;

#define BOTON_CERO   21
#define BOTON_LIMITE 5    // Fin de carrera / límite de ensayo en GPIO 5 (Pull-Up a GND)

AccelStepper stepper(AccelStepper::DRIVER, STEP_PIN, DIR_PIN);
HX711 balanza;

// =========================================================================
// CONFIGURACIÓN MECÁNICA Y DE ENSAYO UTM LAB
// =========================================================================
const float pasosPorVuelta = 1600.0;    // Microstepping DRV8825
const float mmPorVuelta    = 1.0;       // Avance real de husillo (mm por vuelta)
const float aceleracion    = 500.0;     // Pasos/s^2 para arranque suave

// Parámetros de velocidad
float velocidadPruebaMMs   = 0.5;       // Velocidad por defecto (mm/s)
const float pasosPorMM     = pasosPorVuelta / mmPorVuelta; 
float velocidadPasos       = velocidadPruebaMMs * pasosPorMM; 

// Variables compartidas entre núcleos (Sincronización atómica FreeRTOS)
volatile bool enEnsayo = false; 
volatile bool calibrandoDistancia = false; 
volatile bool solicitarTara = false; 

volatile float masaSincronizada = 0.0;
volatile long pasosSincronizados = 0;
volatile bool nuevoDatoListo = false;

long posicionInicial = 0; 
long pasosObjetivoCalibracion = 0; 
float distanciaCalibracionMM = 0.0; 

// =========================================================================
// CALIBRACIÓN DE CELDA DE CARGA (HX711)
// =========================================================================
const float PENDIENTE = -220.858444;
float offset = -213236.88; 

// =========================================================================
// VARIABLES DE CONTROL Y FREERTOS
// =========================================================================
int estadoAnteriorBotonCero   = HIGH; 
int estadoAnteriorBotonLimite = HIGH; 
TaskHandle_t TaskCelda; 
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED; // Mutex para par atómico (Masa, Pasos)

// Variables para el protocolo de comunicación serial
unsigned long secuenciaMuestra = 0;
unsigned long tiempoInicioEnsayo = 0;
String bufferSerialEntrante = "";
bool esperandoVelocidad = false;
bool esperandoDistancia = false;

// =========================================================================
// CÁLCULO DE CRC-16 CCITT (Compatible con Web Serial API)
// Polinomio 0x1021, Valor inicial 0xFFFF
// =========================================================================
uint16_t calcularCrc16Ccitt(const char* data, size_t length) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; i++) {
    crc ^= ((uint16_t)(uint8_t)data[i]) << 8;
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

void esperarHX711() {
  while (!balanza.is_ready()) {
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

long obtenerPromedio(int muestras = 10) {
  esperarHX711();
  return balanza.read_average(muestras);
}

// Declaraciones previas
void iniciarEnsayo();
void detenerEnsayo();
void ejecutarCalibracion(float distancia);
void procesarLineaComando(String linea);

// =========================================================================
// TAREA DEL NÚCLEO 0: CELDA DE CARGA (HX711 a 10 SPS)
// =========================================================================
void TareaCeldaCarga(void * pvParameters) {
  for (;;) {
    if (solicitarTara) {
      if (!enEnsayo) Serial.println("Tarando... no toques la celda.");
      offset = obtenerPromedio(15); // 15 muestras a 10 SPS = 1.5 s
      
      portENTER_CRITICAL(&mux);
      masaSincronizada = 0.0;
      portEXIT_CRITICAL(&mux);
      
      if (!enEnsayo) {
        Serial.print("Nuevo offset establecido: ");
        Serial.println(offset, 2);
      }
      solicitarTara = false;
    }

    if (balanza.is_ready()) {
      long adc;
      
      if (enEnsayo) {
        // Captura síncrona: instante exacto en que baja DOUT con posición de motor
        long pasosInstante = stepper.currentPosition() - posicionInicial;
        adc = balanza.read(); 
        
        float peso = (adc - offset) / PENDIENTE;
        if (abs(peso) < 0.05) peso = 0.0;

        portENTER_CRITICAL(&mux);
        pasosSincronizados = pasosInstante;
        masaSincronizada = peso;
        nuevoDatoListo = true;
        portEXIT_CRITICAL(&mux);
      } else {
        adc = balanza.read_average(3);
        float peso = (adc - offset) / PENDIENTE;
        if (abs(peso) < 0.05) peso = 0.0;

        if (!calibrandoDistancia) {
          Serial.print("Peso: ");
          Serial.print(peso, 2);
          Serial.println(" g");
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(5)); 
  }
}

// =========================================================================
// SETUP (NÚCLEO 1): ARRANQUE RÁPIDO Y NO BLOQUEANTE
// =========================================================================
void setup() {
  Serial.setTxBufferSize(512); // Buffer de transmisión expandido para evitar bloqueo de pulsos del motor
  Serial.begin(115200);
  delay(200); // Retardo breve para inicialización de hardware sin demoras

  pinMode(BOTON_CERO, INPUT_PULLUP);
  pinMode(BOTON_LIMITE, INPUT_PULLUP);

  stepper.setPinsInverted(true, false, false);
  stepper.setAcceleration(aceleracion);
  stepper.setMaxSpeed(velocidadPasos);

  balanza.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);

  // Tarea en Núcleo 0 para adquisición ininterrumpida de carga
  xTaskCreatePinnedToCore(
    TareaCeldaCarga,   
    "CeldaCarga",      
    10000,             
    NULL,              
    2, 
    &TaskCelda,        
    0                  
  );

  Serial.println("ACK,status=OK,firmware=UTMachine_v4.0");
}

// =========================================================================
// LOOP PRINCIPAL (NÚCLEO 1): MOTOR, FINES DE CARRERA Y COMANDOS
// =========================================================================
void loop() {
  int estadoBotonCero   = digitalRead(BOTON_CERO);
  int estadoBotonLimite = digitalRead(BOTON_LIMITE);

  bool limiteActivado = (estadoBotonLimite == LOW && estadoAnteriorBotonLimite == HIGH);
  bool ceroActivado   = (estadoBotonCero == LOW && estadoAnteriorBotonCero == HIGH);

  // 1. Recepción y ensamble de caracteres seriales (No bloqueante)
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (bufferSerialEntrante.length() > 0) {
        procesarLineaComando(bufferSerialEntrante);
        bufferSerialEntrante = "";
      }
    } else {
      if (bufferSerialEntrante.length() < 128) {
        bufferSerialEntrante += c;
      }
    }
  }

  // 2. Control durante el ensayo activo
  if (enEnsayo) {
    stepper.runSpeed();

    if (nuevoDatoListo) {
      long pasosCopiar;
      float masaCopiar;

      portENTER_CRITICAL(&mux);
      pasosCopiar = pasosSincronizados;
      masaCopiar  = masaSincronizada;
      nuevoDatoListo = false;
      portEXIT_CRITICAL(&mux);

      float desplazamientoMM = pasosCopiar / pasosPorMM;
      float fuerzaCopiar = (masaCopiar / 1000.0) * 9.80665;
      long adcCrudo = (long)(masaCopiar * PENDIENTE + offset);

      // Telemetría para plataforma Web UTMachine Lab con CRC-16 CCITT
      char payload[160];
      snprintf(payload, sizeof(payload),
               "SAMPLE,seq=%lu,t_ms=%lu,force_raw=%ld,displacement_raw=%ld,force_n=%.3f,displacement_mm=%.3f",
               secuenciaMuestra++, millis() - tiempoInicioEnsayo, adcCrudo, pasosCopiar, fuerzaCopiar, desplazamientoMM);
      uint16_t crc = calcularCrc16Ccitt(payload, strlen(payload));
      char fullPacket[190];
      snprintf(fullPacket, sizeof(fullPacket), "%s,crc=%04X", payload, crc);
      Serial.println(fullPacket);
    }

    // Paradas por sensores de seguridad físicos
    if (limiteActivado) {
      detenerEnsayo();
      Serial.println("EVENT,type=LIMIT_REACHED,detail=Fin_de_carrera_activado_(GPIO_5)");
      Serial.println("--- ENSAYO DETENIDO: LÍMITE ALCANZADO (GPIO 5) ---");
    } else if (ceroActivado) {
      detenerEnsayo();
      Serial.println("EVENT,type=LIMIT_REACHED,detail=Boton_cero_presionado_(GPIO_21)");
      Serial.println("--- ENSAYO DETENIDO POR BOTÓN CERO (GPIO 21) ---");
    }
  }

  // 3. Ejecución de movimiento de calibración manual
  if (calibrandoDistancia) {
    stepper.runSpeed();

    long pasosActuales = abs(stepper.currentPosition() - posicionInicial);
    long pasosMeta = abs(pasosObjetivoCalibracion);

    static unsigned long ultimoReporteCal = 0;
    if (millis() - ultimoReporteCal >= 200) {
      ultimoReporteCal = millis();
      float avanceMM = (stepper.currentPosition() - posicionInicial) / pasosPorMM;
      Serial.print("Calibrando... Avance: ");
      Serial.print(avanceMM, 3);
      Serial.print(" / ");
      Serial.print(distanciaCalibracionMM, 3);
      Serial.println(" mm");
    }

    if (pasosActuales >= pasosMeta) {
      stepper.setSpeed(0);
      calibrandoDistancia = false;
      Serial.print("--- CALIBRACIÓN COMPLETADA (");
      Serial.print(distanciaCalibracionMM, 3);
      Serial.println(" mm) ---");
    }

    if (limiteActivado || ceroActivado) {
      detenerEnsayo(); 
      Serial.println("EVENT,type=LIMIT_REACHED,detail=Calibracion_interrumpida_por_boton");
      Serial.println("--- CALIBRACIÓN DETENIDA POR BOTÓN LÍMITE ---");
    }
  }
  
  estadoAnteriorBotonCero   = estadoBotonCero;
  estadoAnteriorBotonLimite = estadoBotonLimite;
}

// =========================================================================
// PARSERS DE PROTOCOLO: WEB Y TRADICIONAL
// =========================================================================
void procesarComandoWeb(const String& cmdLine) {
  String id = "";
  String type = "";
  String distance = "";
  
  int startIdx = 4; // Desplaza "CMD,"
  while (startIdx < cmdLine.length()) {
    int nextComma = cmdLine.indexOf(',', startIdx);
    if (nextComma == -1) nextComma = cmdLine.length();
    
    String token = cmdLine.substring(startIdx, nextComma);
    token.trim();
    int eqIdx = token.indexOf('=');
    if (eqIdx != -1) {
      String key = token.substring(0, eqIdx);
      String val = token.substring(eqIdx + 1);
      key.trim();
      val.trim();
      if (key == "id") id = val;
      else if (key == "type") type = val;
      else if (key == "distance") distance = val;
    }
    startIdx = nextComma + 1;
  }

  if (type == "HELLO") {
    Serial.print("ACK,id=");
    Serial.print(id);
    Serial.println(",status=OK,firmware=UTMachine_v4.0");
  } else if (type == "ARM_TEST") {
    Serial.print("ACK,id=");
    Serial.print(id);
    Serial.println(",status=OK");
  } else if (type == "START_TEST") {
    iniciarEnsayo();
    Serial.print("ACK,id=");
    Serial.print(id);
    Serial.println(",status=OK");
  } else if (type == "STOP_TEST") {
    detenerEnsayo();
    Serial.print("ACK,id=");
    Serial.print(id);
    Serial.println(",status=OK");
    Serial.println("EVENT,type=TEST_FINISHED,detail=Ensayo_detenido_por_operador");
  } else if (type == "TARE" || type == "CALIBRATE_ZERO") {
    solicitarTara = true;
    Serial.print("ACK,id=");
    Serial.print(id);
    Serial.println(",status=OK");
  } else if (type == "JOG" || type == "MOVE" || type == "CALIBRATE_DISTANCE") {
    float dist = distance.toFloat();
    ejecutarCalibracion(dist);
    Serial.print("ACK,id=");
    Serial.print(id);
    Serial.println(",status=OK");
  } else {
    Serial.print("ACK,id=");
    Serial.print(id);
    Serial.println(",status=OK");
  }
}

void procesarLineaComando(String linea) {
  linea.trim();
  if (linea.length() == 0) return;

  // Si proviene de la plataforma web
  if (linea.startsWith("CMD,")) {
    procesarComandoWeb(linea);
    return;
  }

  // Si la línea contiene HELLO de forma directa
  if (linea.indexOf("HELLO") != -1) {
    Serial.println("ACK,status=OK,firmware=UTMachine_v4.0");
    return;
  }

  // Comandos de terminal / Python
  char primerChar = toupper(linea.charAt(0));

  if (primerChar == 'S') {
    iniciarEnsayo();
  } else if (primerChar == 'E') {
    detenerEnsayo();
  } else if (primerChar == 'T') {
    solicitarTara = true;
  } else if (primerChar == 'V') {
    if (linea.length() > 1) {
      float vel = linea.substring(1).toFloat();
      if (vel > 0.0) {
        velocidadPruebaMMs = vel;
        velocidadPasos = velocidadPruebaMMs * pasosPorMM;
        stepper.setMaxSpeed(velocidadPasos);
        Serial.print("-> Velocidad configurada: ");
        Serial.print(velocidadPruebaMMs, 3);
        Serial.println(" mm/s");
      }
    } else {
      esperandoVelocidad = true;
      Serial.println("Ingrese velocidad en mm/s:");
    }
  } else if (primerChar == 'C') {
    if (linea.length() > 1) {
      float dist = linea.substring(1).toFloat();
      ejecutarCalibracion(dist);
    } else {
      esperandoDistancia = true;
      Serial.println("Ingrese distancia en mm:");
    }
  } else {
    if (esperandoVelocidad) {
      float vel = linea.toFloat();
      if (vel > 0.0) {
        velocidadPruebaMMs = vel;
        velocidadPasos = velocidadPruebaMMs * pasosPorMM;
        stepper.setMaxSpeed(velocidadPasos);
        Serial.print("-> Velocidad configurada: ");
        Serial.print(velocidadPruebaMMs, 3);
        Serial.println(" mm/s");
      }
      esperandoVelocidad = false;
    } else if (esperandoDistancia) {
      float dist = linea.toFloat();
      ejecutarCalibracion(dist);
      esperandoDistancia = false;
    } else {
      // Recepción segura de velocidad numérica directa enviada por scripts al iniciar
      float posibleVel = linea.toFloat();
      if (posibleVel > 0.0 && posibleVel <= 20.0 && !enEnsayo && !calibrandoDistancia) {
        velocidadPruebaMMs = posibleVel;
        velocidadPasos = velocidadPruebaMMs * pasosPorMM;
        stepper.setMaxSpeed(velocidadPasos);
      }
    }
  }
}

// =========================================================================
// ACCIONES DEL MOTOR (NÚCLEO 1)
// =========================================================================
void iniciarEnsayo() {
  if (calibrandoDistancia || enEnsayo) return;

  secuenciaMuestra = 0;
  tiempoInicioEnsayo = millis();

  // Rampa de aceleración suave
  for (float v = 50; v <= velocidadPasos; v += 25) {
    stepper.setSpeed(v);
    unsigned long t = millis();
    while (millis() - t < 10) {
      if (digitalRead(BOTON_LIMITE) == LOW || digitalRead(BOTON_CERO) == LOW) {
        detenerEnsayo();
        Serial.println("EVENT,type=LIMIT_REACHED,detail=Arranque_cancelado_por_boton");
        Serial.println("--- ARRANQUE CANCELADO POR BOTÓN LÍMITE ---");
        return;
      }
      stepper.runSpeed();
    }
  }

  stepper.setSpeed(velocidadPasos);
  posicionInicial = stepper.currentPosition();
  
  portENTER_CRITICAL(&mux);
  nuevoDatoListo = false;
  portEXIT_CRITICAL(&mux);
  
  enEnsayo = true;
}

void detenerEnsayo() {
  if (!enEnsayo && !calibrandoDistancia) return;
  enEnsayo = false;
  calibrandoDistancia = false;
  stepper.setSpeed(0);
  Serial.println("--- MOTOR DETENIDO ---");
}

void ejecutarCalibracion(float distancia) {
  if (enEnsayo) {
    Serial.println("Detenga el ensayo ('E') antes de calibrar.");
    return;
  }
  if (distancia == 0.0) {
    Serial.println("Distancia invalida o 0. Calibracion cancelada.");
    return;
  }

  distanciaCalibracionMM = distancia;
  pasosObjetivoCalibracion = round(distanciaCalibracionMM * pasosPorMM);
  int direccion = (distanciaCalibracionMM > 0) ? 1 : -1;

  Serial.print("Iniciando calibracion: ");
  Serial.print(distanciaCalibracionMM, 3);
  Serial.print(" mm (");
  Serial.print(abs(pasosObjetivoCalibracion));
  Serial.println(" pasos)...");

  for (float v = 50; v <= velocidadPasos; v += 25) {
    stepper.setSpeed(v * direccion);
    unsigned long t = millis();
    while (millis() - t < 10) {
      if (digitalRead(BOTON_LIMITE) == LOW || digitalRead(BOTON_CERO) == LOW) {
        detenerEnsayo();
        Serial.println("EVENT,type=LIMIT_REACHED,detail=Calibracion_cancelada_por_boton");
        Serial.println("--- CALIBRACIÓN CANCELADA POR BOTÓN LÍMITE ---");
        return;
      }
      stepper.runSpeed();
    }
  }

  stepper.setSpeed(velocidadPasos * direccion);
  posicionInicial = stepper.currentPosition();
  calibrandoDistancia = true;
}
