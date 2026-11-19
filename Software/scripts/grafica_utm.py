import serial
import serial.tools.list_ports
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from matplotlib.widgets import Button
import csv
import time
from datetime import datetime

# =========================================================================
# CONFIGURACIÓN DEL PUERTO SERIAL
# =========================================================================
PUERTO = 'COM7'          # Ajuste al puerto activo del ESP32 (ej. 'COM4', 'COM7')
BAUDIOS = 115200
VELOCIDAD_INICIAL = 0.5  # mm/s

# Inicializar conexión serial
try:
    ser = serial.Serial(PUERTO, BAUDIOS, timeout=0.05)
    time.sleep(2.0)      # Estabilización inicial tras apertura del puerto
    ser.reset_input_buffer()
    print(f"Conectado a {PUERTO} | {BAUDIOS} baudios | Velocidad: {VELOCIDAD_INICIAL} mm/s")
except Exception as e:
    print(f"Error al abrir {PUERTO}: {e}")
    print("Puertos disponibles en el sistema:", [p.device for p in serial.tools.list_ports.comports()])
    exit(1)

# Listas de telemetría del ensayo
desplazamientos = []
fuerzas = []
ensayo_activo = False
velocidad_actual = VELOCIDAD_INICIAL

# =========================================================================
# CONFIGURACIÓN DE LA GRÁFICA MATPLOTLIB
# =========================================================================
fig, ax = plt.subplots(figsize=(11, 7.5))
plt.subplots_adjust(bottom=0.28, top=0.92)

linea, = ax.plot([], [], color='#1f77b4', linewidth=2, label='Curva Fuerza vs Desplazamiento')
ax.set_title("Ensayo UTM Lab en Tiempo Real (ESP32)", fontsize=14, fontweight='bold')
ax.set_xlabel("Desplazamiento (mm)", fontsize=12)
ax.set_ylabel("Fuerza (N)", fontsize=12)
ax.grid(True, linestyle='--', alpha=0.6)
ax.legend(loc="upper left")

# Indicador de estado en pantalla (HUD)
texto_valores = ax.text(
    0.02, 0.85,
    f"Desplazamiento: 0.000 mm\nFuerza: 0.000 N\nVelocidad: {velocidad_actual:.2f} mm/s",
    transform=ax.transAxes, fontsize=10,
    bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5)
)

# =========================================================================
# FUNCIONES DE CONTROL Y TRANSMISIÓN SERIAL
# =========================================================================
def actualizar_hud():
    d = desplazamientos[-1] if desplazamientos else 0.0
    f = fuerzas[-1] if fuerzas else 0.0
    texto_valores.set_text(
        f"Desplazamiento: {d:.3f} mm\nFuerza: {f:.3f} N\nVelocidad: {velocidad_actual:.2f} mm/s"
    )
    fig.canvas.draw_idle()

def enviar_tarar(event):
    try:
        ser.write(b'T\n')
        print("Comando enviado: TARAR ('T')")
    except Exception as e:
        print(f"Error al enviar tara: {e}")

def enviar_iniciar(event):
    global ensayo_activo
    desplazamientos.clear()
    fuerzas.clear()
    linea.set_data([], [])
    ensayo_activo = True
    try:
        ser.write(b'S\n')
        print("Comando enviado: INICIAR ENSAYO ('S')")
    except Exception as e:
        print(f"Error al iniciar ensayo: {e}")
    actualizar_hud()

def enviar_detener(event):
    global ensayo_activo
    try:
        ser.write(b'E\n')
        print("Comando enviado: DETENER ENSAYO ('E')")
    except Exception as e:
        print(f"Error al detener ensayo: {e}")
    if ensayo_activo:
        ensayo_activo = False
        guardar_csv()

def configurar_velocidad(vel):
    global velocidad_actual
    if ensayo_activo:
        print("Detenga el ensayo antes de cambiar la velocidad.")
        return
    try:
        ser.write(f"V{vel}\n".encode('utf-8'))
        velocidad_actual = vel
        print(f"Comando enviado: VELOCIDAD -> {vel} mm/s")
        actualizar_hud()
    except Exception as e:
        print(f"Error al configurar velocidad: {e}")

def mover_calibracion(dist_mm):
    if ensayo_activo:
        print("Detenga el ensayo antes de calibrar distancia.")
        return
    try:
        ser.write(f"C{dist_mm}\n".encode('utf-8'))
        print(f"Comando enviado: CALIBRAR -> {dist_mm} mm")
    except Exception as e:
        print(f"Error al calibrar distancia: {e}")

