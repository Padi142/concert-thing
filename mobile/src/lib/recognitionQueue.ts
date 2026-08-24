import { ApiError, getRecognitionStatus, prepareRecognitionUpload, requestRecognition, submitRecognition } from "./api";
import { getCurrentUserId } from "./clerk";
import { createRecognitionQueue } from "./recognitionQueueCore";

type RecognitionQueue = ReturnType<typeof createRecognitionQueue>;

let recognitionQueue: RecognitionQueue | null = null;
let recognitionAccountId: string | null = null;

async function scopedAccount(): Promise<{ id: string; queue: RecognitionQueue }> {
  const accountId = await getCurrentUserId();
  if (!accountId) throw new ApiError("Sign in before using song recognition.", 401);
  if (!recognitionQueue || recognitionAccountId !== accountId) {
    recognitionAccountId = accountId;
    const guard = async <T>(work: () => Promise<T>): Promise<T> => {
      if (await getCurrentUserId() !== accountId) throw new ApiError("The active account changed. Sign in again to continue recognition.", 401);
      return work();
    };
    recognitionQueue = createRecognitionQueue({
      request: (mediaId, rerun) => guard(() => requestRecognition(mediaId, rerun)),
      prepare: (jobId) => guard(() => prepareRecognitionUpload(jobId)),
      submit: (jobId) => guard(() => submitRecognition(jobId)),
      status: (mediaId) => guard(() => getRecognitionStatus(mediaId)),
    });
  }
  return { id: accountId, queue: recognitionQueue };
}

export function resetRecognitionQueue(): void {
  recognitionQueue?.dispose();
  recognitionQueue = null;
  recognitionAccountId = null;
}

export async function enqueueRecognition(mediaId: string, rerun = false): Promise<void> {
  const { queue } = await scopedAccount();
  return queue.enqueue(mediaId, rerun);
}

export async function refreshRecognition(mediaId: string): Promise<ReturnType<RecognitionQueue["refresh"]>> {
  const { queue } = await scopedAccount();
  return queue.refresh(mediaId);
}

export function recognitionSnapshot(mediaId: string) {
  if (!recognitionQueue || !recognitionAccountId) return null;
  return recognitionQueue.snapshot(mediaId);
}

export function subscribeRecognition(mediaId: string, listener: Parameters<RecognitionQueue["subscribe"]>[1]): () => void {
  let active = true;
  let unsubscribe: () => void = () => undefined;
  void scopedAccount().then(({ queue }) => {
    if (active) unsubscribe = queue.subscribe(mediaId, listener);
  }).catch(() => undefined);
  return () => {
    active = false;
    unsubscribe();
  };
}
