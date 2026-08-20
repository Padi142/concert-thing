import type { Env } from "./env";
import { body, HttpError, json, text } from "./http";
export async function listMedia(request: Request, env: Env): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const result = await env.DB.prepare(`
    SELECT m.id, m.original_name, m.media_type, m.content_type, m.byte_size, m.duration_ms,
      m.captured_at, m.captured_at_source, m.status, m.show_id, m.assignment_method, m.created_at,
      s.title AS show_title
    FROM media_items m LEFT JOIN shows s ON s.id = m.show_id
    WHERE m.status != 'uploading' AND (? = '' OR EXISTS (
      SELECT 1 FROM song_matches sm JOIN songs song ON song.id = sm.song_id
      WHERE sm.media_id = m.id AND sm.review_state IN ('confirmed', 'edited', 'manual')
        AND (song.title LIKE ? ESCAPE '\\' OR song.primary_artist LIKE ? ESCAPE '\\')
    ))
    ORDER BY m.created_at DESC
  `).bind(query, pattern, pattern).all();
  return json(result.results);
}

export function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "media";
}

export async function beginUpload(request: Request, env: Env): Promise<Response> {
  const input = await body(request);
  const originalName = text(input.name, "name");
  const contentType = text(input.type, "type");
  const byteSize = Number(input.size);
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) throw new HttpError(400, "size must be a positive integer");
  const mediaType = contentType.startsWith("image/") ? "photo" : contentType.startsWith("video/") ? "video" : null;
  if (!mediaType) throw new HttpError(415, "Only photo and video Media Items are supported");
  const contentHash = mediaType === "video" ? text(input.contentHash, "contentHash").toLowerCase() : null;
  if (contentHash && !/^[a-f0-9]{64}$/.test(contentHash)) throw new HttpError(400, "contentHash must be a SHA-256 hash");

  async function duplicateResponse() {
    const duplicate = await env.DB.prepare(`
      SELECT id FROM media_items
      WHERE content_hash = ? AND status IN ('uploading', 'ready')
      LIMIT 1
    `).bind(contentHash).first<{ id: string }>();
    return duplicate
      ? json({ error: "Duplicate video — not uploaded", duplicate: true, duplicateMediaId: duplicate.id }, 409)
      : null;
  }

  const duplicate = await duplicateResponse();
  if (duplicate) return duplicate;

  const id = crypto.randomUUID();
  const key = `originals/${id}/${safeName(originalName)}`;
  const upload = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType } });
  try {
    await env.DB.prepare(`
      INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,content_hash,status,upload_id,created_at)
      VALUES (?,?,?,?,?,?,?,'uploading',?,?)
    `).bind(id, key, originalName, mediaType, contentType, byteSize, contentHash, upload.uploadId, new Date().toISOString()).run();
  } catch (error) {
    try { await upload.abort(); } catch (abortError) { console.error("Could not abort duplicate multipart upload", abortError); }
    const duplicateAfterRace = await duplicateResponse();
    if (duplicateAfterRace) return duplicateAfterRace;
    throw error;
  }
  return json({ mediaId: id, uploadId: upload.uploadId, chunkSize: 8 * 1024 * 1024, completed: [] }, 201);
}

type UploadRow = {
  object_key: string;
  upload_id: string | null;
  status: string;
  captured_at: string | null;
  show_id: string | null;
  assignment_method: string | null;
};

async function uploadRow(id: string, env: Env): Promise<UploadRow> {
  const row = await env.DB.prepare("SELECT object_key,upload_id,status,captured_at,show_id,assignment_method FROM media_items WHERE id = ?").bind(id).first<UploadRow>();
  if (!row) throw new HttpError(404, "Media Item not found");
  return row;
}

async function requireActiveUpload(id: string, env: Env): Promise<UploadRow & { upload_id: string }> {
  const row = await uploadRow(id, env);
  if (row.status !== "uploading" || !row.upload_id) throw new HttpError(409, "Media Item is not being uploaded");
  return row as UploadRow & { upload_id: string };
}

