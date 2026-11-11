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

const instructions = `Eres YoungBot, el Asistente Técnico y Metrológico de UTMachine Lab, una plataforma avanzada para Máquinas Universales de Ensayos Mecánicos de Tracción (diseñada para caracterización de polímeros y materiales con celda de carga de 10 kg / 100 N y microcontrolador ESP32 DevKit).

IDENTIDAD Y CONFIDENCIALIDAD ESTRICTA (CRÍTICO):
- Tu nombre es estricta y únicamente YoungBot.
- NUNCA menciones que eres Gemini, Google, OpenAI o ningún modelo de lenguaje externo. Si el operador te pregunta quién eres o cuál es tu origen, responde siempre: "Soy YoungBot, el copiloto técnico y metrológico de UTMachine Lab."
- Tu misión es guiar al operador con rigor técnico, precisión física y claridad metrológica.

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

function normalizeModelName(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();

  // Mapeos intuitivos para cuando el usuario configure 3, 3.1 o 2.5 en las variables de entorno
  if (lower === "3" || lower === "gemini-3" || lower === "3 flash" || lower === "3.0") {
    return ["gemini-3-flash", "gemini-3-flash-preview", "gemini-3.0-flash"];
  }
  if (lower === "3.1" || lower === "gemini-3.1" || lower === "3.1 pro") {
    return ["gemini-3.1-pro-preview", "gemini-3.1-pro", "gemini-3.1-flash"];
  }
  if (lower === "2.5" || lower === "2.5 flash" || lower === "gemini-2.5" || lower === "gemini-2.5-flash") {
    return ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  }
  return [trimmed];
}

// Descubrimiento dinámico de modelos autorizados para la API key provista
async function discoverModels(key: string): Promise<string[]> {
  for (const apiVer of ["v1beta", "v1"] as const) {
    try {
      const url = `https://generativelanguage.googleapis.com/${apiVer}/models?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };
      if (data.models && Array.isArray(data.models)) {
        return data.models
          .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m) => m.name.replace(/^models\//, ""));
      }
    } catch {
      // Ignorar fallo de red puntual y continuar
    }
  }
  return [];
}

// Ejecutor de generación de contenido con tolerancia de endpoints (v1beta y v1)
async function requestGenerateContent(
  key: string,
  modelName: string,
  turns: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>
): Promise<{ ok: boolean; status: number; text: string; data?: unknown }> {
  const cleanModel = modelName.replace(/^models\//, "").trim();
  const attempts = [
    { ver: "v1beta", withSys: true },
    { ver: "v1", withSys: true },
    { ver: "v1", withSys: false },
  ];

  let lastStatus = 404;
  let lastText = "";

  for (const { ver, withSys } of attempts) {
    const url = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const payload: Record<string, unknown> = {
        contents: turns,
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2048,
          topP: 0.95,
        },
      };

      if (withSys) {
        payload.system_instruction = {
          parts: [{ text: instructions }],
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify(payload),
      });

      lastStatus = res.status;
      lastText = await res.text();

      if (res.ok) {
        try {
          const json = JSON.parse(lastText);
          return { ok: true, status: res.status, text: lastText, data: json };
        } catch {
          // Si falló el parseo JSON, continuar
        }
      }

      // Si es un error definitivo de credenciales o cuota, no iterar variantes
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        return { ok: false, status: res.status, text: lastText };
      }
    } catch (err) {
      lastText = err instanceof Error ? err.message : "Error de comunicación";
    }
  }

  return { ok: false, status: lastStatus, text: lastText };
}

