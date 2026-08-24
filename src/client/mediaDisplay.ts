import { useEffect, useState } from "react";
import { api } from "./api";
import type { SongMatch } from "./types";

export type StreamInfo = { status: string; iframeUrl?: string; hlsUrl?: string; thumbnailUrl?: string; error?: string | null };

let importQueue: Promise<void> = Promise.resolve();

function queueImport(mediaId: string): Promise<void> {
  const importVideo = importQueue.then(async () => {
    await api(`/api/media/${mediaId}/stream`, { method: "POST" });
  });
  importQueue = importVideo.catch(() => undefined);
  return importVideo;
}

export function useStreamInfo(mediaId: string, enabled: boolean): StreamInfo | null {
  const [info, setInfo] = useState<StreamInfo | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number | undefined;
    async function check() {
      try {
        const next = await api<StreamInfo>(`/api/media/${mediaId}/stream`);
        if (cancelled) return;
        setInfo(next);
        if (next.status !== "ready" && next.status !== "error") timer = window.setTimeout(() => void check(), 5_000);
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void check(), 10_000);
      }
    }
    void queueImport(mediaId).then(check).catch(() => setInfo({ status: "error" }));
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [mediaId, enabled]);
  return info;
}

const REVIEW_PRIORITY: Record<SongMatch["review_state"], number> = {
  manual: 4, edited: 3, confirmed: 2, pending: 1, rejected: 0,
};

export function preferredSongMatches(matches: SongMatch[]): Map<string, SongMatch> {
  const preferred = new Map<string, SongMatch>();
  for (const match of matches) {
    if (match.review_state === "rejected") continue;
    const current = preferred.get(match.media_id);
    const isBetterState = !current || REVIEW_PRIORITY[match.review_state] > REVIEW_PRIORITY[current.review_state];
    const isEarlierSameState = current
      && REVIEW_PRIORITY[match.review_state] === REVIEW_PRIORITY[current.review_state]
      && match.start_ms < current.start_ms;
    if (isBetterState || isEarlierSameState) preferred.set(match.media_id, match);
  }
  return preferred;
}

export function formatDuration(durationMs: number | null | undefined): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return null;
  const totalSeconds = Math.round(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}
