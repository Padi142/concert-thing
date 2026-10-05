import * as BackgroundTask from "expo-background-task";
import { File as ExpoFile, UploadType } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as TaskManager from "expo-task-manager";
import {
  cancelNativeUpload,
  sha256FileNatively,
  startUploadForegroundService,
  stopUploadForegroundService,
  updateUploadForegroundService,
  uploadPartNatively,
} from "concert-background-upload";
import { claimUnownedQueueUploads, getDatabase, getQueueUpload, listQueueParts, listQueueUploads, removeQueueUpload, replaceQueueParts, resetStaleTransfers, updateQueuePart, updateQueueUpload } from "./db";
import { ApiError, beginUpload, cancelUpload as cancelRemoteUpload, completeUpload, configureUpload, getUploadStatus, startStreamImport, uploadPart } from "./api";
import { getCurrentUserId, getSessionToken } from "./clerk";
import { shouldAutoRecognizeUpload } from "./autoRecognition";
import { loadApiConfig, loadAutoRecognition } from "./config";
import { sha256ByRanges } from "./mediaHash";
import { canStartUpload, completedParts, createParts, markUploadComplete, markUploadDuplicate, markUploadQuotaBlocked, markUploadStarted, mergePartReceipts, nextPart, restartExpiredUpload, retryUpload, selectUploadBatch } from "./queueState";
import { enqueueRecognition } from "./recognitionQueue";
import { formatStorageBytes, refreshStorage } from "./storage";
import type { QueuePart, QueueUpload } from "../types";

export const QUEUE_BACKGROUND_TASK = "concert-thing-upload-queue";

type Listener = (uploads: QueueUpload[]) => void;
const listeners = new Set<Listener>();
let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let hasRehydratedProcessState = false;

TaskManager.defineTask(QUEUE_BACKGROUND_TASK, async () => {
  await resumeQueue();
  return BackgroundTask.BackgroundTaskResult.Success;
});

function emit(uploads: QueueUpload[]): void {
  for (const listener of listeners) listener(uploads);
}

async function emitCurrent(): Promise<void> {
  emit(await listQueueUploads(await getCurrentUserId()));
}

async function ensureQueueAccount(accountId: string): Promise<void> {
  if (await getCurrentUserId() !== accountId) throw new ApiError("The active account changed. Sign in again to resume uploads.", 401);
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  void emitCurrent().catch(() => undefined);
  return () => listeners.delete(listener);
}

export async function queueSnapshot(): Promise<QueueUpload[]> {
  return listQueueUploads(await getCurrentUserId());
}

function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readPartBase64(localUri: string, start: number, end: number): Promise<string> {
  return FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64, position: start, length: end - start });
}

async function readPart(localUri: string, start: number, end: number): Promise<Uint8Array> {
  return decodeBase64(await readPartBase64(localUri, start, end));
}

function parsePartReceipt(body: string, partNumber: number): { partNumber: number; etag: string } {
  const value = JSON.parse(body || "{}");
  if (Number(value.partNumber) !== partNumber || typeof value.etag !== "string" || !value.etag) {
    throw new Error(`Part ${partNumber} returned an invalid receipt`);
  }
  return { partNumber, etag: value.etag };
}

async function uploadPartFromTemporaryFile(upload: QueueUpload, part: QueuePart, accountId: string): Promise<{ partNumber: number; etag: string } | null> {
  const base = await loadApiConfig();
  if (!base || !FileSystem.cacheDirectory) return null;
  const token = await getSessionToken();
  if (!token || await getCurrentUserId() !== accountId) throw new ApiError("The active account changed. Sign in again to resume uploads.", 401);
  const tempDirectory = `${FileSystem.cacheDirectory}concert-thing-parts/`;
  const tempUri = `${tempDirectory}${upload.media_id}-${part.part_number}.part`;
  try {
    await FileSystem.makeDirectoryAsync(tempDirectory, { intermediates: true });
    // Keep the encoded chunk opaque. The previous path decoded and re-encoded
    // 8 MiB in JavaScript, creating hundreds of milliseconds of UI stalls.
    const encoded = await readPartBase64(upload.local_uri, part.byte_start, part.byte_end);
    await FileSystem.writeAsStringAsync(tempUri, encoded, { encoding: FileSystem.EncodingType.Base64 });
    // The modern API uses a stable, bundle-scoped background URLSession on
    // iOS. The legacy uploader created a new random session identifier, so the
    // OS could not reliably reconnect the app to an in-flight transfer.
    const task = new ExpoFile(tempUri).createUploadTask(
      `${base.baseUrl}/api/uploads/${encodeURIComponent(upload.media_id!)}/parts/${part.part_number}`,
      {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        sessionType: "background",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": upload.content_type,
          "content-length": String(part.byte_end - part.byte_start),
        },
      },
    );
    const response = await task.uploadAsync();
    if (response.status < 200 || response.status >= 300) throw new Error(`Part ${part.part_number} failed (${response.status})`);
    return parsePartReceipt(response.body, part.part_number);
  } finally {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => undefined);
  }
}

