import type { Env } from "./env";
import type { AuthContext } from "./auth";
import { HttpError, json } from "./http";
import { getStreamPlaybackInfo, importMediaToStream, serveMedia } from "./media";

const PUBLIC_TOKEN = /^(?:[A-Za-z0-9]{6}|[a-f0-9]{64})$/;
const PUBLIC_TOKEN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function createPublicToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(byte => PUBLIC_TOKEN_ALPHABET[byte % PUBLIC_TOKEN_ALPHABET.length]).join("");
}

function requirePublicToken(token: string): void {
  if (!PUBLIC_TOKEN.test(token)) throw new HttpError(404, "Public Show not found");
}

type ShareRow = { id: string; public_token: string | null };

type VideoShareRow = { id: string; public_token: string | null };

async function shareRow(env: Env, showId: string, ownerId?: string): Promise<ShareRow | null> {
  return env.DB.prepare(`SELECT id,public_token FROM shows WHERE id = ? ${ownerId ? "AND owner_id = ?" : ""}`)
    .bind(...(ownerId ? [showId, ownerId] : [showId])).first<ShareRow>();
}

function shareResponse(request: Request, token: string | null): Response {
  return json({
    shared: Boolean(token),
    url: token ? `${new URL(request.url).origin}/share/${token}` : null,
  });
}

function videoShareResponse(request: Request, token: string | null): Response {
  return json({
    shared: Boolean(token),
    // The URL intentionally points at the video bytes. Discord and similar
    // clients can embed a direct video response, while the token keeps the
    // original R2 object private and revocable.
    url: token ? `${new URL(request.url).origin}/video/${token}.mp4` : null,
  });
}

export async function showShareStatus(request: Request, env: Env, showId: string, auth: AuthContext): Promise<Response> {
  const show = await shareRow(env, showId, auth.userId);
  if (!show) throw new HttpError(404, "Show not found");
  return shareResponse(request, show.public_token);
}

export async function createShowShare(request: Request, env: Env, showId: string, auth: AuthContext): Promise<Response> {
  const show = await shareRow(env, showId, auth.userId);
  if (!show) throw new HttpError(404, "Show not found");
  if (!show.public_token) {
    let created = false;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        const result = await env.DB.prepare("UPDATE shows SET public_token = ? WHERE id = ? AND owner_id = ? AND public_token IS NULL")
          .bind(createPublicToken(), showId, auth.userId).run();
        created = result.meta.changes > 0;
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
  }
  const shared = await shareRow(env, showId, auth.userId);
  if (!shared?.public_token) throw new HttpError(500, "Could not create public Show link");
  return shareResponse(request, shared.public_token);
}

export async function revokeShowShare(request: Request, env: Env, showId: string, auth: AuthContext): Promise<Response> {
  const show = await shareRow(env, showId, auth.userId);
  if (!show) throw new HttpError(404, "Show not found");
  if (show.public_token) {
    await env.DB.prepare("UPDATE shows SET public_token = NULL WHERE id = ? AND owner_id = ?").bind(showId, auth.userId).run();
  }
  return shareResponse(request, null);
}

async function videoShareRow(env: Env, mediaId: string, ownerId: string): Promise<VideoShareRow | null> {
  return env.DB.prepare(`
    SELECT id,public_token
    FROM media_items
    WHERE id = ? AND owner_id = ? AND media_type = 'video' AND status = 'ready'
  `).bind(mediaId, ownerId).first<VideoShareRow>();
}

export async function videoShareStatus(request: Request, env: Env, mediaId: string, auth: AuthContext): Promise<Response> {
  const video = await videoShareRow(env, mediaId, auth.userId);
  if (!video) throw new HttpError(404, "Ready video not found");
  return videoShareResponse(request, video.public_token);
}

export async function createVideoShare(request: Request, env: Env, mediaId: string, auth: AuthContext): Promise<Response> {
  const video = await videoShareRow(env, mediaId, auth.userId);
  if (!video) throw new HttpError(404, "Ready video not found");
  if (!video.public_token) {
    let created = false;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        const result = await env.DB.prepare("UPDATE media_items SET public_token = ? WHERE id = ? AND owner_id = ? AND media_type = 'video' AND status = 'ready' AND public_token IS NULL")
          .bind(createPublicToken(), mediaId, auth.userId).run();
        created = result.meta.changes > 0;
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
  }
  const shared = await videoShareRow(env, mediaId, auth.userId);
  if (!shared?.public_token) throw new HttpError(500, "Could not create public video link");
  return videoShareResponse(request, shared.public_token);
}

export async function revokeVideoShare(request: Request, env: Env, mediaId: string, auth: AuthContext): Promise<Response> {
  const video = await videoShareRow(env, mediaId, auth.userId);
  if (!video) throw new HttpError(404, "Ready video not found");
  if (video.public_token) {
    await env.DB.prepare("UPDATE media_items SET public_token = NULL WHERE id = ? AND owner_id = ?").bind(mediaId, auth.userId).run();
  }
  return videoShareResponse(request, null);
}

type PublicShowRow = {
  id: string;
  title: string;
  venue: string;
  locality: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  owner_id: string | null;
  artists_json: string;
};

