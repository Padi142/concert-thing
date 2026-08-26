import { verifyToken } from "@clerk/backend";
import type { Env } from "./env";
import { HttpError, json } from "./http";
import { ownerStorageInitializationStatement } from "./storage";

/** The only tenant identity accepted by private archive operations. */
export type AuthContext = {
  userId: string;
};

function authorizedParties(env: Env): string[] | undefined {
  if (!env.CLERK_AUTHORIZED_PARTIES) return undefined;
  const parties = env.CLERK_AUTHORIZED_PARTIES.split(",").map(value => value.trim()).filter(Boolean);
  return parties.length ? parties : undefined;
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
}

function sessionToken(request: Request): string | undefined {
  const bearer = bearerToken(request);
  if (bearer) return bearer;
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "__session") {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Native Clerk sessions use a bearer token without a browser cookie. Clerk
 * omits `azp` for those sessions, so the web-origin allowlist must not reject
 * an otherwise valid native token. Browser requests still need a cookie or an
 * explicit `azp` that matches the configured allowlist.
 */
function isNativeBearerRequest(request: Request): boolean {
  return Boolean(bearerToken(request) && !request.headers.get("cookie"));
}

/**
 * Authenticate a request with Clerk's session token. We explicitly extract
 * both Authorization: Bearer and the normal __session cookie so this works
 * for the mobile Bearer flow as well as browser requests.
 */
export async function authenticate(request: Request, env: Env): Promise<AuthContext> {
  const token = sessionToken(request);
  if (!env.CLERK_JWT_KEY) {
    throw new HttpError(503, "Clerk authentication is not configured");
  }
  if (!token) throw new HttpError(401, "Authentication is required");

  try {
    const claims = await verifyToken(token, {
      jwtKey: env.CLERK_JWT_KEY,
    });
    const parties = authorizedParties(env);
    if (parties) {
      if (claims.azp) {
        if (!parties.includes(claims.azp)) throw new Error("invalid authorized party");
      } else if (!isNativeBearerRequest(request)) {
        throw new Error("missing authorized party");
      }
    }
    if (!claims.sub) throw new Error("missing user");
    return { userId: claims.sub };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Authentication is required");
  }
}

/**
 * Atomically assign the pre-authentication archive to the first Clerk user.
 * The migration creates a single-row claim guard. A later user can never
 * claim the same NULL-owned records, even if the endpoint is called again.
 */
export async function claimLegacyData(env: Env, auth: AuthContext): Promise<Response> {
  const now = new Date().toISOString();
  const claimStatement = env.DB.prepare(`
    INSERT INTO archive_legacy_claim (id,user_id,claimed_at)
    SELECT 1,?,?
    WHERE NOT EXISTS (SELECT 1 FROM archive_legacy_claim)
      AND NOT EXISTS (SELECT 1 FROM shows WHERE owner_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM media_items WHERE owner_id IS NOT NULL)
  `).bind(auth.userId, now);
  // The insert and both updates are sent in one D1 batch. If a claim already
  // exists, the conditional updates are no-ops unless it belongs to this user.
  let results: D1Result[];
  try {
    results = await env.DB.batch([
      claimStatement,
      env.DB.prepare("UPDATE shows SET owner_id = ? WHERE owner_id IS NULL AND EXISTS (SELECT 1 FROM archive_legacy_claim WHERE id = 1 AND user_id = ?)").bind(auth.userId, auth.userId),
      env.DB.prepare("UPDATE media_items SET owner_id = ? WHERE owner_id IS NULL AND EXISTS (SELECT 1 FROM archive_legacy_claim WHERE id = 1 AND user_id = ?)").bind(auth.userId, auth.userId),
      ownerStorageInitializationStatement(env.DB, auth.userId, now),
    ]);
  } catch (error) {
    // A concurrent first claim can win the single-row constraint. Treat that
    // expected race as an ordinary empty result for the losing user.
    let claim: { user_id: string } | null = null;
    try {
      claim = await env.DB.prepare("SELECT user_id FROM archive_legacy_claim WHERE id = 1").first<{ user_id: string }>();
    } catch {
      // Preserve the original database error if the claim row cannot be read.
    }
    if (claim) return json({ claimed: false, legacyOwner: claim.user_id === auth.userId, shows: 0, mediaItems: 0 });
    throw error;
  }
  if (!results[0]?.meta?.changes) {
    const claim = await env.DB.prepare("SELECT user_id FROM archive_legacy_claim WHERE id = 1").first<{ user_id: string }>();
    return json({ claimed: false, legacyOwner: claim?.user_id === auth.userId, shows: 0, mediaItems: 0 });
  }
  return json({
    claimed: true,
    legacyOwner: true,
    shows: Number(results[1]?.meta?.changes ?? 0),
    mediaItems: Number(results[2]?.meta?.changes ?? 0),
  });
}
