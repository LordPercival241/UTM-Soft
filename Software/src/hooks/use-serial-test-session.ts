"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  calculateEngineeringValues,
  type Sample,
  type TestSetup,
  type TestStatus
} from "@/lib/test-domain";

type PendingCommand = { resolve: () => void; reject: (reason: Error) => void; timeout: ReturnType<typeof setTimeout> };

const parseFields = (line: string) => {
  const [, ...pairs] = line.split(",");
  return Object.fromEntries(
    pairs.map((pair) => {
      const separator = pair.indexOf("=");
      return [pair.slice(0, separator).trim(), pair.slice(separator + 1).trim()];
    })
  );
};

const crc16Ccitt = (input: string) => {
  let crc = 0xffff;
  for (let index = 0; index < input.length; index += 1) {
    crc ^= input.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
};

const numberField = (fields: Record<string, string>, key: string) => {
  const value = Number(fields[key]);
  if (!Number.isFinite(value)) throw new Error(`Campo serial inválido: ${key}`);
  return value;
};

export function useSerialTestSession() {
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const pendingRef = useRef(new Map<string, PendingCommand>());
  const setupRef = useRef<TestSetup | null>(null);
  const samplesRef = useRef<Sample[]>([]);
  const lastSequenceRef = useRef<number | null>(null);
  const [status, setStatus] = useState<TestStatus>("disconnected");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [droppedSamples, setDroppedSamples] = useState(0);
  const [lastMessage, setLastMessage] = useState("Sin conexión al controlador.");
  const [error, setError] = useState<string | null>(null);

  const rejectPending = useCallback((message: string) => {
    pendingRef.current.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error(message));
    });
    pendingRef.current.clear();
  }, []);

  const send = useCallback(async (type: string, payload: Record<string, string | number> = {}, timeoutMs = 3000) => {
    const port = portRef.current;
    if (!port?.writable) throw new Error("El controlador no está disponible.");
    const id = crypto.randomUUID();
    const encodedPayload = Object.entries({ id, type, ...payload })
      .map(([key, value]) => `${key}=${String(value).replaceAll(",", "_")}`)
      .join(",");
    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`CMD,${encodedPayload}\n`));
    } finally {
      writer.releaseLock();
    }
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRef.current.delete(id);
        reject(new Error(`El controlador no confirmó ${type} dentro del tiempo permitido.`));
      }, timeoutMs);
      pendingRef.current.set(id, { resolve, reject, timeout });
    });
  }, []);

  const handleLine = useCallback((rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;
    setLastMessage(line);
    try {
      if (line.startsWith("ACK,")) {
        const fields = parseFields(line);
        if (fields.id && pendingRef.current.has(fields.id)) {
          const pending = pendingRef.current.get(fields.id)!;
          clearTimeout(pending.timeout);
          pendingRef.current.delete(fields.id);
          if (fields.status === "OK") pending.resolve();
          else pending.reject(new Error(fields.reason || "El controlador rechazó el comando."));
          return;
        }
        // Fallback para confirmaciones globales
        if (fields.status === "OK" && pendingRef.current.size > 0) {
          const firstKey = pendingRef.current.keys().next().value;
          if (firstKey) {
            const pending = pendingRef.current.get(firstKey)!;
            clearTimeout(pending.timeout);
            pendingRef.current.delete(firstKey);
            pending.resolve();
          }
          return;
        }
      }
      if (line.startsWith("EVENT,")) {
        const fields = parseFields(line);
        if (fields.type === "FAULT" || fields.type === "LIMIT_REACHED" || fields.type === "OVERLOAD") {
          setStatus("fault");
          setError(fields.detail || `Evento de seguridad: ${fields.type}`);
        }
        if (fields.type === "TEST_FINISHED") setStatus("stopped");
        return;
      }
      if (!line.startsWith("SAMPLE,")) return;
      const setup = setupRef.current;
      if (!setup) return;
      const crcSeparator = line.lastIndexOf(",crc=");
      if (crcSeparator < 0) throw new Error("Muestra rechazada: falta CRC.");
      const fields = parseFields(line);
      const receivedCrc = Number.parseInt(fields.crc, 16);
      if (!Number.isInteger(receivedCrc) || crc16Ccitt(line.slice(0, crcSeparator)) !== receivedCrc) {
        throw new Error("Muestra rechazada: CRC no válido.");
      }
      const forceN = numberField(fields, "force_n");
      const displacementMm = numberField(fields, "displacement_mm");
      const derived = calculateEngineeringValues(forceN, displacementMm, setup);
      const sample: Sample = {
        sequence: numberField(fields, "seq"),
        deviceTimeMs: numberField(fields, "t_ms"),
        forceRaw: numberField(fields, "force_raw"),
        displacementRaw: numberField(fields, "displacement_raw"),
        forceN,
        displacementMm,
        ...derived
      };
      const lastSequence = lastSequenceRef.current;
      if (lastSequence !== null && sample.sequence > lastSequence + 1) setDroppedSamples((count) => count + sample.sequence - lastSequence - 1);
      lastSequenceRef.current = sample.sequence;
      samplesRef.current = [...samplesRef.current, sample];
      setSamples(samplesRef.current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo interpretar una muestra serial.");
      setStatus("fault");
    }
  }, []);

  const readPort = useCallback(async (port: SerialPort) => {
    if (!port.readable) return;
    const reader = port.readable.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let remainder = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        remainder += decoder.decode(value, { stream: true });
        const lines = remainder.split(/\r?\n/);
        remainder = lines.pop() ?? "";
        lines.forEach(handleLine);
      }
    } catch (caught) {
      if (portRef.current === port) {
        setError(caught instanceof Error ? caught.message : "Se perdió la lectura serial.");
        setStatus("fault");
        rejectPending("La conexión serial se interrumpió.");
      }
    } finally {
      reader.releaseLock();
      if (readerRef.current === reader) readerRef.current = null;
    }
  }, [handleLine, rejectPending]);

  const connect = useCallback(async (baudRate: number) => {
    if (!navigator.serial) throw new Error("Este navegador no soporta Web Serial. Use Chrome o Edge de escritorio.");
    if (!Number.isInteger(baudRate) || baudRate <= 0) throw new Error("Ingrese una velocidad serial válida.");
    setError(null);
    setStatus("connecting");
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });
      portRef.current = port;
      setLastMessage("Puerto abierto. Sincronizando con el microcontrolador...");
      void readPort(port);

      // Breve pausa para estabilización de hardware tras el reset inducido por DTR
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Intento de sincronización HELLO con hasta 3 reintentos automáticos
      let synchronized = false;
      let lastErr: Error | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await send("HELLO", {}, 2500);
          synchronized = true;
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          if (attempt < 3) {
            setLastMessage(`Sincronizando controlador (intento ${attempt + 1}/3)...`);
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (!synchronized) {
        throw lastErr || new Error("El controlador no confirmó HELLO dentro del tiempo permitido.");
      }

      setStatus("ready");
      setLastMessage("Microcontrolador sincronizado y listo para ensayar.");
    } catch (caught) {
      try { await portRef.current?.close(); } catch { /* port can already be closed */ }
      portRef.current = null;
      setStatus("disconnected");
      throw caught;
    }
  }, [readPort, send]);

  const start = useCallback(async (setup: TestSetup) => {
    if (status !== "ready" && status !== "stopped") throw new Error("La máquina no está lista para armar un ensayo.");
    setupRef.current = setup;
    samplesRef.current = [];
    lastSequenceRef.current = null;
    setSamples([]);
    setDroppedSamples(0);
    setError(null);
    setStatus("arming");
    try {
      await send("ARM_TEST", { calibration_profile: setup.calibrationProfileId });
      await send("START_TEST");
      setStatus("running");
    } catch (caught) {
      setStatus("fault");
      setError(caught instanceof Error ? caught.message : "No fue posible iniciar el ensayo.");
      throw caught;
    }
  }, [send, status]);

  const stop = useCallback(async () => {
    if (!portRef.current) return;
    try {
      await send("STOP_TEST");
      setStatus("stopped");
    } catch (caught) {
      setStatus("fault");
      setError(caught instanceof Error ? caught.message : "La orden de parada no fue confirmada.");
      throw caught;
    }
  }, [send]);

  const tare = useCallback(async () => {
    if (!portRef.current) throw new Error("El controlador no está conectado.");
    try {
      await send("TARE");
      setLastMessage("Tara de celda de carga completada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error al solicitar tara.");
      throw caught;
    }
  }, [send]);

  const jog = useCallback(async (distanceMm: number) => {
    if (!portRef.current) throw new Error("El controlador no está conectado.");
    try {
      await send("JOG", { distance: distanceMm });
      setLastMessage(`Ajuste manual: ${distanceMm > 0 ? "+" : ""}${distanceMm} mm iniciado.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error al desplazar actuador.");
      throw caught;
    }
  }, [send]);

  const disconnect = useCallback(async () => {
    const reader = readerRef.current;
    const port = portRef.current;
    readerRef.current = null;
    portRef.current = null;
    rejectPending("El operador cerró la conexión serial.");
    try {
      await reader?.cancel();
      await port?.close();
    } finally {
      setStatus("disconnected");
      setLastMessage("Conexión cerrada por el operador.");
    }
  }, [rejectPending]);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  return { status, samples, droppedSamples, error, lastMessage, connect, disconnect, start, stop, tare, jog };
}