export async function POST(request: NextRequest) {
  const apiKey =
    process.env.YOUNGBOT_API_KEY ||
    process.env.AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY;

  const configuredModel = (process.env.YOUNGBOT_MODEL || process.env.GEMINI_MODEL || "").trim();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta configurar la clave de API del asistente en las variables de entorno de Vercel (GEMINI_API_KEY o AI_API_KEY)." },
      { status: 503 }
    );
  }
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Faltan las variables de conexión a la base de datos en el servidor." },
      { status: 503 }
    );
  }
  if (!token) {
    return NextResponse.json({ error: "Se requiere una sesión válida de operador para consultar a YoungBot." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: `Sesión de operador expirada (${authError?.message || "inicie sesión nuevamente"}).` },
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

  // Construir historial multi-turno estructurado
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

  // Sanitizar turnos: deben comenzar con "user" y alternar estrictamente
  const sanitizedTurns: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const turn of rawTurns) {
    if (sanitizedTurns.length > 0 && sanitizedTurns[sanitizedTurns.length - 1].role === turn.role) {
      sanitizedTurns[sanitizedTurns.length - 1].parts[0].text += `\n\n${turn.parts[0].text}`;
    } else {
      sanitizedTurns.push(turn);
    }
  }

  if (sanitizedTurns.length > 0 && sanitizedTurns[0].role === "model") {
    sanitizedTurns.shift();
  }

  // Lista prioritaria de modelos compatibles actuales
  // Se integran modelos Gemini 3 y 3.1 solicitados, con fallback a modelos probados de alta cuota (1.5-flash)
  const normalizedConfigured = normalizeModelName(configuredModel);

  const initialCandidates = [
    ...normalizedConfigured,
    // Candidatos Gemini 3 / 3.1
    "gemini-3-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
    "gemini-3.0-flash",
    // Modelos estables de alta disponibilidad y cuota (15 RPM / 1500 RPD)
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
  ].filter(Boolean);

  const candidateModels = Array.from(new Set(initialCandidates));

  let lastResult: { ok: boolean; status: number; text: string; data?: unknown } | null = null;
  let successfulModel = "";

  for (const model of candidateModels) {
    const res = await requestGenerateContent(apiKey, model, sanitizedTurns);
    if (res.ok) {
      lastResult = res;
      successfulModel = model;
      break;
    }
    lastResult = res;

    // Si la clave no está autorizada (401/403), ningún modelo funcionará
    if (res.status === 401 || res.status === 403) {
      break;
    }

    // Si un modelo retorna 429 (saturado o cuota por minuto de ese modelo específico),
    // probamos el siguiente modelo de la lista ya que cada modelo tiene su propio cupo
    if (res.status === 429) {
      console.warn(`[api/assistant] Modelo ${model} reportó 429 (cuota/rate limit), probando siguiente candidato...`);
      continue;
    }
  }

  // Si todos los modelos estáticos fallaron con 404/400, intentar autodescubrimiento con ListModels
  if (!lastResult?.ok && (lastResult?.status === 404 || lastResult?.status === 400)) {
    const discovered = await discoverModels(apiKey);
    for (const discModel of discovered) {
      if (candidateModels.includes(discModel)) continue;
      const res = await requestGenerateContent(apiKey, discModel, sanitizedTurns);
      if (res.ok) {
        lastResult = res;
        successfulModel = discModel;
        break;
      }
      lastResult = res;
      if (res.status === 401 || res.status === 403) {
        break;
      }
      if (res.status === 429) {
        continue;
      }
    }
  }

  if (!lastResult) {
    return NextResponse.json(
      { error: "No fue posible iniciar la comunicación con YoungBot." },
      { status: 502 }
    );
  }

  if (!lastResult.ok) {
    if (lastResult.status === 401 || lastResult.status === 403) {
      return NextResponse.json(
        { error: "Clave de API del asistente no autorizada o inválida. Verifique que la clave obtenida en Google AI Studio (aistudio.google.com) esté correctamente copiada en las variables de entorno de Vercel." },
        { status: 502 }
      );
    }
    if (lastResult.status === 429) {
      let detailMsg = "";
      try {
        const parsed = JSON.parse(lastResult.text) as { error?: { message?: string } };
        detailMsg = parsed?.error?.message || "";
      } catch {
        detailMsg = lastResult.text;
      }

      const isDailyLimit = /day|daily|RPD/i.test(detailMsg);
      const advice = isDailyLimit
        ? "Se ha consumido la cuota diaria gratuita de esta clave. Genere una nueva clave gratuita al instante en Google AI Studio (aistudio.google.com/app/apikey) y actualícela en Vercel."
        : "Se superó el límite de consultas por minuto. Por favor espere unos 20-30 segundos y vuelva a consultar.";

      return NextResponse.json(
        {
          error: `Límite de cuota alcanzado temporalmente. ${advice}`,
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      {
        error: `YoungBot no pudo procesar la solicitud (Código ${lastResult.status}): ${lastResult.text.slice(0, 250)}. Verifique que su API Key en Google AI Studio (aistudio.google.com) tenga habilitada la API Generative Language.`,
      },
      { status: 502 }
    );
  }

  try {
    const result = lastResult.data as {
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
        answer: `La consulta técnica fue restringida por los filtros de seguridad del sistema (${result.promptFeedback.blockReason}).`,
      });
    }

    const answer = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) {
      return NextResponse.json({
        answer: "YoungBot no generó texto de respuesta para esta consulta. Intente reformular su pregunta técnica.",
      });
    }

    return NextResponse.json({ answer, model: successfulModel });
  } catch (caught) {
    const isTimeout = caught instanceof Error && caught.name === "TimeoutError";
    return NextResponse.json(
      { error: isTimeout ? "Tiempo de espera agotado al consultar a YoungBot." : "Error al procesar la respuesta de YoungBot." },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
