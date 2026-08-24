import type { QueuePart, QueueState, QueueUpload } from "../types";

export const MAX_ACTIVE_TRANSFERS = 2;
export const MAX_RETRIES = 6;
export const BASE_RETRY_MS = 2_000;
export const MAX_RETRY_MS = 15 * 60_000;

export type PartReceipt = { partNumber: number; etag: string };

export function createQueueUpload(input: {
  id: string;
  localUri: string;
  originalName: string;
  contentType: string;
  byteSize: number;
  accountId?: string | null;
  capturedAt?: string | null;
  durationMs?: number | null;
  showId?: string | null;
  now?: number;
}): QueueUpload {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    account_id: input.accountId ?? null,
    local_uri: input.localUri,
    original_name: input.originalName,
    content_type: input.contentType,
    byte_size: input.byteSize,
    content_hash: null,
    captured_at: input.capturedAt ?? null,
    duration_ms: input.durationMs ?? null,
    show_id: input.showId ?? null,
    state: "queued",
    upload_id: null,
    media_id: null,
    chunk_size: null,
    retry_count: 0,
    next_retry_at: null,
    last_error: null,
    created_at: now,
    updated_at: now,
  };
}

export function partCount(byteSize: number, chunkSize: number): number {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) throw new Error("byteSize must be positive");
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new Error("chunkSize must be positive");
  return Math.ceil(byteSize / chunkSize);
}

export function createParts(byteSize: number, chunkSize: number, queueId: string, now = Date.now()): QueuePart[] {
  return Array.from({ length: partCount(byteSize, chunkSize) }, (_, index) => {
    const partNumber = index + 1;
    return {
      queue_id: queueId,
      part_number: partNumber,
      byte_start: index * chunkSize,
      byte_end: Math.min(byteSize, (index + 1) * chunkSize),
      etag: null,
      state: "pending",
      retry_count: 0,
      updated_at: now,
    } satisfies QueuePart;
  });
}

/** Merge server receipts idempotently; a lost completion response can safely re-upload. */
export function mergePartReceipts(parts: QueuePart[], receipts: PartReceipt[], now = Date.now()): QueuePart[] {
  const byNumber = new Map(receipts.map((receipt) => [receipt.partNumber, receipt.etag]));
  return parts.map((part) => {
    const etag = byNumber.get(part.part_number);
    return etag ? { ...part, etag, state: "complete", updated_at: now } : part;
  });
}

export function completedParts(parts: QueuePart[]): PartReceipt[] {
  return parts
    .filter((part) => part.state === "complete" && typeof part.etag === "string" && part.etag.length > 0)
    .sort((left, right) => left.part_number - right.part_number)
    .map((part) => ({ partNumber: part.part_number, etag: part.etag! }));
}

export function nextPart(parts: QueuePart[]): QueuePart | null {
  return parts
    .filter((part) => part.state === "pending" || part.state === "failed")
    .sort((left, right) => left.part_number - right.part_number)[0] ?? null;
}

export function activeTransferCount(uploads: QueueUpload[]): number {
  return uploads.filter((upload) => upload.state === "uploading").length;
}

export function canStartUpload(upload: QueueUpload, uploads: QueueUpload[], now = Date.now()): boolean {
  if (upload.state !== "queued" && upload.state !== "retrying") return false;
  if (upload.next_retry_at !== null && upload.next_retry_at > now) return false;
  return activeTransferCount(uploads) < MAX_ACTIVE_TRANSFERS;
}

/**
 * Large videos run alone. Native I/O keeps their bytes off the JS thread, while
 * serialising them avoids doubling disk, hashing, networking, and GC pressure.
 */
export function selectUploadBatch(uploads: QueueUpload[]): QueueUpload[] {
  const first = uploads[0];
  if (!first) return [];
  if (first.content_type.startsWith("video/")) return [first];
  return uploads.filter((upload) => !upload.content_type.startsWith("video/")).slice(0, MAX_ACTIVE_TRANSFERS);
}

export function retryDelay(retryCount: number): number {
  const exponent = Math.max(0, Math.min(retryCount, MAX_RETRIES));
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** exponent);
}

export function retryUpload(upload: QueueUpload, error: string, now = Date.now()): QueueUpload {
  const retryCount = upload.retry_count + 1;
  if (retryCount > MAX_RETRIES) {
    return { ...upload, state: "failed", retry_count: retryCount, next_retry_at: null, last_error: error, updated_at: now };
  }
  return {
    ...upload,
    state: "retrying",
    retry_count: retryCount,
    next_retry_at: now + retryDelay(retryCount - 1),
    last_error: error,
    updated_at: now,
  };
}

export function markUploadStarted(upload: QueueUpload, now = Date.now()): QueueUpload {
  return { ...upload, state: "uploading", next_retry_at: null, last_error: null, updated_at: now };
}

export function markUploadComplete(upload: QueueUpload, now = Date.now()): QueueUpload {
  return { ...upload, state: "complete", next_retry_at: null, last_error: null, updated_at: now };
}

export function markUploadDuplicate(upload: QueueUpload, mediaId: string | null, now = Date.now()): QueueUpload {
  return {
    ...upload,
    state: "duplicate",
    media_id: mediaId,
    upload_id: null,
    next_retry_at: null,
    last_error: "Duplicate video — already in archive",
    updated_at: now,
  };
}

export function isTerminal(state: QueueState): boolean {
  return state === "complete" || state === "duplicate" || state === "failed" || state === "cancelled";
}
