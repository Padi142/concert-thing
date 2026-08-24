import assert from "node:assert/strict";
import { videosForEventSync } from "../src/lib/eventSync";
import type { MediaItem } from "../src/types";

function media(overrides: Partial<MediaItem>): MediaItem {
  return {
    id: "media-1",
    original_name: "clip.mp4",
    media_type: "video",
    content_type: "video/mp4",
    byte_size: 1,
    duration_ms: 1_000,
    captured_at: "2026-08-20T20:00:00.000Z",
    status: "ready",
    stream_status: "ready",
    show_id: null,
    show_title: null,
    assignment_method: null,
    created_at: "2026-08-20T20:01:00.000Z",
    ...overrides,
  };
}

const start = new Date("2026-08-20T19:00:00.000Z");
const end = new Date("2026-08-20T23:00:00.000Z");

assert.deepEqual(
  videosForEventSync([
    media({ id: "inside" }),
    media({ id: "outside", captured_at: "2026-08-21T01:00:00.000Z" }),
    media({ id: "photo", media_type: "photo" }),
    media({ id: "assigned", show_id: "show-1", assignment_method: "owner" }),
    media({ id: "explicit-inbox", assignment_method: "owner" }),
  ], start, end).map((item) => item.id),
  ["inside"],
);

assert.deepEqual(
  videosForEventSync([
    media({ id: "source", captured_at: null, assignment_method: "owner" }),
    media({ id: "inside", captured_at: "2026-08-20T21:00:00.000Z" }),
  ], start, end, "source").map((item) => item.id),
  ["source", "inside"],
);

console.log("event sync tests passed");
