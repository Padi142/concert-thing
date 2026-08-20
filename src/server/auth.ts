import type { Env } from "./env";
import { body, HttpError, JSON_HEADERS, text } from "./http";
function requestToken(request: Request): string | undefined {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) return bearer;
  const cookie = request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith("owner_session="));
  return cookie ? decodeURIComponent(cookie.slice("owner_session=".length)) : undefined;
}

export function authenticate(request: Request, env: Env): void {
  if (!env.OWNER_TOKEN || requestToken(request) !== env.OWNER_TOKEN) throw new HttpError(401, "Owner token is invalid");
}

export async function createSession(request: Request, env: Env): Promise<Response> {
  const input = await body(request);
  const token = text(input.token, "token");
  if (!env.OWNER_TOKEN || token !== env.OWNER_TOKEN) throw new HttpError(401, "Owner token is invalid");
  return new Response(JSON.stringify({ owner: true }), {
    headers: {
      ...JSON_HEADERS,
      "set-cookie": `owner_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`
    }
  });
}
