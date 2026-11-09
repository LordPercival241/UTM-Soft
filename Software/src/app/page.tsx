"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileText,
  HardDrive,
  Loader2,
  Lock,
  Mail,
  RotateCcw,
  ShieldCheck,
  User
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { validateEmail } from "@/lib/email-validation";
import { ThemeToggle } from "@/components/theme-toggle";
import { UtmLogo } from "@/components/utm-logo";

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setError(
        "No se detecto la configuracion de Supabase. Verifique que NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY esten agregadas en Vercel y realice un Redeploy."
      );
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasSupabaseConfig || !supabase) {
      setError(
        "No se puede conectar con Supabase. Faltan las variables de entorno en Vercel."
      );
      return;
    }
    setError(null);
    setSuccess(null);
    setUnconfirmedEmail(null);
    setLoading(true);

    try {
      // 1. Validacion sintactica, de dominio y descarte de correos ficticios/desechables
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        throw new Error(emailValidation.error);
      }
      const cleanEmail = emailValidation.cleanEmail;

      // 2. Validacion de longitud de contrasena
      if (password.length < 6) {
        throw new Error("La contrasena debe tener al menos 6 caracteres.");
      }

      if (tab === "login") {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
            setUnconfirmedEmail(cleanEmail);
            throw new Error(
              "Su direccion de correo no ha sido confirmada aun. Revise su bandeja de entrada o carpeta de correo no deseado y haga clic en el enlace de activacion."
            );
          }
          if (msg.includes("invalid login credentials")) {
            throw new Error("Credenciales de acceso incorrectas. Verifique el correo y la contrasena ingresados.");
          }
          throw signInError;
        }

        if (signInData.user && !signInData.user.email_confirmed_at && !signInData.session) {
          setUnconfirmedEmail(cleanEmail);
          throw new Error("Debe confirmar su correo electronico antes de acceder al laboratorio.");
        }

        router.replace("/dashboard");
      } else {
        // Validacion de nombre de operador
        if (!fullName.trim() || fullName.trim().length < 3) {
          throw new Error("Ingrese el nombre completo del operador (minimo 3 caracteres).");
        }

        const callbackUrl =
          typeof window !== "undefined" && window.location.origin
            ? `${window.location.origin.replace(/\/+$/, "")}/auth/callback`
            : undefined;

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: callbackUrl,
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (signUpError) throw signUpError;

        // Si el usuario ya existe en Supabase, el arreglo identities retorna vacio
        if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
          throw new Error("Esta direccion de correo ya se encuentra registrada. Por favor inicie sesion.");
        }

        // Si se requiere confirmacion por correo real
        if (!signUpData.session || !signUpData.user?.email_confirmed_at) {
          setUnconfirmedEmail(cleanEmail);
          setSuccess(
            `Se ha emitido un enlace de activacion a ${cleanEmail}. Por favor abra el correo y confirme su cuenta para ingresar.`
          );
          setTab("login");
        } else {
          router.replace("/dashboard");
        }
      }
    } catch (caught) {
      const rawMsg =
        caught instanceof Error ? caught.message : "Error al procesar la solicitud de autenticacion.";
      if (
        rawMsg.toLowerCase().includes("invalid path") ||
        rawMsg.toLowerCase().includes("requested path is invalid")
      ) {
        setError(
          "Error en la URL de Supabase/Vercel: Verifique que NEXT_PUBLIC_SUPABASE_URL en Vercel sea exactamente 'https://<id-proyecto>.supabase.co' (sin barras finales ni rutas como /auth/v1) y que en Supabase las URLs de redireccion sean completas con https://."
        );
      } else {
        setError(rawMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!supabase || !unconfirmedEmail) return;
    setResending(true);
    setError(null);
    try {
      const callbackUrl =
        typeof window !== "undefined" && window.location.origin
          ? `${window.location.origin.replace(/\/+$/, "")}/auth/callback`
          : undefined;

      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: unconfirmedEmail,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });
      if (resendError) throw resendError;
      setSuccess(`Enlace de verificacion reenviado a ${unconfirmedEmail}. Compruebe su bandeja de entrada.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible reenviar el mensaje de confirmacion.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-theme-canvas text-theme-main transition-colors">
      {/* Top Header */}
      <header className="border-b border-theme-border bg-theme-card/90 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UtmLogo size={24} className="text-theme-accent" />
          <Link href="/" className="font-mono text-base font-bold tracking-wider text-theme-main">
            UTMachine<span className="text-theme-accent">·</span>LAB
          </Link>
          <span className="text-[11px] font-mono uppercase tracking-widest text-theme-muted bg-theme-cardInner border border-theme-border px-2 py-0.5 rounded-sm">
            IF511A Instrumentación Electrónica
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-2 text-xs font-mono text-theme-muted">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">EN LINEA</span>
          </div>
        </div>
      </header>

      {/* Main Hero & Auth Split */}
      <main className="flex-1 flex items-center justify-center p-6 lg:p-12 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center w-full">
          {/* Left Column: Technical Overview */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-theme-card border border-theme-border rounded-sm shadow-sm flex items-center justify-center">
                <UtmLogo size={32} className="text-theme-accent" />
              </div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-theme-card border border-theme-border text-xs font-mono text-theme-accent rounded-sm">
                <Activity size={14} />
                <span>Máquina Universal de Ensayos de Fuerza</span>
              </div>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-theme-main leading-tight font-sans">
              Adquisición de datos en <span className="text-theme-accent">tiempo real</span>.
            </h1>

            <p className="text-theme-muted text-sm sm:text-base leading-relaxed max-w-xl font-sans">
              Plataforma de adquisición serial en tiempo real para probetas poliméricas. Curvas continuas de esfuerzo frente a deformación, cálculo de rigidez y reportes certificados.
            </p>

            {/* Technical Spec Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 font-mono text-xs">
              <div className="bg-theme-card border border-theme-border p-3 rounded-sm">
                <span className="text-[10px] text-theme-dim block mb-1">CELDA DE CARGA</span>
                <span className="text-theme-main font-bold">10 kg / 100 N</span>
              </div>
              <div className="bg-theme-card border border-theme-border p-3 rounded-sm">
                <span className="text-[10px] text-theme-dim block mb-1">TRANSMISION SERIAL</span>
                <span className="text-theme-telemetry font-bold font-mono-numbers">115200 BAUD</span>
              </div>
              <div className="bg-theme-card border border-theme-border p-3 rounded-sm col-span-2 sm:col-span-1">
                <span className="text-[10px] text-theme-dim block mb-1">INTEGRIDAD</span>
                <span className="text-emerald-500 font-bold">CRC-16 / CCITT</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-mono text-theme-muted pt-1">
              <span className="flex items-center gap-1.5">
                <HardDrive size={14} className="text-theme-accent" /> Cero almacenamiento cloud
              </span>
              <span className="flex items-center gap-1.5">
                <FileText size={14} className="text-theme-telemetry" /> Exportacion PDF con jsPDF
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu size={14} className="text-emerald-500" /> Lima Peru
              </span>
            </div>
          </div>

          {/* Right Column: High-Precision Auth Card */}
          <div className="lg:col-span-5 bg-theme-card border border-theme-border p-6 lg:p-7 rounded-sm shadow-md flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-theme-border">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-theme-accent" />
                <h2 className="font-mono text-xs font-bold tracking-wider text-theme-main uppercase">
                  CONTROL DE ACCESO
                </h2>
              </div>
              <span className="text-[10px] font-mono text-theme-dim">AUTH RLS</span>
            </div>

            {/* Auth Tab Switcher */}
            <div className="grid grid-cols-2 p-1 bg-theme-cardInner border border-theme-borderSubtle rounded-sm text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  setTab("login");
                  setError(null);
                  setSuccess(null);
                }}
                className={`py-2 px-3 text-center transition-all rounded-sm font-semibold ${tab === "login"
                  ? "bg-theme-card text-theme-accent border border-theme-accent/40 shadow-sm"
                  : "text-theme-muted hover:text-theme-main"
                  }`}
              >
                INICIAR SESION
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("register");
                  setError(null);
                  setSuccess(null);
                }}
                className={`py-2 px-3 text-center transition-all rounded-sm font-semibold ${tab === "register"
                  ? "bg-theme-card text-theme-accent border border-theme-accent/40 shadow-sm"
                  : "text-theme-muted hover:text-theme-main"
                  }`}
              >
                CREAR CUENTA
              </button>
            </div>

            {/* Error & Success Feedback */}
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/40 text-rose-500 text-xs font-mono rounded-sm flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-500" />
                  <span>{error}</span>
                </div>
                {unconfirmedEmail && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending}
                    className="self-start text-[11px] underline text-theme-telemetry hover:opacity-80 flex items-center gap-1 mt-1 font-mono"
                  >
                    {resending ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span>Reenviando confirmacion...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw size={12} />
                        <span>Reenviar enlace de activacion</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs font-mono rounded-sm flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span>{success}</span>
                </div>
                {unconfirmedEmail && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending}
                    className="self-start text-[11px] underline text-theme-telemetry hover:opacity-80 flex items-center gap-1 mt-1 font-mono"
                  >
                    {resending ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span>Reenviando...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw size={12} />
                        <span>No recibi el correo, reenviar</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-mono">
              {tab === "register" && (
                <div>
                  <label className="text-[11px] text-theme-muted block mb-1">NOMBRE COMPLETO DEL OPERADOR</label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Usuario1"
                      className="w-full bg-theme-cardInner border border-theme-border text-theme-main pl-9 pr-3 py-2 rounded-sm focus:border-theme-accent outline-none"
                    />
                    <User size={15} className="absolute left-3 top-2.5 text-theme-dim" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] text-theme-muted block mb-1">
                  {tab === "register" ? "CORREO ELECTRONICO (GMAIL O INSTITUCIONAL)" : "CORREO ELECTRONICO"}
                </label>
                <div className="relative">
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Usuario_1@gmail.com"
                    className="w-full bg-theme-cardInner border border-theme-border text-theme-main pl-9 pr-3 py-2 rounded-sm focus:border-theme-accent outline-none"
                  />
                  <Mail size={15} className="absolute left-3 top-2.5 text-theme-dim" />
                </div>
                {tab === "register" && (
                  <span className="text-[10px] text-theme-dim mt-1 block">
                    Se admiten cuentas de Gmail (@gmail.com) y correos institucionales.
                  </span>
                )}
              </div>

              <div>
                <label className="text-[11px] text-theme-muted block mb-1">CONTRASEÑA DE ACCESO</label>
                <div className="relative">
                  <input
                    required
                    minLength={6}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-theme-cardInner border border-theme-border text-theme-main pl-9 pr-3 py-2 rounded-sm focus:border-theme-accent outline-none"
                  />
                  <Lock size={15} className="absolute left-3 top-2.5 text-theme-dim" />
                </div>
                {tab === "register" && (
                  <span className="text-[10px] text-theme-dim mt-0.5 block">
                    Minimo 6 caracteres.
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-sm btn-laser flex items-center justify-center gap-2 font-mono text-xs uppercase mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>VERIFICANDO CREDENCIALES...</span>
                  </>
                ) : (
                  <>
                    <span>{tab === "login" ? "INGRESAR AL LABORATORIO" : "REGISTRAR OPERADOR"}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-theme-border text-center">
              <span className="text-[11px] font-mono text-theme-dim">
                UTMachine Lab · Supabase Auth
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer with Team Credits */}
      <footer className="border-t border-theme-border bg-theme-canvas px-6 py-8 mt-auto">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="flex flex-col gap-1 text-xs font-mono text-theme-muted">
            <span className="text-theme-dim font-semibold mb-1 uppercase tracking-widest text-[10px]">EQUIPO DE DESARROLLO E INVESTIGACIÓN</span>
            <div className="flex gap-4">
              <div className="flex flex-col">
                <span className="text-theme-main font-medium">Dante Olivas</span>
                <span className="text-theme-accent text-[10px]">Lord Percival</span>
              </div>
              <div className="flex flex-col border-l border-theme-border pl-4">
                <span className="text-theme-main font-medium">Jhosep Tineo</span>
                <span className="text-theme-accent text-[10px]">yoru</span>
              </div>
              <div className="flex flex-col border-l border-theme-border pl-4">
                <span className="text-theme-main font-medium">Juan Aguero</span>
                <span className="text-theme-accent text-[10px]">La beba</span>
              </div>
            </div>
          </div>
          <div className="text-xs font-mono text-theme-dim md:text-right">
            UTMachine-LAB &copy; {new Date().getFullYear()} — Universidad Nacional de Ingenieria.
            <br />
            Sistema de Adquisicion de Datos.
          </div>
        </div>
      </footer>
    </div>
  );
}
