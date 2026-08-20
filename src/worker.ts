import type { Env } from "./server/env";
import { HttpError, json } from "./server/http";
import { handle } from "./server/router";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "Unexpected archive error" }, 500);
    }
  }
} satisfies ExportedHandler<Env>;
