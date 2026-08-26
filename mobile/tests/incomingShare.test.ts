import assert from "node:assert/strict";
import type { ResolvedSharePayload } from "expo-sharing";
import { isSharedVideo, sharedVideosToAssets } from "../src/lib/incomingShare";

const video = {
  value: "content://media/42",
  shareType: "video",
  mimeType: "video/mp4",
  contentUri: "file:///cache/VID%20042.mp4",
  contentType: "video",
  contentMimeType: "video/mp4",
  originalName: "VID 042.mp4",
  contentSize: 42,
} satisfies ResolvedSharePayload;

const text = {
  value: "not a video",
  shareType: "text",
  mimeType: "text/plain",
  contentUri: null,
  contentType: "text",
  contentMimeType: "text/plain",
  originalName: null,
  contentSize: null,
} satisfies ResolvedSharePayload;

const genericVideo = {
  ...video,
  mimeType: "application/octet-stream",
  contentMimeType: "application/octet-stream",
  originalName: null,
  contentUri: "file:///cache/shared-video",
} satisfies ResolvedSharePayload;

assert.equal(isSharedVideo(video), true);
assert.equal(isSharedVideo(text), false);
assert.deepEqual(sharedVideosToAssets([video, text, genericVideo]), [{
  uri: "file:///cache/VID%20042.mp4",
  name: "VID 042.mp4",
  mimeType: "video/mp4",
  size: 42,
  capturedAt: null,
  durationMs: null,
}, {
  uri: "file:///cache/shared-video",
  name: "shared-video",
  mimeType: "video/mp4",
  size: 42,
  capturedAt: null,
  durationMs: null,
}]);

console.log("incoming share tests passed");
