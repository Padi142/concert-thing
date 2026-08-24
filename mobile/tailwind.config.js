/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  presets: [require("nativewind/preset")],
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        subtle: "rgb(var(--color-subtle) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        control: "rgb(var(--color-control) / <alpha-value>)",
        blue: "rgb(var(--color-blue) / <alpha-value>)",
        accentInk: "rgb(var(--color-accent-ink) / <alpha-value>)",
        blueSoft: "rgb(var(--color-blue-soft) / <alpha-value>)",
        mediaInk: "rgb(var(--color-media-ink) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        dangerSoft: "rgb(var(--color-danger-soft) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        successSoft: "rgb(var(--color-success-soft) / <alpha-value>)"
      },
      fontFamily: {
        display: ["SpaceGrotesk_600SemiBold"],
        sans: ["IBMPlexSans_400Regular"]
      }
    }
  },
  plugins: []
};
