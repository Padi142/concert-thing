import type { MediaItem } from "../types";

export function videosForRecognitionRerun(media: MediaItem[], showId: string): MediaItem[] {
  return media.filter((item) => item.show_id === showId && item.media_type === "video" && item.status === "ready");
}
