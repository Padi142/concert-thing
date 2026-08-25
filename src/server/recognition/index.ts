import type { Env } from "../env";
import type { AuthContext } from "../auth";
import { body, HttpError, json, text } from "../http";
import { serveMedia } from "../media";
import { AcrCloudProvider } from "./acrcloud";
import type { ProviderMatch, RecognitionProvider } from "./provider";

type JobRow = {
  id: string;
  media_id: string;
  status: string;
  attempt_count: number;
  poll_failure_count: number;
  provider_job_id: string | null;
  provider_upload_key: string | null;
  last_error: string | null;
  updated_at: string;
};

type MatchRow = {
  id: string;
  media_id: string;
  candidate_title: string | null;
  candidate_artist: string | null;
  review_state: string;
};

export const CANDIDATE_UPSERT_SQL = `
  INSERT INTO song_matches (
    id,media_id,recognition_job_id,provider,provider_match_id,start_ms,end_ms,confidence,
    candidate_title,candidate_artist,candidate_external_ids,review_state,created_at,updated_at
  ) VALUES (?,? ,?,'acrcloud',?,?,?,?,?,?,?,'pending',?,?)
  ON CONFLICT(media_id, provider, provider_match_id) WHERE provider_match_id IS NOT NULL DO UPDATE SET
    start_ms = excluded.start_ms, end_ms = excluded.end_ms, confidence = excluded.confidence,
    candidate_title = excluded.candidate_title, candidate_artist = excluded.candidate_artist,
    candidate_external_ids = excluded.candidate_external_ids, updated_at = excluded.updated_at
  WHERE song_matches.review_state = 'pending'
`;

function provider(env: Env): RecognitionProvider {
  if (!env.ACRCLOUD_ACCESS_TOKEN || !env.ACRCLOUD_CONTAINER_ID) throw new HttpError(503, "Music recognition is not configured");
  return new AcrCloudProvider({
    accessToken: env.ACRCLOUD_ACCESS_TOKEN,
    containerId: env.ACRCLOUD_CONTAINER_ID,
    region: env.ACRCLOUD_REGION || "us-west-2",
  });
}

async function recognitionFilename(env: Env, current: JobRow, auth: AuthContext): Promise<{ filename: string; contentType: string }> {
  const media = await env.DB.prepare("SELECT original_name,content_type FROM media_items WHERE id = ? AND owner_id = ? AND status = 'ready' AND deletion_started_at IS NULL").bind(current.media_id, auth.userId).first<{ original_name: string; content_type: string }>();
  if (!media) throw new HttpError(404, "Media Item not found");
  const extension = /\.[a-zA-Z0-9]{1,10}$/.exec(media.original_name)?.[0] ?? ".mp4";
  return { filename: `${current.id}${extension.toLowerCase()}`, contentType: media.content_type };
}

async function job(env: Env, id: string, auth: AuthContext): Promise<JobRow> {
  const row = await env.DB.prepare(`
    SELECT j.id,j.media_id,j.status,j.attempt_count,j.poll_failure_count,j.provider_job_id,j.provider_upload_key,j.last_error,j.updated_at
    FROM recognition_jobs j JOIN media_items m ON m.id = j.media_id
    WHERE j.id = ? AND m.owner_id = ? AND m.status = 'ready' AND m.deletion_started_at IS NULL
  `).bind(id, auth.userId).first<JobRow>();
  if (!row) throw new HttpError(404, "Recognition job not found");
  return row;
}

