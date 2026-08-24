/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--c-canvas)",
        surface: "var(--c-surface)",
        ink: "var(--c-ink)",
        muted: "var(--c-muted)",
        subtle: "var(--c-subtle)",
        line: "var(--c-line)",
        control: "var(--c-control-line)",
        blue: "var(--c-accent)",
        accentInk: "var(--c-accent-ink)",
        accentSoft: "var(--c-accent-soft)",
        mediaInk: "var(--c-media-ink)",
        danger: "var(--c-danger)",
        dangerSoft: "var(--c-danger-soft)",
        success: "var(--c-success)",
        successSoft: "var(--c-success-soft)",
        placeholder: "var(--c-placeholder)",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
      },
      borderRadius: { control: "10px", tile: "12px", panel: "18px" },
    },
  },
  plugins: [],
};
