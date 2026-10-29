import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        lab: {
          bg: "#08090C",
          surface: "#0E1117",
          panel: "#131720",
          card: "#171C26",
          border: "#1E2532",
          borderBright: "#2D3748",
          text: "#F8FAFC",
          muted: "#94A3B8",
          dim: "#64748B",
        },
        laser: {
          DEFAULT: "#ec0d79ff",
          dark: "#91104eff",
          hover: "#FF4D9F",
          glow: "rgba(255, 46, 147, 0.25)",
        },
        cyber: {
          cyan: "#157981ff",
          emerald: "#64b910ff",
          amber: "#e99d1bff",
          rose: "#c62943ff",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