export async function configureUpload(request: Request, env: Env, mediaId: string): Promise<Response> {
  const input = await body(request);
  const capturedAt = input.capturedAt ? text(input.capturedAt, "capturedAt") : null;
  if (capturedAt && !Number.isFinite(Date.parse(capturedAt))) throw new HttpError(400, "capturedAt must be an ISO date");
  const capturedAtSource = capturedAt && input.source === "embedded_metadata" ? "embedded_metadata" : capturedAt ? "file_modified" : null;
  const durationMs = input.durationMs === null || input.durationMs === undefined ? null : Number(input.durationMs);
  if (durationMs !== null && (!Number.isSafeInteger(durationMs) || durationMs < 0)) throw new HttpError(400, "durationMs must be a positive integer");
  const showId = input.showId === null || input.showId === undefined ? null : text(input.showId, "showId");
  if (showId && !await env.DB.prepare("SELECT id FROM shows WHERE id = ?").bind(showId).first()) throw new HttpError(404, "Show not found");
  const result = await env.DB.prepare(`
    UPDATE media_items SET captured_at = ?, captured_at_source = ?, duration_ms = ?, show_id = ?, assignment_method = ?
    WHERE id = ? AND status = 'uploading'
  `).bind(capturedAt, capturedAtSource, durationMs, showId, showId ? "owner" : null, mediaId).run();
  if (!result.meta.changes) {
    const existing = await uploadRow(mediaId, env);
    if (existing.status === "ready") return json({ id: mediaId, status: "ready" });
    throw new HttpError(404, "Active upload not found");
  }
  return json({ id: mediaId, capturedAt, showId });
}

export async function cancelUpload(env: Env, mediaId: string): Promise<Response> {
  const row = await requireActiveUpload(mediaId, env);
  await env.MEDIA.resumeMultipartUpload(row.object_key, row.upload_id).abort();
  await env.DB.prepare("DELETE FROM media_items WHERE id = ? AND status = 'uploading'").bind(mediaId).run();
  return new Response(null, { status: 204 });
}

export async function uploadPart(request: Request, env: Env, mediaId: string, partNumber: number): Promise<Response> {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new HttpError(400, "Invalid part number");
  if (!request.body) throw new HttpError(400, "Part body is required");
  const row = await requireActiveUpload(mediaId, env);
  const part = await env.MEDIA.resumeMultipartUpload(row.object_key, row.upload_id).uploadPart(partNumber, request.body);
  return json({ partNumber: part.partNumber, etag: part.etag });
}

export async function completeUpload(request: Request, env: Env, mediaId: string): Promise<Response> {
  const input = await body(request);
  if (!Array.isArray(input.parts) || !input.parts.length) throw new HttpError(400, "parts are required");
  const parts = input.parts.map((part) => {
    if (!part || typeof part !== "object") throw new HttpError(400, "Invalid upload part");
    const value = part as Record<string, unknown>;
    const partNumber = Number(value.partNumber);
    const etag = text(value.etag, "etag");
    if (!Number.isInteger(partNumber) || partNumber < 1) throw new HttpError(400, "Invalid part number");
    return { partNumber, etag };
  }).sort((a, b) => a.partNumber - b.partNumber);
  let row = await uploadRow(mediaId, env);
  if (row.status === "uploading" && row.upload_id) {
    const objectAlreadyCompleted = await env.MEDIA.head(row.object_key);
    if (!objectAlreadyCompleted) await env.MEDIA.resumeMultipartUpload(row.object_key, row.upload_id).complete(parts);
    await env.DB.prepare("UPDATE media_items SET status = 'ready', upload_id = NULL WHERE id = ?").bind(mediaId).run();
    row = await uploadRow(mediaId, env);
  }
  if (row.status !== "ready") throw new HttpError(409, "Media Item cannot be completed");
  if (!row.show_id && !row.assignment_method && row.captured_at) {
    const candidates = await env.DB.prepare(`
      SELECT id FROM shows
      WHERE unixepoch(?) BETWEEN unixepoch(starts_at)
        AND unixepoch(COALESCE(ends_at, datetime(starts_at, '+6 hours')))
      ORDER BY starts_at LIMIT 2
    `).bind(row.captured_at).all<{ id: string }>();
    if (candidates.results.length === 1) {
      row.show_id = candidates.results[0].id;
      row.assignment_method = "automatic";
      await env.DB.prepare("UPDATE media_items SET show_id = ?, assignment_method = 'automatic' WHERE id = ? AND assignment_method IS NULL").bind(row.show_id, mediaId).run();
    }
  }
  return json({ id: mediaId, status: "ready", assignment: row.show_id ? { showId: row.show_id, method: row.assignment_method } : null });
}

export async function assignMedia(request: Request, env: Env, mediaId: string): Promise<Response> {
  const input = await body(request);
  const showId = input.showId === null ? null : text(input.showId, "showId");
  if (showId) {
    const show = await env.DB.prepare("SELECT id FROM shows WHERE id = ?").bind(showId).first();
    if (!show) throw new HttpError(404, "Show not found");
  }
  const result = await env.DB.prepare("UPDATE media_items SET show_id = ?, assignment_method = 'owner' WHERE id = ? AND status = 'ready'").bind(showId, mediaId).run();
  if (!result.meta.changes) throw new HttpError(404, "Ready Media Item not found");
  return json({ id: mediaId, showId });
}

