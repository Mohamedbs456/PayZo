export const palette = {
  light: {
    textPrimary: "#0e1b2c",
    textSecondary: "#457b9d",
    textMuted: "rgba(29,53,87,0.6)",
    textFaint: "rgba(29,53,87,0.4)",
    textOnInverse: "#f1faee",
    surfaceCard: "#ffffff",
    surfaceSoft: "#f1faee",
    surfaceRaised: "#f8fcf6",
    surfaceInverse: "#0e1b2c",
    border: "rgba(29,53,87,0.12)",
    borderSoft: "rgba(29,53,87,0.08)",
    borderStrong: "#a8dadc",
    scrim: "#0e1b2c",
    accent: "#1d3557",
    accentForeground: "#f1faee",
    accentSoft: "#cae8ea",
    brandTeal: "#a8dadc",
    positive: "#5dcaa5",
    positiveSoft: "#dff5ec",
    warning: "#ef9f27",
    warningSoft: "#fbe9c9",
    negative: "#e63946",
    negativeSoft: "#fde6e6",
    info: "#0ea5e9",
  },
  dark: {
    textPrimary: "#f1faee",
    textSecondary: "#a8dadc",
    textMuted: "rgba(241,250,238,0.6)",
    textFaint: "rgba(241,250,238,0.4)",
    textOnInverse: "#0e1b2c",
    surfaceCard: "#15263c",
    surfaceSoft: "#0a1322",
    surfaceRaised: "#1c3050",
    surfaceInverse: "#f1faee",
    border: "rgba(168,218,220,0.18)",
    borderSoft: "rgba(168,218,220,0.10)",
    borderStrong: "#457b9d",
    scrim: "#000000",
    accent: "#a8dadc",
    accentForeground: "#0e1b2c",
    accentSoft: "rgba(168,218,220,0.16)",
    brandTeal: "#cae8ea",
    positive: "#5dcaa5",
    positiveSoft: "rgba(93,202,165,0.18)",
    warning: "#ef9f27",
    warningSoft: "rgba(239,159,39,0.18)",
    negative: "#e63946",
    negativeSoft: "rgba(230,57,70,0.18)",
    info: "#0ea5e9",
  },
} as const;

export type ThemeName = keyof typeof palette;
export type Palette = (typeof palette)[ThemeName];

export function paletteFor(scheme: ThemeName | null | undefined): Palette {
  return scheme === "dark" ? palette.dark : palette.light;
}

// CSS custom-property map for a scheme, fed to NativeWind's vars() on a root
// wrapper. This is what actually drives the token swap at runtime — NativeWind
// only auto-swaps CSS-variable blocks for the SYSTEM scheme, not for the
// in-app setColorScheme toggle, so we inject the variables ourselves.
export function cssVars(scheme: ThemeName): Record<string, string> {
  const p = paletteFor(scheme);
  return {
    "--color-text-primary": p.textPrimary,
    "--color-text-secondary": p.textSecondary,
    "--color-text-muted": p.textMuted,
    "--color-text-faint": p.textFaint,
    "--color-text-on-inverse": p.textOnInverse,
    "--color-surface-card": p.surfaceCard,
    "--color-surface-soft": p.surfaceSoft,
    "--color-surface-raised": p.surfaceRaised,
    "--color-surface-inverse": p.surfaceInverse,
    "--color-border": p.border,
    "--color-border-soft": p.borderSoft,
    "--color-border-strong": p.borderStrong,
    "--color-scrim": p.scrim,
    "--color-accent": p.accent,
    "--color-accent-foreground": p.accentForeground,
    "--color-accent-soft": p.accentSoft,
    "--color-brand-teal": p.brandTeal,
    "--color-positive": p.positive,
    "--color-positive-soft": p.positiveSoft,
    "--color-warning": p.warning,
    "--color-warning-soft": p.warningSoft,
    "--color-negative": p.negative,
    "--color-negative-soft": p.negativeSoft,
    "--color-info": p.info,
  };
}

type GradientStop = {
  colors: [string, string, ...string[]];
  locations: [number, number, ...number[]];
  angle: number;
};

export const gradients = {
  authNavy: {
    colors: ["#0e1b2c", "#1d3557", "#457b9d"],
    locations: [0, 0.393, 0.714],
    angle: 123.72,
  },
  balanceTeal: {
    colors: ["#063b4d", "#104d64", "#1f7a8c"],
    locations: [0, 0.366, 0.732],
    angle: 149.69,
  },
  avatar: {
    colors: ["#1f7a8c", "#062b3a"],
    locations: [0, 0.714],
    angle: 135.91,
  },
  avatarDark: {
    colors: ["#1f7a8c", "#021b25"],
    locations: [0, 0.714],
    angle: 135.91,
  },
} satisfies Record<string, GradientStop>;

// expo-linear-gradient takes start/end points, not a CSS angle. CSS 0deg
// points up and grows clockwise; this maps that to top-left-origin fractions.
export function angleToStartEnd(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  return {
    start: { x: 0.5 - 0.5 * sin, y: 0.5 + 0.5 * cos },
    end: { x: 0.5 + 0.5 * sin, y: 0.5 - 0.5 * cos },
  };
}

export const radii = {
  input: 12,
  button: 12,
  card: 12,
  icon: 14,
  section: 16,
  auth: 20,
  pill: 9999,
} as const;

export const motion = {
  press: 100,
  fast: 150,
  medium: 200,
  slow: 250,
  route: 180,
  easeOut: [0.16, 1, 0.3, 1],
  easeInOut: [0.65, 0, 0.35, 1],
  easeIn: [0.5, 0, 0.75, 0],
} as const;
