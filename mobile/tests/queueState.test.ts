import assert from "node:assert/strict";
import {
  MAX_ACTIVE_TRANSFERS,
  activeTransferCount,
  canStartUpload,
  completedParts,
  createParts,
  createQueueUpload,
  markUploadComplete,
  markUploadDuplicate,
  markUploadQuotaBlocked,
  restartExpiredUpload,
  mergePartReceipts,
  nextPart,
  retryUpload,
  selectUploadBatch,
} from "../src/lib/queueState";
import { formatMediaDuration, preferredSongMatches, songMatchText } from "../src/lib/mediaDisplay";
import type { SongMatch } from "../src/types";

const now = 1_700_000_000_000;
const upload = createQueueUpload({
  id: "local-1",
  localUri: "file:///local/show.mov",
  originalName: "show.mov",
  contentType: "video/quicktime",
  byteSize: 20,
  now,
});
assert.equal(upload.account_id, null, "pre-auth queue rows remain unowned until the backend legacy claim authorizes migration");
const ownedUpload = createQueueUpload({
  id: "owned-local-1",
  localUri: "file:///local/show.mov",
  originalName: "show.mov",
  contentType: "video/quicktime",
  byteSize: 20,
  accountId: "user_first",
});
assert.equal(ownedUpload.account_id, "user_first", "new queue rows carry their Clerk account ID");
const parts = createParts(20, 8, "queue-1", now);
assert.ok(parts.every((part) => part.queue_id === "queue-1"), "parts belong to their durable local queue row");
assert.deepEqual(parts.map((part) => [part.part_number, part.byte_start, part.byte_end]), [[1, 0, 8], [2, 8, 16], [3, 16, 20]]);
assert.equal(nextPart(parts)?.part_number, 1);

const merged = mergePartReceipts(parts, [{ partNumber: 2, etag: "etag-2" }], now + 1);
assert.deepEqual(completedParts(merged), [{ partNumber: 2, etag: "etag-2" }]);
assert.equal(nextPart(merged)?.part_number, 1);

const first = markUploadComplete(upload, now + 2);
assert.equal(first.state, "complete");
assert.equal(upload.content_hash, null);
const duplicate = markUploadDuplicate(upload, "media-existing", now + 3);
assert.equal(duplicate.state, "duplicate");
assert.equal(duplicate.media_id, "media-existing");
assert.equal(duplicate.next_retry_at, null);
assert.equal(activeTransferCount([{ ...upload, state: "uploading" }, { ...upload, id: "local-2", state: "uploading" }]), MAX_ACTIVE_TRANSFERS);
assert.equal(canStartUpload(upload, [{ ...upload, state: "uploading" }, { ...upload, id: "local-2", state: "uploading" }], now), false);

const retrying = retryUpload(upload, "network unavailable", now);
assert.equal(retrying.state, "retrying");
assert.equal(retrying.next_retry_at, now + 2_000);
assert.equal(canStartUpload(retrying, [retrying], now), false);
assert.equal(canStartUpload(retrying, [retrying], retrying.next_retry_at!), true);

const quotaBlocked = markUploadQuotaBlocked(upload, "9.4 GB available", now + 4);
assert.equal(quotaBlocked.state, "blocked");
assert.equal(quotaBlocked.next_retry_at, null, "quota-blocked uploads never enter automatic retry");
assert.equal(quotaBlocked.last_error, "Not enough storage · 9.4 GB available");
assert.equal(canStartUpload(quotaBlocked, [quotaBlocked], now + 5), false, "blocked uploads wait for an Owner retry");

const expired = restartExpiredUpload({
  ...upload,
  media_id: "expired-media",
  upload_id: "expired-upload",
  chunk_size: 8,
  retry_count: 3,
  last_error: "Gone",
}, now + 6);
assert.equal(expired.state, "queued");
assert.equal(expired.media_id, null);
assert.equal(expired.upload_id, null);
assert.equal(expired.chunk_size, null);
assert.equal(expired.retry_count, 0);
assert.equal(expired.last_error, null);

const queuedPhoto = { ...upload, id: "photo-1", content_type: "image/jpeg" };
const queuedVideo = { ...upload, id: "video-1", content_type: "video/mp4" };
assert.deepEqual(
  selectUploadBatch([queuedVideo, queuedPhoto]).map((item) => item.id),
  ["video-1"],
  "a large video runs alone to cap memory and storage pressure",
);
assert.deepEqual(
  selectUploadBatch([queuedPhoto, { ...queuedPhoto, id: "photo-2" }, queuedVideo]).map((item) => item.id),
  ["photo-1", "photo-2"],
  "small images can still use bounded parallelism",
);

assert.equal(formatMediaDuration(30_400), "0:30");
assert.equal(formatMediaDuration(3_661_000), "1:01:01");
assert.equal(formatMediaDuration(null), null);

const match = (overrides: Partial<SongMatch>): SongMatch => ({
  id: "match-1",
  media_id: "media-1",
  start_ms: 0,
  end_ms: null,
  confidence: null,
  candidate_title: null,
  candidate_artist: null,
  review_state: "pending",
  song_id: null,
  title: "Pending song",
  artist: "Pending artist",
  ...overrides,
});
const chosen = preferredSongMatches([
  match({ id: "rejected", review_state: "rejected", title: "Rejected" }),
  match({ id: "pending", start_ms: 1_000 }),
  match({ id: "confirmed", review_state: "confirmed", title: "Confirmed song", artist: "Confirmed artist", start_ms: 5_000 }),
]);
assert.equal(chosen.get("media-1")?.id, "confirmed");
assert.deepEqual(songMatchText(chosen.get("media-1")), { title: "Confirmed song", artist: "Confirmed artist" });

console.log("queueState tests passed");
