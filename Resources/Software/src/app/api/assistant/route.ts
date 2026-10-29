import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});

const requestSchema = z.object({
  message: z.string().trim().min(1).max(3000),
  history: z.array(historyMessageSchema).max(20).optional(),
  context: z.object({
    screen: z.string().max(120).optional(),
    machineStatus: z.string().max(500).optional(),
    lastMessage: z.string().max(1000).optional(),
    specimen: z.object({
      id: z.string().optional(),
      material: z.string().optional(),
      dimensions: z.string().optional(),
      gaugeLength: z.string().optional(),
      area: z.string().optional(),
    }).optional(),
    telemetry: z.object({
      currentForceN: z.number().optional(),
      maxForceN: z.number().optional(),
      currentStressMpa: z.number().optional(),
      maxStressMpa: z.number().optional(),
      currentStrainPct: z.number().optional(),
      maxStrainPct: z.number().optional(),
      displacementMm: z.number().optional(),
      datapoints: z.number().optional(),
      droppedSamples: z.number().optional(),
    }).optional(),
  }).optional(),
});

type RequestContext = z.infer<typeof requestSchema>["context"];

const instructions = `Eres el Asistente Técnico y Metrológico de UTM Lab, una plataforma avanzada para Máquinas Universales de Ensayos Mecánicos de Tracción (bajo costo, diseñada para caracterización de polímeros con celda de carga de 10 kg / 100 N y microcontrolador Arduino Uno/Nano o ESP32 DevKit).

Tu misión es guiar al operador con rigor técnico, precisión física y claridad metrológica.

ÁREAS DE ESPECIALIDAD Y CONOCIMIENTO:
1. CIENCIA E INGENIERÍA DE MATERIALES:
   - Curvas Esfuerzo-Deformación (σ vs ε): Región elástica lineal (Ley de Hooke: σ = E·ε), Módulo de Young (E), límite proporcional, límite elástico, esfuerzo de fluencia (Yield Strength, método offset 0.2%), resistencia máxima a la tracción (UTS), zona de estricción (necking) y fractura.
   - Polímeros comunes: PLA (módulo ~3.0 a 3.5 GPa, UTS ~45-65 MPa, comportamiento frágil), PETG (más tenaz, mayor elongación plástica), ABS (mayor resistencia al impacto, menor rigidez).
   - Cálculos clave:
     * Esfuerzo de ingeniería: σ = F / A₀ [MPa o N/mm²].
     * Deformación unitaria: ε = ΔL / L₀ [adimensional o %].
     * Módulo de elasticidad: E = Δσ / Δε [GPa o MPa] calculado en el tramo lineal elástico inicial.

2. NORMAS TÉCNICAS:
   - ASTM D638 (Método estándar para propiedades de tracción de plásticos): Probetas tipo "hueso de perro" (dogbone) Tipo IV y Tipo V (usuales en impresión 3D FDM), velocidades de ensayo recomendadas (1 a 5 mm/min para evaluación elástica de termoplásticos).
   - ISO 527-1 / ISO 527-2 (Determinación de propiedades de tracción en plásticos).

3. DIAGNÓSTICO DE TELEMETRÍA Y ALERTAS EN TIEMPO REAL:
   - Analiza los datos de telemetría provistos en el contexto (Fuerza actual/máx, Esfuerzo actual/máx, Deformación, Muestras adquiridas, Muestras perdidas).
   - Proporciona diagnósticos objetivos: evalúa si la curva muestra respuesta elástica esperada, si hay signos de deslizamiento en mordazas (pérdida súbita de fuerza sin rotura), o si se aproxima al límite de seguridad.

4. PROTOCOLO SERIAL Y HARDWARE:
   - Comunicación: Web Serial API en Chrome/Edge, 115200 baudios, tramas 'CMD,id=...,type=...' y confirmación 'ACK,id=...,status=OK'.
   - Integridad: Muestras con checksum CRC-16/CCITT. Secuencia 'seq' incremental para registrar muestras perdidas.
   - Diagnóstico USB: Drivers CP2102 o CH340 en Windows, verificar exclusividad del puerto COM (cerrar Monitor Serie de Arduino IDE antes de conectar).

LÍMITES Y NORMAS DE SEGURIDAD (CRÍTICO):
- Límite absoluto de fuerza de diseño: 100 N (capacidad de celda 10 kg). Superar 100 N genera evento OVERLOAD.
- NUNCA indiques o sugieras omitir un paro de emergencia, anular finales de carrera físicos o ignorar alertas de sobrecarga.
- Ante estados de 'fault' o eventos de seguridad, recomienda detener el equipo de inmediato con el botón físico o el control en pantalla e inspeccionar mecánicamente.
- No ejecutas comandos físicos directamente: orientas y asistes al operador.

PAUTAS DE RESPUESTA:
- Responde siempre en español, con lenguaje técnico metrológico formal, directo y útil.
- Emplea formato estructurado: viñetas claras, negritas para conceptos clave y fórmulas explícitas.
- Si el operador pide un diagnóstico y hay telemetría disponible, utiliza los valores numéricos reales reportados en el contexto para fundamentar tu respuesta.`;

