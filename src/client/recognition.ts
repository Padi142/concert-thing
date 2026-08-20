import { api } from "./api";
import type { RecognitionStatus } from "./types";

type RecognitionJob = { id: string; status: RecognitionStatus; attempt_count: number; last_error?: string | null };

async function recognitionJob(mediaId: string, rerun: boolean) {
  return api<RecognitionJob>(`/api/media/${mediaId}/recognition`, {
    method: "POST",
    body: JSON.stringify({ rerun }),
  });
}

async function recognizeAttempt(mediaId: string, progress?: (message: string) => void, rerun = false) {
  const job = await recognitionJob(mediaId, rerun);
  if (job.status !== "preparing" && job.status !== "failed") return job;
  await api(`/api/recognition/${job.id}/upload`, { method: "POST" });
  progress?.("Submitting video for recognition");
  return api<RecognitionJob>(`/api/recognition/${job.id}/submit`, { method: "POST", body: JSON.stringify({}) });
}

async function recognizeWithRetry(mediaId: string, progress?: (message: string) => void, rerun = false): Promise<RecognitionJob> {
  try {
    return await recognizeAttempt(mediaId, progress, rerun);
  } catch {
    progress?.("Retrying recognition once");
    return recognizeAttempt(mediaId, progress, false);
  }
}

export function recognizeVideo(mediaId: string, _file: File, progress?: (message: string) => void, rerun = false) {
  return recognizeWithRetry(mediaId, progress, rerun);
}

export function recognizeStoredVideo(mediaId: string, _originalName: string, _contentType: string, progress?: (message: string) => void, rerun = false) {
  return recognizeWithRetry(mediaId, progress, rerun);
}
