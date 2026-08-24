import type { SongMatch } from "../types";

const REVIEW_PRIORITY: Record<SongMatch["review_state"], number> = {
  manual: 4,
  edited: 3,
  confirmed: 2,
  pending: 1,
  rejected: 0,
};

export function formatMediaDuration(durationMs: number | null): string | null {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return null;
  const totalSeconds = Math.round(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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

export function songMatchText(match: SongMatch | undefined): { title: string; artist: string | null } | null {
  if (!match) return null;
  const title = (match.title || match.candidate_title || "").trim();
  if (!title) return null;
  const artist = (match.artist || match.candidate_artist || "").trim();
  return { title, artist: artist || null };
}
