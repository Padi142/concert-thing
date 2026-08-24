import assert from "node:assert/strict";
import { shouldAutoRecognizeUpload } from "../src/lib/autoRecognition";

assert.equal(shouldAutoRecognizeUpload({ contentType: "video/mp4", mediaId: "video-1" }, true), true);
assert.equal(shouldAutoRecognizeUpload({ contentType: "image/jpeg", mediaId: "photo-1" }, true), false);
assert.equal(shouldAutoRecognizeUpload({ contentType: "video/quicktime", mediaId: null }, true), false);
assert.equal(shouldAutoRecognizeUpload({ contentType: "video/mp4", mediaId: "video-1" }, false), false);

console.log("automatic recognition upload decision tests passed");
