import assert from "node:assert/strict";
import { createRecognitionQueue } from "../src/lib/recognitionQueueCore";
import type { RecognitionJob } from "../src/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function main() {
  const requested = deferred<RecognitionJob>();
  const calls: string[] = [];
  const scheduled: Array<() => void> = [];
  const queue = createRecognitionQueue({
    request: async (mediaId) => {
      calls.push(`request:${mediaId}`);
      return requested.promise;
    },
    prepare: async (jobId) => { calls.push(`prepare:${jobId}`); },
    submit: async (jobId) => { calls.push(`submit:${jobId}`); },
    status: async (mediaId) => {
      calls.push(`status:${mediaId}`);
      return { id: "job-a", media_id: mediaId, status: "completed", attempt_count: 1, last_error: null };
    },
  }, (callback) => { scheduled.push(callback); });

  const videoAUpdates: string[] = [];
  const videoBUpdates: string[] = [];
  const unsubscribeA = queue.subscribe("video-a", (entry) => videoAUpdates.push(entry.status));
  queue.subscribe("video-b", (entry) => videoBUpdates.push(entry.status));

  let submissionFinished = false;
  const submission = queue.enqueue("video-a", false).then(() => { submissionFinished = true; });
  assert.equal(queue.snapshot("video-a")?.status, "queued");
  assert.equal(submissionFinished, false, "background callers can await server submission");
  unsubscribeA(); // Navigating from A to B must not own or cancel A's work.

  requested.resolve({ id: "job-a", media_id: "video-a", status: "preparing", attempt_count: 0, last_error: null });
  await flushPromises();

  assert.deepEqual(calls, ["request:video-a", "prepare:job-a", "submit:job-a"]);
  await submission;
  assert.equal(submissionFinished, true);
  assert.equal(queue.snapshot("video-a")?.status, "submitted");
  assert.deepEqual(videoBUpdates, [], "video A must never update video B's detail state");
  assert.equal(scheduled.length, 1, "submitted work keeps polling without a mounted detail screen");

  scheduled.shift()!();
  await flushPromises();

  assert.equal(queue.snapshot("video-a")?.status, "completed");
  assert.deepEqual(calls, ["request:video-a", "prepare:job-a", "submit:job-a", "status:video-a"]);
  assert.ok(videoAUpdates.includes("queued"));
  assert.deepEqual(videoBUpdates, []);

  console.log("recognition queue navigation test passed");
}

void main();
