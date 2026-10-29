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
  Usb,
  User
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { validateEmail } from "@/lib/email-validation";

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
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
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
          typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

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

        // Si se requiere confirmacion por correo real (comportamiento estandar de Supabase con Confirm email activo)
        if (!signUpData.session || !signUpData.user?.email_confirmed_at) {
          setUnconfirmedEmail(cleanEmail);
          setSuccess(
            `Se ha emitido un enlace de activacion a ${cleanEmail}. Para evitar registros no autorizados o ficticios, debe abrir el correo y confirmar su identidad antes de ingresar.`
          );
          setTab("login");
        } else {
          router.replace("/dashboard");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error al procesar la solicitud de autenticacion.");
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
        typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

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
    <div className="min-h-screen flex flex-col bg-[#07080A] text-slate-100">
      {/* Top Header */}
      <header className="border-b border-[#1A2230] bg-[#0A0D13]/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-laser rounded-none" />
          <Link href="/" className="font-mono text-base font-bold tracking-wider text-white">
            UTM<span className="text-laser">·</span>LAB
          </Link>
          <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-sm">
            IF511A Proyecto de Instrumentacion Electronica
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="hidden sm:inline">EN LINEA</span>
        </div>
      </header>

      {/* Main Hero & Auth Split */}
      <main className="flex-1 flex items-center justify-center p-6 lg:p-12 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center w-full">
          {/* Left Column: Technical Overview */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#10141C] border border-[#1A2230] text-xs font-mono text-laser rounded-sm">
              <Activity size={14} />
              <span>Maquina Universal de Ensayos de Fuerza de Bajo Costo</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight font-sans">
              Adquisicion de datos en <span className="text-laser">tiempo real</span>.
            </h1>

            <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-xl font-sans">
              Plataforma de adquisicion serial en tiempo real para probetas polimericas. Curvas continuas de esfuerzo frente a deformacion, calculo de rigidez y reportes certificados.
            </p>

            {/* Technical Spec Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 font-mono text-xs">
              <div className="bg-[#0D1016] border border-[#1A2230] p-3 rounded-sm">
                <span className="text-[10px] text-slate-500 block mb-1">CELDA DE CARGA</span>
                <span className="text-white font-bold">10 kg / 100 N</span>
              </div>
              <div className="bg-[#0D1016] border border-[#1A2230] p-3 rounded-sm">
                <span className="text-[10px] text-slate-500 block mb-1">TRANSMISION SERIAL</span>
                <span className="text-cyan-400 font-bold">115200 BAUD</span>
              </div>
              <div className="bg-[#0D1016] border border-[#1A2230] p-3 rounded-sm col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-500 block mb-1">INTEGRIDAD</span>
                <span className="text-emerald-400 font-bold">CRC-16 / CCITT</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-mono text-slate-400 pt-1">
              <span className="flex items-center gap-1.5">
                <HardDrive size={14} className="text-laser" /> Cero almacenamiento cloud
              </span>
              <span className="flex items-center gap-1.5">
                <FileText size={14} className="text-cyan-400" /> Exportacion PDF con jsPDF
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu size={14} className="text-emerald-400" /> Lima Peru
              </span>
            </div>
          </div>

          {/* Right Column: High-Precision Auth Card */}
          <div className="lg:col-span-5 bg-[#0D1016] border border-[#1A2230] p-6 lg:p-7 rounded-sm shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A2230]">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-laser" />
                <h2 className="font-mono text-xs font-bold tracking-wider text-slate-200 uppercase">
                  CONTROL DE ACCESO
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-500">AUTH RLS</span>
            </div>

            {/* Auth Tab Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#131720] border border-[#1E2532] rounded-sm text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  setTab("login");
                  setError(null);
                  setSuccess(null);
                }}
                className={`py-2 px-3 text-center transition-all rounded-sm font-semibold ${tab === "login"
                  ? "bg-[#0D1016] text-laser border border-laser/30 shadow-sm"
                  : "text-slate-400 hover:text-white"
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
                  ? "bg-[#0D1016] text-laser border border-laser/30 shadow-sm"
                  : "text-slate-400 hover:text-white"
                  }`}
              >
                CREAR CUENTA
              </button>
            </div>

            {/* Error & Success Feedback */}
            {error && (
              <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-mono rounded-sm flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-400" />
                  <span>{error}</span>
                </div>
                {unconfirmedEmail && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending}
                    className="self-start text-[11px] underline text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mt-1 font-mono"
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
              <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs font-mono rounded-sm flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span>{success}</span>
                </div>
                {unconfirmedEmail && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending}
                    className="self-start text-[11px] underline text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mt-1 font-mono"
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
                  <label className="text-[11px] text-slate-400 block mb-1">NOMBRE COMPLETO DEL OPERADOR</label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Dante Olivas"
                      className="w-full bg-[#131720] border border-[#1E2532] text-white pl-9 pr-3 py-2 rounded-sm focus:border-laser outline-none"
                    />
                    <User size={15} className="absolute left-3 top-2.5 text-slate-500" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  {tab === "register" ? "CORREO ELECTRONICO (GMAIL O INSTITUCIONAL)" : "CORREO ELECTRONICO"}
                </label>
                <div className="relative">
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operador@gmail.com o usuario@uni.edu.pe"
                    className="w-full bg-[#131720] border border-[#1E2532] text-white pl-9 pr-3 py-2 rounded-sm focus:border-laser outline-none"
                  />
                  <Mail size={15} className="absolute left-3 top-2.5 text-slate-500" />
                </div>
                {tab === "register" && (
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Se admiten cuentas de Gmail (@gmail.com) y correos institucionales.
                  </span>
                )}
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">CONTRASEÑA DE ACCESO</label>
                <div className="relative">
                  <input
                    required
                    minLength={6}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-[#131720] border border-[#1E2532] text-white pl-9 pr-3 py-2 rounded-sm focus:border-laser outline-none"
                  />
                  <Lock size={15} className="absolute left-3 top-2.5 text-slate-500" />
                </div>
                {tab === "register" && (
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
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

            <div className="pt-2 border-t border-[#1A2230] text-center">
              <span className="text-[11px] font-mono text-slate-500">
                Supabase Auth con Verificacion de Correo
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer with Team Credits */}
      <footer className="border-t border-[#1A2230] bg-[#07080A] px-6 py-8 mt-auto">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="flex flex-col gap-1 text-xs font-mono text-slate-500">
            <span className="text-slate-400 font-semibold mb-1 uppercase tracking-widest text-[10px]">EQUIPO DE DESARROLLO E INVESTIGACION</span>
            <div className="flex gap-4">
              <div className="flex flex-col">
                <span className="text-white">Dante Olivas</span>
                <span className="text-laser text-[10px]">Lord Percival</span>
              </div>
              <div className="flex flex-col border-l border-[#1A2230] pl-4">
                <span className="text-white">Jhosep Tineo</span>
                <span className="text-laser text-[10px]">yoru</span>
              </div>
              <div className="flex flex-col border-l border-[#1A2230] pl-4">
                <span className="text-white">Juan Aguero</span>
                <span className="text-laser text-[10px]">La Loba</span>
              </div>
            </div>
          </div>
          <div className="text-xs font-mono text-slate-600 md:text-right">
            UTM-LAB © {new Date().getFullYear()} — Universidad Nacional de Ingenieria.
            <br />
            Sistema de Adquisicion de Datos.
          </div>
        </div>
      </footer>
    </div>
  );
}