export function parseRange(value: string | null, size: number): { offset: number; length: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match) throw new HttpError(416, "Invalid byte range");
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!suffix) throw new HttpError(416, "Invalid byte range");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start >= size || end < start) throw new HttpError(416, "Range is outside the Media Item");
  return { offset: start, length: end - start + 1 };
}

export async function serveMedia(request: Request, env: Env, mediaId: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT object_key,content_type,original_name FROM media_items WHERE id = ? AND status = 'ready'").bind(mediaId).first<{ object_key: string; content_type: string; original_name: string }>();
  if (!row) throw new HttpError(404, "Media Item not found");
  const head = await env.MEDIA.head(row.object_key);
  if (!head) throw new HttpError(404, "Original media is missing");
  const range = parseRange(request.headers.get("range"), head.size);
  const object = request.method === "HEAD" ? null : await env.MEDIA.get(row.object_key, range ? { range } : undefined);
  if (request.method !== "HEAD" && !object) throw new HttpError(404, "Original media is missing");
  const headers = new Headers({
    "content-type": row.content_type,
    "content-length": String(range?.length ?? head.size),
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "etag": head.httpEtag,
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.original_name)}`
  });
  if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
  return new Response(object?.body ?? null, { status: range ? 206 : 200, headers });
}

function streamSourceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function importMediaToStream(request: Request, env: Env, mediaId: string): Promise<Response> {
  const media = await env.DB.prepare(`
    SELECT id,original_name,media_type,stream_uid,stream_status FROM media_items
    WHERE id = ? AND status = 'ready'
  `).bind(mediaId).first<{ id: string; original_name: string; media_type: string; stream_uid: string | null; stream_status: string | null }>();
  if (!media || media.media_type !== "video") throw new HttpError(404, "Ready video not found");
  if (media.stream_uid || media.stream_status === "importing") return json({ id: mediaId, streamStatus: media.stream_status || "processing" });

  const token = streamSourceToken();
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE media_items SET stream_status = 'importing', stream_source_token = ?, stream_error = NULL WHERE id = ? AND stream_uid IS NULL")
    .bind(token, mediaId).run();
  try {
    const sourceUrl = `${new URL(request.url).origin}/api/stream-source/${token}`;
    const video = await env.STREAM.upload(sourceUrl, {
      meta: { mediaId, name: media.original_name },
      requireSignedURLs: true,
    });
    const status = video.readyToStream ? "ready" : video.status.state;
    await env.DB.prepare("UPDATE media_items SET stream_uid = ?, stream_status = ?, stream_error = NULL WHERE id = ?")
      .bind(video.id, status, mediaId).run();
    return json({ id: mediaId, streamStatus: status }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloudflare Stream import failed";
    await env.DB.prepare("UPDATE media_items SET stream_status = 'error', stream_error = ?, stream_source_token = NULL WHERE id = ?")
      .bind(message, mediaId).run();
    throw new HttpError(502, message);
  }
}

export async function streamPlayback(env: Env, mediaId: string): Promise<Response> {
  const media = await env.DB.prepare("SELECT stream_uid,stream_status,stream_error FROM media_items WHERE id = ? AND media_type = 'video' AND status = 'ready'")
    .bind(mediaId).first<{ stream_uid: string | null; stream_status: string | null; stream_error: string | null }>();
  if (!media) throw new HttpError(404, "Ready video not found");
  if (!media.stream_uid) return json({ status: media.stream_status || "not_started", error: media.stream_error }, 202);
  try {
    const handle = env.STREAM.video(media.stream_uid);
    const details = await handle.details();
    const status = details.readyToStream ? "ready" : details.status.state;
    const error = details.status.errorReasonText || null;
    await env.DB.prepare("UPDATE media_items SET stream_status = ?, stream_error = ?, stream_source_token = CASE WHEN ? = 'ready' THEN NULL ELSE stream_source_token END WHERE id = ?")
      .bind(status, error, status, mediaId).run();
    if (!details.readyToStream || !details.preview) return json({ status, error }, 202);
    const token = await handle.generateToken();
    return json({ status: "ready", iframeUrl: `${new URL(details.preview).origin}/${token}/iframe` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloudflare Stream is unavailable";
    return json({ status: "error", error: message }, 502);
  }
}

export async function serveStreamSource(request: Request, env: Env, token: string): Promise<Response> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(404, "Stream source not found");
  const source = await env.DB.prepare(`
    SELECT id FROM media_items WHERE stream_source_token = ? AND stream_status NOT IN ('ready','error')
  `).bind(token).first<{ id: string }>();
  if (!source) throw new HttpError(404, "Stream source not found");
  return serveMedia(request, env, source.id);
}
