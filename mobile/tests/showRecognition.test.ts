import assert from "node:assert/strict";
import { videosForRecognitionRerun } from "../src/lib/showRecognition";
import type { MediaItem } from "../src/types";

function media(overrides: Partial<MediaItem>): MediaItem {
  return {
    id: "media-1",
    original_name: "clip.mp4",
    media_type: "video",
    content_type: "video/mp4",
    byte_size: 1,
    duration_ms: 1_000,
    captured_at: null,
    status: "ready",
    stream_status: "ready",
    show_id: "show-1",
    show_title: "A Show",
    assignment_method: "owner",
    created_at: "2026-08-21T12:00:00.000Z",
    ...overrides,
  };
}

assert.deepEqual(
  videosForRecognitionRerun([
    media({ id: "ready-video" }),
    media({ id: "photo", media_type: "photo", content_type: "image/jpeg" }),
    media({ id: "uploading", status: "uploading" }),
    media({ id: "other-show", show_id: "show-2" }),
  ], "show-1").map((item) => item.id),
  ["ready-video"],
);

console.log("show recognition rerun selection tests passed");
