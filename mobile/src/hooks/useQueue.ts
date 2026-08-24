import { useCallback, useEffect, useState } from "react";
import type { QueueUpload } from "../types";
import { cancelQueuedUpload, queueSnapshot, registerQueueBackgroundTask, resumeQueue, retryQueuedUpload, subscribeQueue } from "../lib/uploadQueue";

export function useQueue(): {
  uploads: QueueUpload[];
  refresh: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
} {
  const [uploads, setUploads] = useState<QueueUpload[]>([]);
  const refresh = useCallback(async () => setUploads(await queueSnapshot()), []);
  useEffect(() => {
    const unsubscribe = subscribeQueue(setUploads);
    void registerQueueBackgroundTask().catch(() => undefined);
    void resumeQueue().catch(() => undefined);
    return unsubscribe;
  }, []);
  return {
    uploads,
    refresh,
    resume: resumeQueue,
    cancel: cancelQueuedUpload,
    retry: retryQueuedUpload,
  };
}
