import { writeFile } from "node:fs/promises";

const target = new URL("../node_modules/workerd/lib/main.js", import.meta.url);
const shim = `// Generated Termux shim. Local workerd preview is unavailable on Android.\nmodule.exports = {\n  default: "/system/bin/false",\n  compatibilityDate: "2026-08-15",\n  version: "1.20260815.1"\n};\n`;
await writeFile(target, shim);
console.log("Installed the Termux Wrangler deployment shim (remote commands only).");
