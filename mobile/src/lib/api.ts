import { loadApiConfig } from "./config";
import { getSessionToken } from "./clerk";
import { normalizeStreamPlayback, type StreamPlayback } from "./streamPlayback";
import type { ApiConfig, MediaItem, RecognitionJob, Show, ShowShare, SongMatch, UploadInitResponse, VideoShare } from "../types";

export class ApiError extends Error {
  readonly status: number;
  readonly data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

let configPromise: Promise<ApiConfig | null> | null = null;
const streamPlaybackCache = new Map<string, { expiresAt: number; playback: StreamPlayback }>();
const streamPlaybackRequests = new Map<string, Promise<StreamPlayback>>();
const streamImportRequests = new Map<string, Promise<{ id: string; streamStatus: string }>>();
let streamImportQueue: Promise<void> = Promise.resolve();

export function resetApiConfigCache(): void {
  configPromise = null;
  streamPlaybackCache.clear();
  streamPlaybackRequests.clear();
  streamImportRequests.clear();
  streamImportQueue = Promise.resolve();
}

async function config(): Promise<ApiConfig> {
  configPromise ??= loadApiConfig();
  const value = await configPromise;
  if (!value) throw new ApiError("The archive connection is not configured.", 500);
  return value;
}

export async function request<T>(path: string, init: RequestInit = {}, override?: ApiConfig): Promise<T> {
  const current = override ?? await config();
  const token = await getSessionToken();
  if (!token) throw new ApiError("Sign in to access your archive.", 401);
  const response = await fetch(`${current.baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const raw = await response.text();
  let value: unknown = {};
  try {
    value = raw ? JSON.parse(raw) : {};
  } catch {
    value = {};
  }
  if (!response.ok) {
    const data = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    const message = typeof data.error === "string"
      ? data.error
      : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }
  return value as T;
}

export async function getShows(): Promise<Show[]> {
  return request<Show[]>("/api/shows");
}

export async function claimLegacyData(): Promise<{ claimed: boolean; legacyOwner: boolean; shows: number; mediaItems: number }> {
  return request<{ claimed: boolean; legacyOwner: boolean; shows: number; mediaItems: number }>("/api/account/claim-legacy", { method: "POST" });
}

export async function createShow(input: {
  title: string;
  venue: string;
  locality: string;
  startsAt: string;
  endsAt?: string | null;
  timezone: string;
  artists: string[];
}): Promise<Show> {
  return request<Show>("/api/shows", { method: "POST", body: JSON.stringify(input) });
}

export async function createShowShare(showId: string): Promise<ShowShare> {
  return request<ShowShare>(`/api/shows/${encodeURIComponent(showId)}/share`, { method: "POST" });
}

export async function createVideoShare(mediaId: string): Promise<VideoShare> {
  return request<VideoShare>(`/api/media/${encodeURIComponent(mediaId)}/share`, { method: "POST" });
}

export async function getMedia(query = ""): Promise<MediaItem[]> {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return request<MediaItem[]>(`/api/media${suffix}`);
}

export async function getStreamPlayback(mediaId: string): Promise<StreamPlayback> {
  const cached = streamPlaybackCache.get(mediaId);
  if (cached && cached.expiresAt > Date.now()) return cached.playback;
  const pending = streamPlaybackRequests.get(mediaId);
  if (pending) return pending;
  const playback = request<StreamPlayback>(`/api/media/${encodeURIComponent(mediaId)}/stream`)
    .then(normalizeStreamPlayback)
    .then((value) => {
      if (value.status === "ready") streamPlaybackCache.set(mediaId, { expiresAt: Date.now() + 50 * 60 * 1_000, playback: value });
      return value;
    })
    .catch((error) => {
      streamPlaybackCache.delete(mediaId);
      throw error;
    })
    .finally(() => streamPlaybackRequests.delete(mediaId));
  streamPlaybackRequests.set(mediaId, playback);
  return playback;
}

export function startStreamImport(mediaId: string): Promise<{ id: string; streamStatus: string }> {
  const existing = streamImportRequests.get(mediaId);
  if (existing) return existing;
  const started = streamImportQueue.then(() => request<{ id: string; streamStatus: string }>(`/api/media/${encodeURIComponent(mediaId)}/stream`, { method: "POST" }));
  streamImportQueue = started.then(() => undefined, () => undefined);
  streamImportRequests.set(mediaId, started);
  void started.finally(() => streamImportRequests.delete(mediaId)).catch(() => undefined);
  return started;
}

export async function assignMedia(mediaId: string, showId: string | null): Promise<{ id: string; showId: string | null }> {
  return request(`/api/media/${encodeURIComponent(mediaId)}/assignment`, {
    method: "PATCH",
    body: JSON.stringify({ showId }),
  });
}

export async function deleteMedia(mediaId: string): Promise<{ id: string; deleted: true }> {
  const deleted = await request<{ id: string; deleted: true }>(`/api/media/${encodeURIComponent(mediaId)}`, { method: "DELETE" });
  streamPlaybackCache.delete(mediaId);
  return deleted;
}

export async function getSongMatches(): Promise<SongMatch[]> {
  return request<SongMatch[]>("/api/song-matches");
}

export async function requestRecognition(mediaId: string, rerun = false): Promise<RecognitionJob> {
  return request<RecognitionJob>(`/api/media/${encodeURIComponent(mediaId)}/recognition`, {
    method: "POST",
    body: JSON.stringify({ rerun }),
  });
}

export async function getRecognitionStatus(mediaId: string): Promise<RecognitionJob> {
  return request<RecognitionJob>(`/api/media/${encodeURIComponent(mediaId)}/recognition`);
}

export async function prepareRecognitionUpload(jobId: string): Promise<{ jobId: string }> {
  return request<{ jobId: string }>(`/api/recognition/${encodeURIComponent(jobId)}/upload`, { method: "POST" });
}

export async function submitRecognition(jobId: string): Promise<{ id: string; status: string }> {
  return request<{ id: string; status: string }>(`/api/recognition/${encodeURIComponent(jobId)}/submit`, { method: "POST" });
}

export async function reviewSongMatch(matchId: string, action: "confirm" | "reject" | "edit", input?: { title: string; artist: string }): Promise<unknown> {
  return request(`/api/song-matches/${encodeURIComponent(matchId)}`, {
    method: "PATCH",
    body: JSON.stringify({ action, ...input }),
  });
}

export async function deleteSongMatch(matchId: string): Promise<{ id: string; deleted: true }> {
  return request<{ id: string; deleted: true }>(`/api/song-matches/${encodeURIComponent(matchId)}`, { method: "DELETE" });
}

export async function addManualSongMatch(mediaId: string, title: string, artist: string, startMs = 0): Promise<unknown> {
  return request(`/api/media/${encodeURIComponent(mediaId)}/song-matches`, {
    method: "POST",
    body: JSON.stringify({ title, artist, startMs }),
  });
}

export async function beginUpload(input: {
  clientUploadId: string;
  name: string;
  type: string;
  size: number;
  contentHash?: string;
}): Promise<UploadInitResponse> {
  return request<UploadInitResponse>("/api/uploads", { method: "POST", body: JSON.stringify(input) });
}

export async function getUploadStatus(mediaId: string): Promise<UploadInitResponse> {
  return request<UploadInitResponse>(`/api/uploads/${encodeURIComponent(mediaId)}`);
}

export async function configureUpload(mediaId: string, input: {
  capturedAt: string | null;
  durationMs: number | null;
  showId: string | null;
  source?: "embedded_metadata" | "file_modified";
}): Promise<unknown> {
  return request(`/api/uploads/${encodeURIComponent(mediaId)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function uploadPart(mediaId: string, partNumber: number, body: Uint8Array, contentType: string, configOverride?: ApiConfig): Promise<{ partNumber: number; etag: string }> {
  return request<{ partNumber: number; etag: string }>(`/api/uploads/${encodeURIComponent(mediaId)}/parts/${partNumber}`, {
    method: "PUT",
    headers: { "content-type": contentType, "content-length": String(body.byteLength) },
    body: body as unknown as BodyInit,
  }, configOverride);
}

export async function completeUpload(mediaId: string, parts: { partNumber: number; etag: string }[]): Promise<{ id: string; status: string; assignment: { showId: string; method: string } | null }> {
  return request(`/api/uploads/${encodeURIComponent(mediaId)}/complete`, { method: "POST", body: JSON.stringify({ parts }) });
}

export async function cancelUpload(mediaId: string): Promise<void> {
  await request(`/api/uploads/${encodeURIComponent(mediaId)}`, { method: "DELETE" });
}

export function mediaContentUrl(baseUrl: string, mediaId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/media/${encodeURIComponent(mediaId)}/content`;
}

export async function authenticatedMediaSource(mediaId: string): Promise<{ uri: string; headers: Record<string, string> }> {
  const current = await config();
  const token = await getSessionToken();
  if (!token) throw new ApiError("Sign in to access your archive.", 401);
  return { uri: mediaContentUrl(current.baseUrl, mediaId), headers: { authorization: `Bearer ${token}` } };
}
