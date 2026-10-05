import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { demoApi } from "./demoApi.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("."),
  plugins: [react(), demoApi()],
  css: { postcss: here("../../postcss.config.js") },
  resolve: { alias: { "@clerk/react": here("./clerk-mock.tsx") } },
  server: { port: 5199, strictPort: true, fs: { allow: [here("../..")] } },
});
