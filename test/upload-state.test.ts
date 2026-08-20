import assert from "node:assert/strict";
import { normalizeUploadState } from "../src/client/uploadState";
import { parseMp4CreationTime } from "../src/client/mediaTimestamp";
import { formatDuration } from "../src/client/mediaMetadata";

const freshResponse = {
  mediaId: "media-1",
  uploadId: "upload-1",
  chunkSize: 8 * 1024 * 1024,
};

const state = normalizeUploadState(freshResponse);
assert.deepEqual(state.completed, [], "fresh uploads must start with an empty completed-parts list");
assert.equal(state.completed.some(part => part.partNumber === 1), false);
const mp4Header = new ArrayBuffer(24);
const bytes = new Uint8Array(mp4Header);
bytes.set([0x6d, 0x76, 0x68, 0x64], 4); // mvhd
new DataView(mp4Header).setUint32(12, 2_082_844_800 + 1_577_836_800); // 2020-01-01 UTC
assert.equal(parseMp4CreationTime(mp4Header), "2020-01-01T00:00:00.000Z");
assert.equal(formatDuration(65_000), "1:05");
assert.equal(formatDuration(3_665_000), "1:01:05");
assert.equal(formatDuration(null), null);

console.log("upload state and media timestamp regressions: passed");
