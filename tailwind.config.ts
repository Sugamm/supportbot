import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        surface2: "rgb(var(--surface-2-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        fail: "rgb(var(--fail-rgb) / <alpha-value>)",
        pass: "rgb(var(--accent-rgb) / <alpha-value>)",
        warn: "rgb(var(--warn-rgb) / <alpha-value>)",
        line: "var(--line)",
      },
      borderColor: {
        DEFAULT: "var(--line)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(199,249,76,.35), 0 0 30px -8px rgba(199,249,76,.45)",
      },
    },
  },
  plugins: [],
};

export default config;
