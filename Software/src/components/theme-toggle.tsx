"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Alternar modo visual"
      title={theme === "dark" ? "Cambiar a Modo Calido (Papel)" : "Cambiar a Modo Oscuro Suave"}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-sm border transition-all ${
        theme === "dark"
          ? "bg-[#1B2026] border-[#2B323B] text-[#E1E5EA] hover:border-[#38BDF8]"
          : "bg-[#FFFFFF] border-[#E2DDD5] text-[#1E293B] hover:border-[#0284C7] shadow-sm"
      } ${className}`}
    >
      {theme === "dark" ? (
        <>
          <Sun size={13} className="text-[#38BDF8]" />
          <span className="hidden sm:inline text-[11px]">CALIDO</span>
        </>
      ) : (
        <>
          <Moon size={13} className="text-[#0284C7]" />
          <span className="hidden sm:inline text-[11px]">OSCURO</span>
        </>
      )}
    </button>
  );
}

