"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("utm_theme") as ThemeMode | null;
      if (stored === "light" || stored === "dark") {
        setThemeState(stored);
        document.documentElement.setAttribute("data-theme", stored);
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    try {
      localStorage.setItem("utm_theme", mode);
    } catch {
      /* ignore storage errors */
    }
    document.documentElement.setAttribute("data-theme", mode);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

