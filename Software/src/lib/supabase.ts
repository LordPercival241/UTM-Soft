import { createClient } from "@supabase/supabase-js";

function sanitizeSupabaseUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  let clean = rawUrl.trim().replace(/^["']|["']$/g, "");
  // Eliminar barras diagonales al final
  clean = clean.replace(/\/+$/, "");
  // Si accidentalmente se agrego /auth/v1 o /rest/v1 al final, retirarlo
  clean = clean.replace(/\/(auth|rest)(\/v1)?\/?$/i, "");
  return clean;
}

function sanitizeSupabaseKey(rawKey?: string): string {
  if (!rawKey) return "";
  return rawKey.trim().replace(/^["']|["']$/g, "");
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const url = sanitizeSupabaseUrl(rawUrl);
const key = sanitizeSupabaseKey(rawKey);

export const hasSupabaseConfig = Boolean(url && key);

export const supabase = hasSupabaseConfig
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;
