/** Hallmark · macrostructure: Workbench · theme: Cobalt · tone: utilitarian · anchor hue: cobalt */
/** Hallmark · dark appearance: venue-night · base/elevated surfaces · restrained electric cobalt */
/** Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · dark contrast: pass (40–41) */
import { useColorScheme } from "react-native";
import { vars } from "nativewind";

const spacing = {
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  eight: 32,
  ten: 40,
} as const;

const radii = {
  control: 10,
  panel: 18,
  media: 12,
} as const;

const typography = {
  display: "SpaceGrotesk_600SemiBold",
  body: "IBMPlexSans_400Regular",
  bodyMedium: "IBMPlexSans_500Medium",
  bodyBold: "IBMPlexSans_600SemiBold",
} as const;

export const lightTokens = {
  colors: {
    canvas: "#F5F7FB",
    surface: "#FCFDFF",
    ink: "#151A24",
    muted: "#596579",
    subtle: "#6B7587",
    line: "#D6DCE6",
    controlLine: "#7C8798",
    accent: "#2166F3",
    accentInk: "#FCFDFF",
    accentSoft: "#EAF1FF",
    danger: "#B42318",
    dangerSoft: "#FDECEC",
    success: "#087443",
    successSoft: "#E7F6EE",
    placeholder: "#E7EBF2",
    mediaInk: "#F7F9FC",
    scrim: "rgba(23, 26, 32, 0.44)",
    scrimStrong: "rgba(23, 26, 32, 0.8)",
  },
  spacing,
  radii,
  typography,
} as const;

export const darkTokens = {
  colors: {
    canvas: "#0B0F17",
    surface: "#131A26",
    ink: "#F1F5FB",
    muted: "#A7B1C2",
    subtle: "#8995A8",
    line: "#293243",
    controlLine: "#536078",
    accent: "#6F9BFF",
    accentInk: "#0B0F17",
    accentSoft: "#172B54",
    danger: "#FF8B85",
    dangerSoft: "#421F22",
    success: "#58D69A",
    successSoft: "#17382B",
    placeholder: "#1B2432",
    mediaInk: "#F7F9FC",
    scrim: "rgba(0, 0, 0, 0.58)",
    scrimStrong: "rgba(5, 8, 14, 0.88)",
  },
  spacing,
  radii,
  typography,
} as const;

export const themeVariables = {
  light: vars({
    "--color-canvas": "245 247 251",
    "--color-surface": "252 253 255",
    "--color-ink": "21 26 36",
    "--color-muted": "89 101 121",
    "--color-subtle": "107 117 135",
    "--color-line": "214 220 230",
    "--color-control": "124 135 152",
    "--color-blue": "33 102 243",
    "--color-accent-ink": "252 253 255",
    "--color-blue-soft": "234 241 255",
    "--color-media-ink": "247 249 252",
    "--color-danger": "180 35 24",
    "--color-danger-soft": "253 236 236",
    "--color-success": "8 116 67",
    "--color-success-soft": "231 246 238",
  }),
  dark: vars({
    "--color-canvas": "11 15 23",
    "--color-surface": "19 26 38",
    "--color-ink": "241 245 251",
    "--color-muted": "167 177 194",
    "--color-subtle": "137 149 168",
    "--color-line": "41 50 67",
    "--color-control": "83 96 120",
    "--color-blue": "111 155 255",
    "--color-accent-ink": "11 15 23",
    "--color-blue-soft": "23 43 84",
    "--color-media-ink": "247 249 252",
    "--color-danger": "255 139 133",
    "--color-danger-soft": "66 31 34",
    "--color-success": "88 214 154",
    "--color-success-soft": "23 56 43",
  }),
} as const;

export function useThemeTokens() {
  return useColorScheme() === "dark" ? darkTokens : lightTokens;
}

// Keep the original export for non-React code that only needs shared metrics.
export const tokens = lightTokens;
export type ThemeTokens = typeof lightTokens | typeof darkTokens;