async function uploadOnePart(upload: QueueUpload, part: QueuePart, accountId: string): Promise<{ partNumber: number; etag: string }> {
  await updateQueuePart(upload.id, accountId, part.part_number, { state: "uploading" });
  try {
    const base = await loadApiConfig();
    const token = await getSessionToken();
    if (!token || await getCurrentUserId() !== accountId) throw new ApiError("The active account changed. Sign in again to resume uploads.", 401);
    const pendingUploads = (await listQueueUploads(accountId)).filter((item) => !["complete", "duplicate", "failed", "cancelled"].includes(item.state));
    const nativeResponse = base ? await uploadPartNatively({
      queueId: upload.id,
      url: `${base.baseUrl}/api/uploads/${encodeURIComponent(upload.media_id!)}/parts/${part.part_number}`,
      fileUri: upload.local_uri,
      byteStart: part.byte_start,
      byteEnd: part.byte_end,
      totalBytes: upload.byte_size,
      contentType: upload.content_type,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": upload.content_type,
        "content-length": String(part.byte_end - part.byte_start),
      },
      label: upload.original_name,
      remainingItems: Math.max(1, pendingUploads.length),
    }) : null;
    if (nativeResponse && (nativeResponse.status < 200 || nativeResponse.status >= 300)) {
      throw new Error(`Part ${part.part_number} failed (${nativeResponse.status})`);
    }
    const nativeReceipt = nativeResponse ? parsePartReceipt(nativeResponse.body, part.part_number) : null;
    const temporaryReceipt = nativeReceipt ?? await uploadPartFromTemporaryFile(upload, part, accountId).catch((error) => {
      if (error instanceof ApiError && error.status === 401) throw error;
      return null;
    });
    const receipt = temporaryReceipt ?? await uploadPart(
      upload.media_id!,
      part.part_number,
      await readPart(upload.local_uri, part.byte_start, part.byte_end),
      upload.content_type,
    );
    await updateQueuePart(upload.id, accountId, part.part_number, { state: "complete", etag: receipt.etag });
    emit(await listQueueUploads(accountId));
    return receipt;
  } catch (error) {
    await updateQueuePart(upload.id, accountId, part.part_number, { state: "failed", retry_count: part.retry_count + 1 }).catch(() => undefined);
    throw error;
  }
}

async function reconcileRemote(upload: QueueUpload, accountId: string): Promise<"complete" | "restart" | false> {
  if (!upload.media_id) return false;
  try {
    await ensureQueueAccount(accountId);
    const remote = await getUploadStatus(upload.media_id);
    if (remote.status === "ready" || remote.uploadId === null) {
      await finishUpload(upload, accountId);
      return "complete";
    }
    if (remote.completed?.length) {
      const parts = await listQueueParts(upload.id, accountId);
      const merged = mergePartReceipts(parts, remote.completed);
      await replaceQueueParts(upload.id, accountId, merged);
    }
  } catch (error) {
    if (error instanceof ApiError && (error.data.code === "UPLOAD_EXPIRED" || error.status === 404 || error.status === 410)) {
      await replaceQueueParts(upload.id, accountId, []);
      await updateQueueUpload(upload.id, accountId, restartExpiredUpload(upload));
      emit(await listQueueUploads(accountId));
      return "restart";
    }
    // Reconciliation is best effort; the next retry will ask the server again.
  }
  return false;
}