type PublicVideoRow = {
  id: string;
  original_name: string;
  content_type: string;
  byte_size: number;
  duration_ms: number | null;
  captured_at: string | null;
  created_at: string;
  stream_uid: string | null;
  stream_status: string | null;
};

type PublicSongRow = {
  id: string;
  media_id: string;
  title: string;
  artist: string;
  start_ms: number;
  end_ms: number | null;
};

export async function getPublicShow(request: Request, env: Env, token: string): Promise<Response> {
  requirePublicToken(token);
  const show = await env.DB.prepare(`
    SELECT s.id,s.title,s.venue,s.locality,s.starts_at,s.ends_at,s.timezone,s.owner_id,
      COALESCE((SELECT json_group_array(a.name)
        FROM show_artists sa JOIN artists a ON a.id = sa.artist_id
        WHERE sa.show_id = s.id), '[]') AS artists_json
    FROM shows s WHERE s.public_token = ?
  `).bind(token).first<PublicShowRow>();
  if (!show) throw new HttpError(404, "Public Show not found");

  const [videos, songs] = await Promise.all([
    env.DB.prepare(`
      SELECT m.id,m.original_name,m.content_type,m.byte_size,m.duration_ms,m.captured_at,m.created_at,m.stream_uid,m.stream_status
      FROM media_items m
      JOIN shows owner_show ON owner_show.id = m.show_id AND owner_show.owner_id IS m.owner_id
      WHERE m.show_id = ? AND m.media_type = 'video' AND m.status = 'ready'
      ORDER BY CASE WHEN m.captured_at IS NULL THEN 1 ELSE 0 END, m.captured_at, m.created_at
    `).bind(show.id).all<PublicVideoRow>(),
    env.DB.prepare(`
      SELECT sm.id,sm.media_id,sm.start_ms,sm.end_ms,
        COALESCE(sm.owner_title,s.title,sm.candidate_title) AS title,
        COALESCE(sm.owner_artist,s.primary_artist,sm.candidate_artist,'') AS artist
      FROM song_matches sm
      JOIN media_items m ON m.id = sm.media_id
      JOIN shows owner_show ON owner_show.id = m.show_id AND owner_show.owner_id IS m.owner_id
      LEFT JOIN songs s ON s.id = sm.song_id
      WHERE m.show_id = ? AND m.owner_id IS (SELECT owner_id FROM shows WHERE id = ?)
        AND m.media_type = 'video' AND m.status = 'ready'
        AND sm.review_state != 'rejected'
        AND COALESCE(sm.owner_title,s.title,sm.candidate_title) IS NOT NULL
      ORDER BY sm.media_id,sm.start_ms
    `).bind(show.id, show.id).all<PublicSongRow>(),
  ]);
  const songsByMedia = new Map<string, PublicSongRow[]>();
  for (const song of songs.results) {
    const matches = songsByMedia.get(song.media_id) ?? [];
    matches.push(song);
    songsByMedia.set(song.media_id, matches);
  }
  const publicVideos = await Promise.all(videos.results.map(async video => {
    if (!video.stream_uid && !video.stream_status) {
      await importMediaToStream(request, env, video.id, undefined, { showId: show.id, ownerId: show.owner_id }).catch(() => undefined);
    }
    const stream = await getStreamPlaybackInfo(env, video.id, { showId: show.id, ownerId: show.owner_id });
    const { stream_uid: _streamUid, stream_status: _streamStatus, ...metadata } = video;
    return {
      ...metadata,
      stream,
      songs: songsByMedia.get(video.id) ?? [],
      download_url: `/api/public/shows/${token}/media/${video.id}/content?download=1`,
    };
  }));
  return json({
    show: {
      id: show.id,
      title: show.title,
      venue: show.venue,
      locality: show.locality,
      starts_at: show.starts_at,
      ends_at: show.ends_at,
      timezone: show.timezone,
      artists: JSON.parse(show.artists_json),
    },
    videos: publicVideos,
  });
}

export async function servePublicShowMedia(request: Request, env: Env, token: string, mediaId: string): Promise<Response> {
  requirePublicToken(token);
  const show = await env.DB.prepare("SELECT id,owner_id FROM shows WHERE public_token = ?").bind(token).first<{ id: string; owner_id: string | null }>();
  if (!show) throw new HttpError(404, "Public Show not found");
  return serveMedia(request, env, mediaId, {
    showId: show.id,
    ownerId: show.owner_id,
    mediaType: "video",
    isPublic: true,
    download: true,
  });
}

export async function servePublicVideo(request: Request, env: Env, token: string): Promise<Response> {
  requirePublicToken(token);
  const video = await env.DB.prepare(`
    SELECT id,owner_id
    FROM media_items
    WHERE public_token = ? AND media_type = 'video' AND status = 'ready'
  `).bind(token).first<{ id: string; owner_id: string | null }>();
  if (!video) throw new HttpError(404, "Public video not found");
  return serveMedia(request, env, video.id, {
    ownerId: video.owner_id,
    mediaType: "video",
    isPublic: true,
  });
}
