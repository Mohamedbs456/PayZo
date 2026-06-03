/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          faint: "var(--color-text-faint)",
          "on-inverse": "var(--color-text-on-inverse)",
        },
        surface: {
          card: "var(--color-surface-card)",
          soft: "var(--color-surface-soft)",
          raised: "var(--color-surface-raised)",
          inverse: "var(--color-surface-inverse)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          soft: "var(--color-border-soft)",
          strong: "var(--color-border-strong)",
        },
        scrim: "var(--color-scrim)",
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-foreground)",
          soft: "var(--color-accent-soft)",
        },
        brand: {
          teal: "var(--color-brand-teal)",
        },
        positive: {
          DEFAULT: "var(--color-positive)",
          soft: "var(--color-positive-soft)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          soft: "var(--color-warning-soft)",
        },
        negative: {
          DEFAULT: "var(--color-negative)",
          soft: "var(--color-negative-soft)",
        },
        info: "var(--color-info)",
      },
      fontFamily: {
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_500Medium"],
        "sans-semibold": ["Inter_600SemiBold"],
        "sans-bold": ["Inter_700Bold"],
        display: ["InstrumentSans_600SemiBold"],
        "display-bold": ["InstrumentSans_700Bold"],
        mono: ["JetBrainsMono_400Regular"],
        "mono-medium": ["JetBrainsMono_500Medium"],
      },
    },
  },
  plugins: [],
};
