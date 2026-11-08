"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verificando autenticacion y activando sesion de operador...");

  useEffect(() => {
    let isMounted = true;

    const processAuth = async () => {
      if (!hasSupabaseConfig || !supabase) {
        if (isMounted) {
          setStatus("error");
          setMessage("Falta la configuracion de Supabase en el cliente web.");
        }
        return;
      }

      try {
        if (typeof window === "undefined") return;

        const url = new URL(window.location.href);
        const searchParams = url.searchParams;
        const hash = window.location.hash;

        // 1. Verificar si Supabase devolvio un error en los parametros de la URL
        const errorDescription = searchParams.get("error_description") || searchParams.get("error");
        if (errorDescription) {
          throw new Error(decodeURIComponent(errorDescription));
        }

        // 2. Flujo PKCE (codigo temporal ?code=...)
        const code = searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          if (isMounted) {
            setStatus("success");
            setMessage("Cuenta activada exitosamente. Redirigiendo al laboratorio...");
            setTimeout(() => router.replace("/dashboard"), 1000);
          }
          return;
        }

        // 3. Flujo OTP / Verificacion de enlace de correo (?token_hash=...&type=signup|email)
        const tokenHash = searchParams.get("token_hash");
        const type = (searchParams.get("type") as EmailOtpType) || "signup";
        if (tokenHash) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type
          });
          if (otpError) throw otpError;
          if (isMounted) {
            setStatus("success");
            setMessage("Correo verificado correctamente. Accediendo al laboratorio...");
            setTimeout(() => router.replace("/dashboard"), 1000);
          }
          return;
        }

        // 4. Flujo Implicito con fragmentos hash (#access_token=...&refresh_token=...)
        if (hash && hash.includes("access_token")) {
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (data.session) {
            if (isMounted) {
              setStatus("success");
              setMessage("Sesion confirmada. Accediendo...");
              setTimeout(() => router.replace("/dashboard"), 1000);
            }
            return;
          }
        }

        // 5. Comprobar si ya existe sesion activa en el navegador
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession.session?.user) {
          if (isMounted) {
            setStatus("success");
            setMessage("Sesion activa detectada. Accediendo...");
            router.replace("/dashboard");
          }
          return;
        }

        throw new Error("No se detectaron parametros de autenticacion validos en el enlace recibido.");
      } catch (caught) {
        if (isMounted) {
          setStatus("error");
          setMessage(caught instanceof Error ? caught.message : "Error al procesar la activacion de la cuenta.");
        }
      }
    };

    void processAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#07080A] text-slate-100 p-6 font-mono text-xs">
      <div className="max-w-md w-full bg-[#0D1016] border border-[#1A2230] p-6 rounded-sm shadow-2xl text-center space-y-4">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 size={24} className="animate-spin text-laser" />
            <p className="text-slate-300">{message}</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 size={32} className="text-emerald-400" />
            <p className="text-emerald-300 font-semibold text-sm">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-3 py-2">
            <AlertCircle size={32} className="text-rose-400" />
            <p className="text-rose-300 leading-relaxed">{message}</p>
            <Link
              href="/"
              className="mt-3 inline-block px-4 py-2 bg-[#131720] border border-[#1E2532] text-slate-300 hover:text-white rounded-sm uppercase tracking-wider text-[11px]"
            >
              Volver al Inicio de Sesion
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
