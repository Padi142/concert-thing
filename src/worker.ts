import type { Env } from "./server/env";
import { HttpError, errorBody, json } from "./server/http";
import { runStorageMaintenance } from "./server/media";
import { handle } from "./server/router";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json(errorBody(error), error.status);
      console.error(error);
      return json({ error: "Unexpected archive error" }, 500);
    }
  },
  async scheduled(_controller, env) {
    try {
      await runStorageMaintenance(env);
    } catch (error) {
      console.error("Storage maintenance failed", error);
    }
  },
} satisfies ExportedHandler<Env>;
