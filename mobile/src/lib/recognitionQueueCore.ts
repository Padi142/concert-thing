import type { RecognitionJob } from "../types";

export type RecognitionQueueStatus = RecognitionJob["status"] | "queued";

export type RecognitionQueueEntry = {
  mediaId: string;
  status: RecognitionQueueStatus;
  error: string | null;
};

type RecognitionQueueClient = {
  request: (mediaId: string, rerun: boolean) => Promise<RecognitionJob>;
  prepare: (jobId: string) => Promise<unknown>;
  submit: (jobId: string) => Promise<unknown>;
  status: (mediaId: string) => Promise<RecognitionJob>;
};

type Listener = (entry: RecognitionQueueEntry) => void;
type Schedule = (callback: () => void, delayMs: number) => unknown;

const POLL_INTERVAL_MS = 8_000;
const POLLING_STATUSES = new Set<RecognitionQueueStatus>(["submitted", "processing"]);

/**
 * Owns recognition work outside any screen lifecycle. Subscriptions only mirror
 * state; removing the last subscriber never cancels submission or polling.
 */
export function createRecognitionQueue(
  client: RecognitionQueueClient,
  schedule: Schedule = (callback, delayMs) => setTimeout(callback, delayMs),
) {
  const entries = new Map<string, RecognitionQueueEntry>();
  const listeners = new Map<string, Set<Listener>>();
  const pending: { mediaId: string; rerun: boolean; resolve: () => void }[] = [];
  const queuedMedia = new Set<string>();
  const submissions = new Map<string, Promise<void>>();
  const pollingMedia = new Set<string>();
  let draining = false;
  let disposed = false;

  function publish(entry: RecognitionQueueEntry): void {
    if (disposed) return;
    entries.set(entry.mediaId, entry);
    for (const listener of listeners.get(entry.mediaId) ?? []) listener(entry);
  }

  function update(mediaId: string, status: RecognitionQueueStatus, error: string | null = null): RecognitionQueueEntry {
    const entry = { mediaId, status, error };
    publish(entry);
    return entry;
  }

  function schedulePoll(mediaId: string): void {
    if (disposed || pollingMedia.has(mediaId)) return;
    pollingMedia.add(mediaId);
    schedule(() => {
      if (disposed) return;
      pollingMedia.delete(mediaId);
      void poll(mediaId);
    }, POLL_INTERVAL_MS);
  }

  async function poll(mediaId: string): Promise<void> {
    if (disposed) return;
    try {
      const job = await client.status(mediaId);
      update(mediaId, job.status, job.last_error);
      if (POLLING_STATUSES.has(job.status)) schedulePoll(mediaId);
    } catch (cause) {
      const current = entries.get(mediaId);
      if (!current || !POLLING_STATUSES.has(current.status)) return;
      publish({ ...current, error: cause instanceof Error ? cause.message : "Recognition status is unavailable" });
      schedulePoll(mediaId);
    }
  }

  async function submit(mediaId: string, rerun: boolean): Promise<void> {
    if (disposed) return;
    try {
      let job = await client.request(mediaId, rerun);
      update(mediaId, job.status, job.last_error);
      if (job.status === "preparing" || job.status === "failed") {
        await client.prepare(job.id);
        await client.submit(job.id);
        job = { ...job, status: "submitted", last_error: null };
        update(mediaId, job.status);
      }
      if (POLLING_STATUSES.has(job.status)) schedulePoll(mediaId);
    } catch (cause) {
      update(mediaId, "failed", cause instanceof Error ? cause.message : "Recognition is unavailable");
    }
  }

  async function drain(): Promise<void> {
    if (disposed || draining) return;
    draining = true;
    try {
      while (pending.length) {
        const work = pending.shift()!;
        try {
          if (!disposed) await submit(work.mediaId, work.rerun);
        } finally {
          queuedMedia.delete(work.mediaId);
          submissions.delete(work.mediaId);
          work.resolve();
        }
      }
    } finally {
      draining = false;
      if (pending.length) void drain();
    }
  }

  return {
    enqueue(mediaId: string, rerun = false): Promise<void> {
      const current = submissions.get(mediaId);
      if (current) return current;
      if (POLLING_STATUSES.has(entries.get(mediaId)?.status ?? "failed")) return Promise.resolve();
      let resolve!: () => void;
      const completion = new Promise<void>((done) => { resolve = done; });
      submissions.set(mediaId, completion);
      queuedMedia.add(mediaId);
      pending.push({ mediaId, rerun, resolve });
      update(mediaId, "queued");
      void drain();
      return completion;
    },

    async refresh(mediaId: string): Promise<RecognitionQueueEntry | null> {
      if (queuedMedia.has(mediaId)) return entries.get(mediaId) ?? null;
      try {
        const job = await client.status(mediaId);
        // A button press may have queued new work while this status request was
        // in flight. Never let the older response overwrite queued progress.
        if (queuedMedia.has(mediaId)) return entries.get(mediaId) ?? null;
        const entry = update(mediaId, job.status, job.last_error);
        if (POLLING_STATUSES.has(job.status)) schedulePoll(mediaId);
        return entry;
      } catch {
        return entries.get(mediaId) ?? null;
      }
    },

    snapshot(mediaId: string): RecognitionQueueEntry | null {
      return entries.get(mediaId) ?? null;
    },

    subscribe(mediaId: string, listener: Listener): () => void {
      if (disposed) return () => undefined;
      const mediaListeners = listeners.get(mediaId) ?? new Set<Listener>();
      mediaListeners.add(listener);
      listeners.set(mediaId, mediaListeners);
      return () => {
        mediaListeners.delete(listener);
        if (!mediaListeners.size) listeners.delete(mediaId);
      };
    },

    dispose(): void {
      disposed = true;
      for (const work of pending.splice(0)) work.resolve();
      submissions.clear();
      queuedMedia.clear();
      pollingMedia.clear();
      listeners.clear();
      entries.clear();
    },
  };
}
