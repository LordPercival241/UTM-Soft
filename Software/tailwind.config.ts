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
        theme: {
          canvas: "var(--color-canvas)",
          card: "var(--color-card)",
          cardElevated: "var(--color-card-elevated)",
          cardInner: "var(--color-card-inner)",
          border: "var(--color-border)",
          borderSubtle: "var(--color-border-subtle)",
          main: "var(--color-text-main)",
          muted: "var(--color-text-muted)",
          dim: "var(--color-text-dim)",
          accent: "var(--color-accent)",
          accentHover: "var(--color-accent-hover)",
          telemetry: "var(--color-telemetry)",
          chart: "var(--color-chart)",
        },
        laser: {
          DEFAULT: "var(--color-accent)",
          dark: "var(--color-accent-active)",
          hover: "var(--color-accent-hover)",
          glow: "var(--color-accent-glow)",
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