def guardar_csv():
    if not desplazamientos:
        return
    nombre_archivo = f"ensayo_utm_{velocidad_actual}mms_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    try:
        with open(nombre_archivo, mode='w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(["Desplazamiento_mm", "Fuerza_N"])
            for d, f_val in zip(desplazamientos, fuerzas):
                writer.writerow([f"{d:.4f}", f"{f_val:.4f}"])
        print(f"--> Datos guardados exitosamente en: {nombre_archivo}")
    except Exception as e:
        print(f"Error al guardar archivo CSV: {e}")

# =========================================================================
# INTERFAZ GRÁFICA: BOTONES (3 FILAS)
# =========================================================================
# --- FILA 1: Control Principal de Ensayo ---
ax_tarar   = plt.axes([0.125, 0.16, 0.23, 0.055])
ax_iniciar = plt.axes([0.385, 0.16, 0.23, 0.055])
ax_detener = plt.axes([0.645, 0.16, 0.23, 0.055])

btn_tarar   = Button(ax_tarar,   'Tarar (T)',   color='#f0f0f0', hovercolor='#d9d9d9')
btn_iniciar = Button(ax_iniciar, 'Iniciar (S)', color='#a8e6cf', hovercolor='#88d8b0')
btn_detener = Button(ax_detener, 'Detener (E)', color='#ff8b94', hovercolor='#ff6f69')

btn_tarar.on_clicked(enviar_tarar)
btn_iniciar.on_clicked(enviar_iniciar)
btn_detener.on_clicked(enviar_detener)

# --- FILA 2: Selector de Velocidad ---
fig.text(0.125, 0.11, "Velocidad (mm/s):", fontsize=10, fontweight='bold', va='center')
velocidades = [0.5, 0.25, 0.15]
botones_vel = []

for i, v in enumerate(velocidades):
    ax_v = plt.axes([0.28 + i * 0.20, 0.088, 0.18, 0.045])
    btn_v = Button(ax_v, f"{v} mm/s", color='#dcedc1', hovercolor='#c5e1a5')
    btn_v.on_clicked(lambda event, val=v: configurar_velocidad(val))
    botones_vel.append(btn_v)

# --- FILA 3: Movimiento Manual / Calibración (+100, +50, +10, +1, -1, -10, -50, -100) ---
fig.text(0.08, 0.042, "Mover (mm):", fontsize=10, fontweight='bold', va='center')
distancias_cal = [100, 50, 10, 1, -1, -10, -50, -100]
botones_cal = []

ancho_btn = 0.085
separacion = 0.095
x_inicio = 0.20

for i, dist in enumerate(distancias_cal):
    ax_c = plt.axes([x_inicio + i * separacion, 0.02, ancho_btn, 0.045])
    etiqueta = f"+{dist}" if dist > 0 else f"{dist}"
    color_btn = '#bbdefb' if dist > 0 else '#ffe0b2'
    hover_btn = '#90caf9' if dist > 0 else '#ffcc80'

    btn_c = Button(ax_c, etiqueta, color=color_btn, hovercolor=hover_btn)
    btn_c.on_clicked(lambda event, d=dist: mover_calibracion(d))
    botones_cal.append(btn_c)

# =========================================================================
# LECTURA SERIAL Y ACTUALIZACIÓN EN TIEMPO REAL
# =========================================================================
def actualizar(frame):
    global ensayo_activo
    while ser.in_waiting > 0:
        try:
            raw_line = ser.readline().decode('utf-8', errors='ignore').strip()
            if not raw_line:
                continue

            # Lectura de pares telemetría en tiempo real
            if raw_line.startswith("Desplazamiento_mm:") and ",Fuerza_N:" in raw_line:
                partes = raw_line.split(",")
                dist = float(partes[0].split(":")[1])
                fuerza = float(partes[1].split(":")[1])
                desplazamientos.append(dist)
                fuerzas.append(fuerza)

            elif raw_line:
                print(f"[ESP32] {raw_line}")
                # Detección de paradas físicas por fin de carrera o botón de emergencia
                if ensayo_activo and ("ENSAYO DETENIDO" in raw_line or "MOTOR DETENIDO" in raw_line or "LIMIT_REACHED" in raw_line):
                    ensayo_activo = False
                    guardar_csv()

        except (ValueError, IndexError):
            pass

    if desplazamientos:
        linea.set_data(desplazamientos, fuerzas)
        ax.relim()
        ax.autoscale_view()
        actualizar_hud()

    return linea, texto_valores

ani = animation.FuncAnimation(fig, actualizar, interval=50, blit=False, cache_frame_data=False)

try:
    plt.show()
finally:
    try:
        ser.write(b'E\n')
        ser.close()
        print("Puerto serial cerrado y liberado.")
    except Exception:
        pass
