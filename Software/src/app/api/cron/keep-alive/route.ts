import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/cron/keep-alive
 *
 * Supabase pausa automáticamente los proyectos del plan gratuito después de
 * 7 días consecutivos sin actividad en la base de datos.  Este endpoint
 * ejecuta una consulta mínima (`SELECT 1`) para reiniciar el contador de
 * inactividad y mantener el proyecto activo.
 *
 * Se diseñó para ser invocado por Vercel Cron (ver vercel.json) cada 5 días,
 * pero también puede llamarse manualmente o desde cualquier servicio externo
 * de cron (cron-job.org, UptimeRobot, GitHub Actions, etc.).
 *
 * Seguridad:
 *  - Si se define CRON_SECRET en Vercel, la petición debe incluir el header
 *    `Authorization: Bearer <CRON_SECRET>`.  Si no se define la variable,
 *    el endpoint funciona sin autenticación (útil durante desarrollo).
 *  - Vercel Cron inyecta automáticamente el header correcto.
 */
export async function GET(request: NextRequest) {
  /* ── Autenticación opcional con CRON_SECRET ── */
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (bearer !== cronSecret) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  /* ── Variables de Supabase ── */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;

  if (!url || !key) {
    return NextResponse.json(
      { error: "Faltan las variables NEXT_PUBLIC_SUPABASE_URL / SUPABASE_ANON_KEY." },
      { status: 503 }
    );
  }

  /* ── Ping a la base de datos ── */
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Consulta mínima: leer la tabla profiles con LIMIT 1.
    // Esto genera actividad real en la base de datos de Supabase.
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      console.error("[keep-alive] Error en consulta Supabase:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message, ts: new Date().toISOString() },
        { status: 502 }
      );
    }

    console.log("[keep-alive] Ping exitoso a Supabase:", new Date().toISOString());
    return NextResponse.json({
      ok: true,
      message: "Supabase keep-alive exitoso.",
      ts: new Date().toISOString(),
    });
  } catch (caught) {
    const msg = caught instanceof Error ? caught.message : "Error desconocido";
    console.error("[keep-alive] Excepción:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

