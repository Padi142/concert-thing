import { api } from "./api";
import type { RecognitionStatus } from "./types";

type RecognitionJob = { id: string; status: RecognitionStatus; attempt_count: number; last_error?: string | null };
type PreparedUpload = { jobId: string; url: string; key: string; headers: Record<string, string> };

async function recognitionJob(mediaId: string, rerun: boolean) {
  return api<RecognitionJob>(`/api/media/${mediaId}/recognition`, {
    method: "POST",
    body: JSON.stringify({ rerun }),
  });
}

async function uploadOriginal(job: RecognitionJob, body: BodyInit, progress?: (message: string) => void) {
  const prepared = await api<PreparedUpload>(`/api/recognition/${job.id}/upload`, { method: "POST" });
  try {
    progress?.("Sending video for recognition");
    const response = await fetch(prepared.url, { method: "PUT", headers: prepared.headers, body });
    if (!response.ok) throw new Error(`Recognition upload failed (${response.status})`);
    return await api<RecognitionJob>(`/api/recognition/${job.id}/submit`, { method: "POST", body: JSON.stringify({}) });
  } catch (error) {
    await api(`/api/recognition/${job.id}/fail`, { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    throw error;
  }
}

async function recognizeAttempt(mediaId: string, body: BodyInit, progress?: (message: string) => void, rerun = false) {
  const job = await recognitionJob(mediaId, rerun);
  if (job.status !== "preparing" && job.status !== "failed") return job;
  return uploadOriginal(job, body, progress);
}

export async function recognizeVideo(mediaId: string, file: File, progress?: (message: string) => void, rerun = false): Promise<RecognitionJob> {
  try {
    return await recognizeAttempt(mediaId, file, progress, rerun);
  } catch {
    progress?.("Retrying recognition once");
    return recognizeAttempt(mediaId, file, progress, false);
  }
}

export async function recognizeStoredVideo(mediaId: string, _originalName: string, _contentType: string, progress?: (message: string) => void, rerun = false) {
  const job = await recognitionJob(mediaId, rerun);
  if (job.status !== "preparing" && job.status !== "failed") return job;
  progress?.("Reading private original");
  const response = await fetch(`/api/media/${mediaId}/content`, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Private original could not be read");
  const original = await response.blob();
  try {
    return await uploadOriginal(job, original, progress);
  } catch {
    progress?.("Retrying recognition once");
    const retry = await recognitionJob(mediaId, false);
    return uploadOriginal(retry, original, progress);
  }
}