function buildContextString(context?: RequestContext): string {
  if (!context) return "";
  const lines: string[] = ["=== TELEMETRÍA Y ESTADO DEL SISTEMA (SOLO LECTURA) ==="];
  if (context.screen) lines.push(`Pantalla: ${context.screen}`);
  if (context.machineStatus) lines.push(`Estado del controlador: ${context.machineStatus}`);
  if (context.lastMessage) lines.push(`Última trama serial: "${context.lastMessage}"`);

  if (context.specimen) {
    lines.push("Parámetros de la probeta:");
    if (context.specimen.id) lines.push(`  - Identificador: ${context.specimen.id}`);
    if (context.specimen.material) lines.push(`  - Material: ${context.specimen.material}`);
    if (context.specimen.dimensions) lines.push(`  - Dimensiones (w x t): ${context.specimen.dimensions}`);
    if (context.specimen.area) lines.push(`  - Área inicial A₀: ${context.specimen.area}`);
    if (context.specimen.gaugeLength) lines.push(`  - Longitud calibrada L₀: ${context.specimen.gaugeLength}`);
  }

  if (context.telemetry) {
    lines.push("Valores mecánicos registrados:");
    lines.push(
      `  - Fuerza actual: ${context.telemetry.currentForceN ?? 0} N | Máxima: ${context.telemetry.maxForceN ?? 0} N (Límite: 100 N)`
    );
    lines.push(
      `  - Esfuerzo actual: ${context.telemetry.currentStressMpa ?? 0} MPa | Máximo: ${context.telemetry.maxStressMpa ?? 0} MPa`
    );
    lines.push(
      `  - Deformación actual: ${context.telemetry.currentStrainPct ?? 0}% | Máxima: ${context.telemetry.maxStrainPct ?? 0}%`
    );
    lines.push(`  - Desplazamiento actual: ${context.telemetry.displacementMm ?? 0} mm`);
    lines.push(`  - Muestras capturadas: ${context.telemetry.datapoints ?? 0}`);
    if ((context.telemetry.droppedSamples ?? 0) > 0) {
      lines.push(
        `  - ALERTA: ${context.telemetry.droppedSamples} muestras perdidas por salto de secuencia.`
      );
    }
  }
  lines.push("======================================================");
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY;
  let rawModel = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  if (rawModel === "gemini-flash") {
    rawModel = "gemini-2.5-flash";
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta configurar GEMINI_API_KEY en las variables de entorno de Vercel / .env.local." },
      { status: 503 }
    );
  }
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Faltan las variables de Supabase en el servidor." },
      { status: 503 }
    );
  }
  if (!token) {
    return NextResponse.json({ error: "Se requiere una sesión válida de operador." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: `Sesión no válida o expirada (${authError?.message || "inicie sesión nuevamente"}).` },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la solicitud no es un JSON válido." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message || "Datos inválidos";
    return NextResponse.json({ error: `Solicitud inválida: ${issue}` }, { status: 400 });
  }
  const { message, history, context } = parsed.data;

  // Construir historial multi-turno compatible con el protocolo Gemini API
  const rawTurns: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  if (history && history.length > 0) {
    for (const item of history) {
      if (!item.text?.trim()) continue;
      rawTurns.push({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.text.trim() }],
      });
    }
  }

  // Agregar turno actual con la telemetría contextual integrada
  const contextText = buildContextString(context);
  const currentTurnText = contextText
    ? `${contextText}\n\nConsulta del operador:\n${message}`
    : message;

  rawTurns.push({
    role: "user",
    parts: [{ text: currentTurnText }],
  });

  // Sanitizar turnos: Gemini exige que los turnos comiencen con "user" y alternen estrictamente entre "user" y "model"
  const sanitizedTurns: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const turn of rawTurns) {
    if (sanitizedTurns.length > 0 && sanitizedTurns[sanitizedTurns.length - 1].role === turn.role) {
      // Concatenar turnos consecutivos del mismo rol
      sanitizedTurns[sanitizedTurns.length - 1].parts[0].text += `\n\n${turn.parts[0].text}`;
    } else {
      sanitizedTurns.push(turn);
    }
  }

  // Si el primer turno quedó como "model", removerlo para iniciar siempre en "user"
  if (sanitizedTurns.length > 0 && sanitizedTurns[0].role === "model") {
    sanitizedTurns.shift();
  }

  const makeGeminiRequest = async (modelToUse: string) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToUse)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: instructions }],
        },
        contents: sanitizedTurns,
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2048,
          topP: 0.95,
        },
      }),
    });
  };

  // Cascada de modelos candidatos para garantizar respuesta ante fallos de disponibilidad regional
  const candidateModels = [rawModel, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  const uniqueModels = Array.from(new Set(candidateModels.filter(Boolean)));

  let response: Response | null = null;
  let lastErrorText = "";
  let usedModel = "";

  for (const candidate of uniqueModels) {
    try {
      usedModel = candidate;
      response = await makeGeminiRequest(candidate);
      if (response.ok) {
        break;
      }
      lastErrorText = await response.text();
      console.warn(`[api/assistant] Modelo ${candidate} retornó status ${response.status}:`, lastErrorText);

      // Si el modelo da 404 (no existe o no habilitado en la API key) o 400 (parámetro no admitido en versión), probar el siguiente
      if (response.status === 404 || response.status === 400) {
        continue;
      }

      // Si es 401/403 (clave inválida) o 429 (cuota de cuenta), no tiene sentido reintentar otros modelos
      break;
    } catch (err) {
      lastErrorText = err instanceof Error ? err.message : "Error de comunicación";
      console.error(`[api/assistant] Error con modelo ${candidate}:`, lastErrorText);
    }
  }

  if (!response) {
    return NextResponse.json(
      { error: `No fue posible conectar con los modelos de Gemini. Detalle: ${lastErrorText}` },
      { status: 502 }
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY no autorizada o inválida. Verifique la clave en Google AI Studio y en las variables de entorno." },
        { status: 502 }
      );
    }
    if (response.status === 429) {
      return NextResponse.json(
        { error: "Límite de cuota de Gemini alcanzado (Rate limit / Quota exceeded). Espere un momento antes de consultar nuevamente." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: `Gemini API devolvió error (${response.status}): ${lastErrorText.slice(0, 300)}` },
      { status: 502 }
    );
  }

  try {
    const result = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      promptFeedback?: {
        blockReason?: string;
      };
    };

    if (result.promptFeedback?.blockReason) {
      return NextResponse.json({
        answer: `La consulta fue restringida por los filtros de seguridad de Gemini (${result.promptFeedback.blockReason}).`,
      });
    }

    const answer = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) {
      return NextResponse.json({
        answer: "El asistente no generó texto de respuesta. Intente reformular su consulta.",
      });
    }

    return NextResponse.json({ answer, model: usedModel });
  } catch (caught) {
    const isTimeout = caught instanceof Error && caught.name === "TimeoutError";
    return NextResponse.json(
      { error: isTimeout ? "Tiempo de espera agotado al consultar a Gemini." : "Error al procesar la respuesta de Gemini." },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
