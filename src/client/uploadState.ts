import type { UploadState } from "./types";

export function normalizeUploadState(value: unknown): UploadState {
  if (!value || typeof value !== "object") throw new Error("Invalid saved upload state");
  const candidate = value as Partial<UploadState>;
  if (typeof candidate.mediaId !== "string" || typeof candidate.uploadId !== "string" || !Number.isSafeInteger(candidate.chunkSize) || candidate.chunkSize! <= 0) {
    throw new Error("Invalid saved upload state");
  }
  const completed = Array.isArray(candidate.completed)
    ? candidate.completed.filter(part => Number.isInteger(part?.partNumber) && typeof part?.etag === "string")
    : [];
  return { mediaId: candidate.mediaId, uploadId: candidate.uploadId, chunkSize: candidate.chunkSize!, completed };
}

export function loadUploadState(serialized: string | null): UploadState | null {
  if (!serialized) return null;
  try { return normalizeUploadState(JSON.parse(serialized)); }
  catch { return null; }
}
