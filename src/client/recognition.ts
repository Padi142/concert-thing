import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";
import { api } from "./api";
import type { RecognitionStatus } from "./types";

type RecognitionJob = { id: string; status: RecognitionStatus; attempt_count: number; last_error?: string | null };
type PreparedUpload = { jobId: string; url: string; key: string; headers: Record<string, string> };

let extractionQueue: Promise<void> = Promise.resolve();

function serializeExtraction<T>(work: () => Promise<T>): Promise<T> {
  const result = extractionQueue.then(work, work);
  extractionQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function extractAudio(file: File, progress?: (message: string) => void): Promise<Blob> {
  progress?.("Loading audio tools");
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({ coreURL, wasmURL });
  await ffmpeg.createDir("/source");
  await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, "/source");
  progress?.("Extracting audio");
  const exitCode = await ffmpeg.exec(["-i", `/source/${file.name}`, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", "/recognition.m4a"]);
  if (exitCode !== 0) {
    ffmpeg.terminate();
    throw new Error("This video's audio could not be extracted");
  }
  const output = await ffmpeg.readFile("/recognition.m4a");
  ffmpeg.terminate();
  if (!(output instanceof Uint8Array)) throw new Error("Audio extraction returned an unsupported result");
  const bytes = new Uint8Array(output.byteLength);
  bytes.set(output);
  return new Blob([bytes], { type: "audio/mp4" });
}

async function recognizeAttempt(mediaId: string, file: File, progress?: (message: string) => void, rerun = false): Promise<RecognitionJob> {
  const job = await api<RecognitionJob>(`/api/media/${mediaId}/recognition`, { method: "POST", body: JSON.stringify({ rerun }) });
  if (job.status === "budget_exhausted") return job;
  if (job.status !== "preparing" && job.status !== "failed") return job;
  const prepared = await api<PreparedUpload>(`/api/recognition/${job.id}/upload`, { method: "POST" });
  try {
    const audio = await serializeExtraction(() => extractAudio(file, progress));
    progress?.("Sending audio for recognition");
    const response = await fetch(prepared.url, { method: "PUT", headers: prepared.headers, body: audio });
    if (!response.ok) throw new Error(`Audio upload failed (${response.status})`);
    return await api<RecognitionJob>(`/api/recognition/${job.id}/submit`, { method: "POST", body: JSON.stringify({}) });
  } catch (error) {
    await api(`/api/recognition/${job.id}/fail`, { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    throw error;
  }
}

export async function recognizeVideo(mediaId: string, file: File, progress?: (message: string) => void, rerun = false): Promise<RecognitionJob> {
  try {
    return await recognizeAttempt(mediaId, file, progress, rerun);
  } catch {
    progress?.("Retrying recognition once");
    return recognizeAttempt(mediaId, file, progress, false);
  }
}

export async function recognizeStoredVideo(mediaId: string, originalName: string, contentType: string, progress?: (message: string) => void, rerun = false) {
  const job = await api<RecognitionJob>(`/api/media/${mediaId}/recognition`, { method: "POST", body: JSON.stringify({ rerun }) });
  if (job.status !== "preparing" && job.status !== "failed") return job;
  progress?.("Downloading private original");
  const response = await fetch(`/api/media/${mediaId}/content`, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Private original could not be downloaded");
  const file = new File([await response.blob()], originalName, { type: contentType });
  return recognizeVideo(mediaId, file, progress, rerun);
}
