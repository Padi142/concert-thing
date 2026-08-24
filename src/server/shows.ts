import type { Env } from "./env";
import type { AuthContext } from "./auth";
import { body, HttpError, json, text } from "./http";
export async function listShows(env: Env, auth: AuthContext): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT s.*,
      COALESCE((SELECT json_group_array(a.name)
        FROM show_artists sa JOIN artists a ON a.id = sa.artist_id
        WHERE sa.show_id = s.id), '[]') AS artists_json
    FROM shows s WHERE s.owner_id = ? ORDER BY s.starts_at DESC
  `).bind(auth.userId).all<Record<string, unknown>>();
  return json(result.results.map(({ artists_json, ...show }) => ({ ...show, artists: JSON.parse(String(artists_json)) })));
}

export async function createShow(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const input = await body(request);
  const title = text(input.title, "title");
  const venue = text(input.venue, "venue");
  const locality = input.locality === undefined ? "" : text(input.locality, "locality", false);
  const startsAt = text(input.startsAt, "startsAt");
  const endsAt = input.endsAt ? text(input.endsAt, "endsAt") : null;
  const timezone = text(input.timezone, "timezone");
  if (!Number.isFinite(Date.parse(startsAt)) || (endsAt && !Number.isFinite(Date.parse(endsAt)))) {
    throw new HttpError(400, "Show times must be valid ISO dates");
  }
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new HttpError(400, "endsAt must be after startsAt");
  const artists = Array.isArray(input.artists)
    ? [...new Set(input.artists.map((name) => text(name, "artist")).filter(Boolean))]
    : [];
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const statements = [env.DB.prepare(
    "INSERT INTO shows (id,title,venue,locality,starts_at,ends_at,timezone,created_at,owner_id) VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(id, title, venue, locality, startsAt, endsAt, timezone, createdAt, auth.userId)];
  for (const name of artists) {
    const artistId = crypto.randomUUID();
    statements.push(env.DB.prepare("INSERT INTO artists (id,name) VALUES (?,?) ON CONFLICT(name) DO NOTHING").bind(artistId, name));
    statements.push(env.DB.prepare("INSERT INTO show_artists (show_id,artist_id) SELECT ?,id FROM artists WHERE name = ? COLLATE NOCASE").bind(id, name));
  }
  await env.DB.batch(statements);
  return json({ id, title, venue, locality, starts_at: startsAt, ends_at: endsAt, timezone, artists, created_at: createdAt }, 201);
}