export async function requestRecognition(request: Request, env: Env, mediaId: string, auth: AuthContext): Promise<Response> {
  const media = await env.DB.prepare("SELECT id,media_type,status,deletion_started_at FROM media_items WHERE id = ? AND owner_id = ?").bind(mediaId, auth.userId).first<{ media_type: string; status: string; deletion_started_at: string | null }>();
  if (!media || media.status !== "ready" || media.deletion_started_at) throw new HttpError(404, "Ready Media Item not found");
  if (media.media_type !== "video") throw new HttpError(415, "Only videos can be recognized");
  const input = await body(request);
  const rerun = input.rerun === true;
  const existing = await env.DB.prepare(`
    SELECT id,media_id,status,attempt_count,poll_failure_count,provider_job_id,provider_upload_key,last_error,updated_at
    FROM recognition_jobs WHERE media_id = ? AND provider = 'acrcloud' ORDER BY created_at DESC LIMIT 1
  `).bind(mediaId).first<JobRow>();
  if (existing && existing.status !== "failed" && !rerun) return json(existing);
  if (existing && existing.status === "failed" && existing.attempt_count >= 2 && !rerun) return json(existing);

  const now = new Date().toISOString();
  const retry = existing && existing.status === "failed" && !rerun;
  const id = retry ? existing.id : crypto.randomUUID();
  const status = "preparing";
  if (retry) {
    await env.DB.prepare("UPDATE recognition_jobs SET status = ?, poll_failure_count = 0, last_error = NULL, updated_at = ? WHERE id = ?").bind(status, now, id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO recognition_jobs (id,media_id,provider,status,created_at,updated_at)
      VALUES (?,?,'acrcloud',?,?,?)
    `).bind(id, mediaId, status, now, now).run();
  }
  return json({ id, media_id: mediaId, status, attempt_count: retry ? existing.attempt_count : 0 }, 201);
}

function sourceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function prepareRecognitionUpload(env: Env, jobId: string, auth: AuthContext): Promise<Response> {
  const current = await job(env, jobId, auth);
  if (current.status === "budget_exhausted") return json(current);
  if (current.status !== "preparing" && current.status !== "failed") throw new HttpError(409, "Recognition is not waiting for audio");
  if (current.attempt_count >= 2) throw new HttpError(409, "Recognition retry limit reached");
  const attemptNumber = current.attempt_count + 1;
  const now = new Date().toISOString();
  const token = sourceToken();
  await env.DB.batch([
    env.DB.prepare("UPDATE recognition_jobs SET attempt_count = ?, provider_upload_key = ?, status = 'preparing', last_error = NULL, updated_at = ? WHERE id = ?").bind(attemptNumber, token, now, jobId),
    env.DB.prepare("INSERT INTO recognition_attempts (id,job_id,attempt_number,status,created_at) VALUES (?,?,?,'started',?)").bind(crypto.randomUUID(), jobId, attemptNumber, now),
  ]);
  return json({ jobId });
}

export async function failRecognitionAttempt(env: Env, jobId: string, auth: AuthContext): Promise<Response> {
  const current = await job(env, jobId, auth);
  if (current.status !== "preparing") return json(current);
  const message = "Audio extraction or transfer failed";
  await env.DB.batch([
    env.DB.prepare("UPDATE recognition_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?").bind(message, new Date().toISOString(), jobId),
    env.DB.prepare("UPDATE recognition_attempts SET status = 'failed', error = ? WHERE job_id = ? AND attempt_number = ?").bind(message, jobId, current.attempt_count),
  ]);
  return json({ id: jobId, status: "failed", attempt_count: current.attempt_count, last_error: message });
}

export async function submitRecognition(request: Request, env: Env, jobId: string, auth: AuthContext): Promise<Response> {
  const current = await job(env, jobId, auth);
  if (current.status !== "preparing" || !current.provider_upload_key) throw new HttpError(409, "Recognition audio is not ready to submit");
  const now = new Date().toISOString();
  try {
    const source = await recognitionFilename(env, current, auth);
    const sourceUrl = `${new URL(request.url).origin}/api/recognition-source/${current.provider_upload_key}`;
    const submitted = await provider(env).submitUrl(sourceUrl, source.filename);
    await env.DB.batch([
      env.DB.prepare("UPDATE recognition_jobs SET status = 'submitted', poll_failure_count = 0, provider_job_id = ?, updated_at = ? WHERE id = ?").bind(submitted.providerJobId, now, jobId),
      env.DB.prepare("UPDATE recognition_attempts SET status = 'submitted' WHERE job_id = ? AND attempt_number = ?").bind(jobId, current.attempt_count),
    ]);
    return json({ id: jobId, status: "submitted" });
  } catch (error) {
    const message = "Recognition provider is unavailable";
    await env.DB.batch([
      env.DB.prepare("UPDATE recognition_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?").bind(message, now, jobId),
      env.DB.prepare("UPDATE recognition_attempts SET status = 'failed', error = ? WHERE job_id = ? AND attempt_number = ?").bind(message, jobId, current.attempt_count),
    ]);
    throw error;
  }
}

async function saveMatches(env: Env, current: JobRow, matches: ProviderMatch[], auth: AuthContext) {
  const media = await env.DB.prepare(
    "SELECT id FROM media_items WHERE id = ? AND owner_id = ? AND status = 'ready' AND deletion_started_at IS NULL",
  ).bind(current.media_id, auth.userId).first<{ id: string }>();
  if (!media) return;
  const now = new Date().toISOString();
  const statements = matches.map(match => env.DB.prepare(CANDIDATE_UPSERT_SQL).bind(crypto.randomUUID(), current.media_id, current.id, match.providerMatchId, match.startMs, match.endMs,
    match.confidence, match.title, match.artist, JSON.stringify(match.externalIds), now, now));
  if (statements.length) await env.DB.batch(statements);
}

export async function recognitionStatus(env: Env, mediaId: string, auth: AuthContext): Promise<Response> {
  let current = await env.DB.prepare(`
    SELECT j.id,j.media_id,j.status,j.attempt_count,j.poll_failure_count,j.provider_job_id,j.provider_upload_key,j.last_error,j.updated_at
    FROM recognition_jobs j JOIN media_items m ON m.id = j.media_id
    WHERE j.media_id = ? AND m.owner_id = ? AND m.status = 'ready' AND m.deletion_started_at IS NULL AND j.provider = 'acrcloud' ORDER BY j.created_at DESC LIMIT 1
  `).bind(mediaId, auth.userId).first<JobRow>();
  if (!current) throw new HttpError(404, "Recognition job not found");
  if (current.status === "preparing" && Date.now() - Date.parse(current.updated_at) > 60 * 60 * 1000) {
    const lastError = "Audio preparation did not finish";
    const updatedAt = new Date().toISOString();
    await env.DB.prepare("UPDATE recognition_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?").bind(lastError, updatedAt, current.id).run();
    current = { ...current, status: "failed", last_error: lastError, updated_at: updatedAt };
  }
  if ((current.status === "submitted" || current.status === "processing") && current.provider_job_id) {
    try {
      const result = await provider(env).result(current.provider_job_id);
      const now = new Date().toISOString();
      if (result.state === "completed") await saveMatches(env, current, result.matches, auth);
      const lastError = "message" in result ? result.message : null;
      await env.DB.prepare("UPDATE recognition_jobs SET status = ?, poll_failure_count = 0, last_error = ?, updated_at = ? WHERE id = ?")
        .bind(result.state, lastError, now, current.id).run();
      current = { ...current, status: result.state, poll_failure_count: 0, last_error: lastError };
    } catch {
      const failures = Math.min(2, current.poll_failure_count + 1);
      const status = failures >= 2 ? "failed" : "processing";
      const lastError = failures >= 2 ? "Recognition provider remained unavailable" : "Recognition status is temporarily unavailable";
      await env.DB.prepare("UPDATE recognition_jobs SET status = ?, poll_failure_count = ?, last_error = ?, updated_at = ? WHERE id = ?")
        .bind(status, failures, lastError, new Date().toISOString(), current.id).run();
      current = { ...current, status, poll_failure_count: failures, last_error: lastError };
    }
  }
  return json(current);
}

export async function serveRecognitionSource(request: Request, env: Env, token: string): Promise<Response> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(404, "Recognition source not found");
  const source = await env.DB.prepare(`
    SELECT j.media_id FROM recognition_jobs j
    JOIN media_items m ON m.id = j.media_id
    WHERE j.provider_upload_key = ? AND m.status = 'ready' AND m.deletion_started_at IS NULL
      AND j.status IN ('preparing','submitted','processing')
      AND j.updated_at >= datetime('now', '-1 day')
  `).bind(token).first<{ media_id: string }>();
  if (!source) throw new HttpError(404, "Recognition source not found");
  return serveMedia(request, env, source.media_id);
}

export async function listSongMatches(env: Env, auth: AuthContext): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT sm.id,sm.media_id,sm.start_ms,sm.end_ms,sm.confidence,sm.candidate_title,
      sm.candidate_artist,sm.review_state,sm.song_id,
      COALESCE(sm.owner_title,s.title,sm.candidate_title) AS title,
      COALESCE(sm.owner_artist,s.primary_artist,sm.candidate_artist) AS artist
    FROM song_matches sm
    JOIN media_items m ON m.id = sm.media_id AND m.owner_id = ? AND m.status = 'ready' AND m.deletion_started_at IS NULL
    LEFT JOIN songs s ON s.id = sm.song_id
    ORDER BY sm.media_id, sm.start_ms
  `).bind(auth.userId).all();
  return json(result.results);
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

async function songId(env: Env, title: string, artist: string): Promise<string> {
  const titleKey = normalized(title);
  const artistKey = normalized(artist);
  const existing = await env.DB.prepare("SELECT id FROM songs WHERE normalized_title = ? AND normalized_artist = ?").bind(titleKey, artistKey).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO songs (id,title,primary_artist,normalized_title,normalized_artist,created_at)
    VALUES (?,?,?,?,?,?)
  `).bind(id, title.trim(), artist.trim(), titleKey, artistKey, new Date().toISOString()).run();
  return (await env.DB.prepare("SELECT id FROM songs WHERE normalized_title = ? AND normalized_artist = ?").bind(titleKey, artistKey).first<{ id: string }>())!.id;
}

export async function reviewSongMatch(request: Request, env: Env, matchId: string, auth: AuthContext): Promise<Response> {
  const input = await body(request);
  const action = text(input.action, "action");
  const match = await env.DB.prepare(`
    SELECT sm.id,sm.media_id,sm.candidate_title,sm.candidate_artist,sm.review_state
    FROM song_matches sm JOIN media_items m ON m.id = sm.media_id
    WHERE sm.id = ? AND m.owner_id = ? AND m.status = 'ready' AND m.deletion_started_at IS NULL
  `).bind(matchId, auth.userId).first<MatchRow>();
  if (!match) throw new HttpError(404, "Song Match not found");
  const now = new Date().toISOString();
  if (action === "reject") {
    await env.DB.prepare("UPDATE song_matches SET review_state = 'rejected', song_id = NULL, owner_title = NULL, owner_artist = NULL, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM media_items m WHERE m.id = song_matches.media_id AND m.owner_id = ? AND m.status = 'ready' AND m.deletion_started_at IS NULL)").bind(now, matchId, auth.userId).run();
    return json({ id: matchId, reviewState: "rejected" });
  }
  if (action !== "confirm" && action !== "edit") throw new HttpError(400, "action must be confirm, edit, or reject");
  const title = action === "edit" ? text(input.title, "title") : match.candidate_title;
  const artist = action === "edit" ? text(input.artist, "artist") : match.candidate_artist;
  if (!title || !artist) throw new HttpError(400, "Song title and Artist are required");
  const linkedSongId = await songId(env, title, artist);
  await env.DB.prepare(`
    UPDATE song_matches SET review_state = ?, song_id = ?, owner_title = ?, owner_artist = ?, updated_at = ?
    WHERE id = ? AND EXISTS (SELECT 1 FROM media_items m WHERE m.id = song_matches.media_id AND m.owner_id = ? AND m.status = 'ready' AND m.deletion_started_at IS NULL)
  `).bind(action === "edit" ? "edited" : "confirmed", linkedSongId, action === "edit" ? title : null, action === "edit" ? artist : null, now, matchId, auth.userId).run();
  return json({ id: matchId, reviewState: action === "edit" ? "edited" : "confirmed", songId: linkedSongId });
}

export async function deleteSongMatch(env: Env, matchId: string, auth: AuthContext): Promise<Response> {
  const match = await env.DB.prepare(`
    SELECT sm.id FROM song_matches sm JOIN media_items m ON m.id = sm.media_id
    WHERE sm.id = ? AND m.owner_id = ? AND m.status = 'ready' AND m.deletion_started_at IS NULL
  `).bind(matchId, auth.userId).first<{ id: string }>();
  if (!match) throw new HttpError(404, "Song Match not found");
  await env.DB.prepare("DELETE FROM song_matches WHERE id = ? AND EXISTS (SELECT 1 FROM media_items m WHERE m.id = song_matches.media_id AND m.owner_id = ? AND m.status = 'ready' AND m.deletion_started_at IS NULL)").bind(matchId, auth.userId).run();
  return json({ id: match.id, deleted: true });
}

export async function addManualSongMatch(request: Request, env: Env, mediaId: string, auth: AuthContext): Promise<Response> {
  const input = await body(request);
  const title = text(input.title, "title");
  const artist = text(input.artist, "artist");
  const startMs = Number(input.startMs ?? 0);
  if (!Number.isSafeInteger(startMs) || startMs < 0) throw new HttpError(400, "startMs must be a non-negative integer");
  const media = await env.DB.prepare("SELECT id FROM media_items WHERE id = ? AND owner_id = ? AND media_type = 'video' AND status = 'ready' AND deletion_started_at IS NULL").bind(mediaId, auth.userId).first();
  if (!media) throw new HttpError(404, "Ready video not found");
  const linkedSongId = await songId(env, title, artist);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO song_matches (id,media_id,start_ms,review_state,song_id,owner_title,owner_artist,created_at,updated_at)
    VALUES (?, ?, ?, 'manual', ?, ?, ?, ?, ?)
  `).bind(id, mediaId, startMs, linkedSongId, title, artist, now, now).run();
  return json({ id, mediaId, reviewState: "manual", songId: linkedSongId }, 201);
}
