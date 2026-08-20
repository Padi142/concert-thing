/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#171a18", paper: "#f3f0e8", acid: "#d8ff43", ember: "#df553d" },
      fontFamily: { sans: ["DM Sans", "sans-serif"], display: ["Playfair Display", "serif"] },
      boxShadow: { hard: "5px 5px 0 #171a18" },
    },
  },
  plugins: [],
};
