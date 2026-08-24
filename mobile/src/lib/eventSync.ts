import type { MediaItem } from "../types";

export function videosForEventSync(
  media: MediaItem[],
  startsAt: Date,
  endsAt: Date,
  sourceMediaId?: string,
): MediaItem[] {
  const start = startsAt.getTime();
  const end = endsAt.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  return media
    .filter((item) => {
      if (item.media_type !== "video" || item.status !== "ready" || item.show_id) return false;
      if (item.id === sourceMediaId) return true;
      if (item.assignment_method) return false;
      if (!item.captured_at) return false;
      const capturedAt = Date.parse(item.captured_at);
      return Number.isFinite(capturedAt) && capturedAt >= start && capturedAt <= end;
    })
    .sort((left, right) => {
      if (left.id === sourceMediaId) return -1;
      if (right.id === sourceMediaId) return 1;
      return Date.parse(left.captured_at ?? "") - Date.parse(right.captured_at ?? "");
    });
}