async function finishUpload(upload: QueueUpload, accountId: string): Promise<void> {
  await ensureQueueAccount(accountId);
  await updateQueueUpload(upload.id, accountId, markUploadComplete(upload));
  void refreshStorage().catch(() => undefined);
  // Originals are now durable in R2; release the private local copy.
  await FileSystem.deleteAsync(upload.local_uri, { idempotent: true }).catch(() => undefined);
  const autoRecognize = await loadAutoRecognition().catch(() => false);
  if (shouldAutoRecognizeUpload({ contentType: upload.content_type, mediaId: upload.media_id }, autoRecognize)) {
    // Await submission so a background-task invocation cannot finish before
    // the provider request has reached the server. Provider polling stays in
    // the app-level recognition queue after this point.
    await enqueueRecognition(upload.media_id!, false);
  }
}

async function processUpload(current: QueueUpload, accountId: string): Promise<void> {
  let upload = current;
  try {
    await ensureQueueAccount(accountId);
    const started = markUploadStarted(upload);
    await updateQueueUpload(upload.id, accountId, started);
    upload = started;
    const queueDepth = (await listQueueUploads(accountId)).filter((item) => !["complete", "duplicate", "blocked", "failed", "cancelled"].includes(item.state)).length;
    await updateUploadForegroundService(Math.max(1, queueDepth), `Preparing ${upload.original_name}`, 0).catch(() => undefined);

    if (upload.content_type.startsWith("video/") && !upload.content_hash) {
      const contentHash = await sha256FileNatively(upload.local_uri)
        ?? await sha256ByRanges(upload.byte_size, (start, end) => readPart(upload.local_uri, start, end));
      upload = { ...upload, content_hash: contentHash, updated_at: Date.now() };
      await updateQueueUpload(upload.id, accountId, { content_hash: contentHash });
    }
    await ensureQueueAccount(accountId);
    const init = await beginUpload({
      clientUploadId: upload.id,
      name: upload.original_name,
      type: upload.content_type,
      size: upload.byte_size,
      ...(upload.content_hash ? { contentHash: upload.content_hash } : {}),
    });
    void refreshStorage().catch(() => undefined);
    if (upload.media_id && upload.media_id !== init.mediaId) {
      // The seven-day cleanup removed the old remote attempt. Receipts from
      // that multipart upload cannot be reused with the replacement.
      await replaceQueueParts(upload.id, accountId, []);
    }
    if (init.status === "ready" || !init.uploadId) {
      if (upload.content_type.startsWith("video/")) {
        await ensureQueueAccount(accountId);
        await startStreamImport(init.mediaId).catch(() => undefined);
      }
      await finishUpload({ ...upload, media_id: init.mediaId, upload_id: init.uploadId, chunk_size: init.chunkSize }, accountId);
      return;
    }
    upload = { ...upload, upload_id: init.uploadId, media_id: init.mediaId, chunk_size: init.chunkSize, updated_at: Date.now() };
    const remoteMediaId = upload.media_id;
    if (!remoteMediaId) throw new Error("Upload did not return a media id");
    await updateQueueUpload(upload.id, accountId, upload);
    let parts = await listQueueParts(upload.id, accountId);
    if (!parts.length || parts.length !== Math.ceil(upload.byte_size / init.chunkSize)) {
      parts = createParts(upload.byte_size, init.chunkSize, upload.id);
      await replaceQueueParts(upload.id, accountId, parts);
    }
    if (init.completed?.length) {
      parts = mergePartReceipts(parts, init.completed);
      await replaceQueueParts(upload.id, accountId, parts);
    }
    await ensureQueueAccount(accountId);
    await configureUpload(remoteMediaId, {
      capturedAt: upload.captured_at,
      durationMs: upload.duration_ms,
      showId: upload.show_id,
      source: upload.captured_at ? "file_modified" : undefined,
    });
    while (true) {
      parts = await listQueueParts(upload.id, accountId);
      const pending = nextPart(parts);
      if (!pending) break;
      await uploadOnePart(upload, pending, accountId);
    }
    parts = await listQueueParts(upload.id, accountId);
    try {
      await ensureQueueAccount(accountId);
      await completeUpload(remoteMediaId, completedParts(parts));
    } catch (error) {
      const reconciliation = await reconcileRemote(upload, accountId);
      if (reconciliation === "restart") return;
      if (!reconciliation) throw error;
    }
    if (upload.content_type.startsWith("video/")) {
      await ensureQueueAccount(accountId);
      await startStreamImport(remoteMediaId).catch(() => undefined);
    }
    await finishUpload(upload, accountId);
    emit(await listQueueUploads(accountId));
  } catch (error) {
    if (await getCurrentUserId().catch(() => null) !== accountId) return;
    if (error instanceof ApiError && error.status === 409 && error.data.duplicate === true) {
      const duplicateMediaId = typeof error.data.duplicateMediaId === "string" ? error.data.duplicateMediaId : null;
      const duplicate = markUploadDuplicate(upload, duplicateMediaId);
      await updateQueueUpload(upload.id, accountId, duplicate);
      await FileSystem.deleteAsync(upload.local_uri, { idempotent: true }).catch(() => undefined);
      emit(await listQueueUploads(accountId));
      return;
    }
    if (error instanceof ApiError && error.data.code === "STORAGE_QUOTA_EXCEEDED") {
      const available = typeof error.data.availableBytes === "number" ? formatStorageBytes(error.data.availableBytes) : "0 GB";
      await updateQueueUpload(upload.id, accountId, markUploadQuotaBlocked(upload, `${available} available`));
      void refreshStorage().catch(() => undefined);
      emit(await listQueueUploads(accountId));
      return;
    }
    const message = error instanceof Error ? error.message : "Upload failed";
    const failed = retryUpload(upload, message);
    await updateQueueUpload(upload.id, accountId, failed);
    if (failed.state === "failed") emit(await listQueueUploads(accountId));
  }
}

export async function resumeQueue(options: { claimUnowned?: boolean } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    await getDatabase();
    const accountId = await getCurrentUserId();
    if (!accountId) {
      emit([]);
      return;
    }
    // Rows created by an older pre-Clerk build are claimed only after the
    // backend confirms this account owns the legacy archive. Once claimed,
    // every read and mutation below is scoped by that Clerk user ID.
    if (options.claimUnowned) await claimUnownedQueueUploads(accountId);
    // On a fresh JS process every persisted `uploading` row may have been
    // interrupted by a force-quit. Requeue immediately; later calls only
    // reclaim transfers that have been quiet for a minute.
    await resetStaleTransfers(accountId, hasRehydratedProcessState ? Date.now() - 60_000 : Date.now() + 1);
    hasRehydratedProcessState = true;
    try {
      const uploads = await listQueueUploads(accountId);
      emit(uploads);
      let remaining = uploads.filter((upload) => canStartUpload(upload, uploads));
      if (remaining.length) {
        await startUploadForegroundService(remaining.length, `Preparing ${remaining[0].original_name}`).catch(() => undefined);
      }
      while (remaining.length) {
        const batch = selectUploadBatch(remaining);
        await Promise.all(batch.map((upload) => processUpload(upload, accountId)));
        if (await getCurrentUserId() !== accountId) break;
        const snapshot = await listQueueUploads(accountId);
        remaining = snapshot.filter((upload) => canStartUpload(upload, snapshot));
      }
      emit(await listQueueUploads(accountId));
    } finally {
      await stopUploadForegroundService().catch(() => undefined);
    }
    const nextRetry = (await listQueueUploads(accountId)).filter((upload) => upload.state === "retrying" && upload.next_retry_at !== null).sort((left, right) => left.next_retry_at! - right.next_retry_at!)[0];
    if (nextRetry) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { retryTimer = null; void resumeQueue(); }, Math.max(0, nextRetry.next_retry_at! - Date.now()));
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function cancelQueuedUpload(uploadId: string): Promise<void> {
  const accountId = await getCurrentUserId();
  const upload = await getQueueUpload(uploadId, accountId);
  if (!upload) return;
  await cancelNativeUpload(uploadId).catch(() => undefined);
  if (upload.media_id) await cancelRemoteUpload(upload.media_id).catch(() => undefined);
  await removeQueueUpload(uploadId, accountId);
  await FileSystem.deleteAsync(upload.local_uri, { idempotent: true }).catch(() => undefined);
  emit(await listQueueUploads(accountId));
  void refreshStorage().catch(() => undefined);
}

export async function retryQueuedUpload(uploadId: string): Promise<void> {
  const accountId = await getCurrentUserId();
  await updateQueueUpload(uploadId, accountId, { state: "queued", next_retry_at: null, last_error: null });
  await resumeQueue();
}

export async function registerQueueBackgroundTask(): Promise<void> {
  const registered = await TaskManager.getRegisteredTasksAsync();
  if (!registered.some((task) => task.taskName === QUEUE_BACKGROUND_TASK)) {
    await BackgroundTask.registerTaskAsync(QUEUE_BACKGROUND_TASK, { minimumInterval: 15 });
  }
}
