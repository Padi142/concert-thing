import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { MediaItem, Show, SongMatch } from "../types";
import { assignMedia as assignMediaRequest, getMedia, getShows, getSongMatches } from "../lib/api";

export function useArchive(): {
  shows: Show[];
  media: MediaItem[];
  songMatches: SongMatch[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  assignMedia: (mediaId: string, showId: string | null) => Promise<void>;
} {
  const [shows, setShows] = useState<Show[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [songMatches, setSongMatches] = useState<SongMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextShows, nextMedia, nextMatches] = await Promise.all([getShows(), getMedia(), getSongMatches()]);
      setShows(nextShows);
      setMedia(nextMedia);
      setSongMatches(nextMatches);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Archive could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const assignMedia = useCallback(async (mediaId: string, showId: string | null) => {
    await assignMediaRequest(mediaId, showId);
    setMedia((current) => current.map((item) => item.id === mediaId ? { ...item, show_id: showId, show_title: showId ? shows.find((show) => show.id === showId)?.title ?? null : null, assignment_method: showId ? "owner" : null } : item));
  }, [shows]);
  return useMemo(() => ({ shows, media, songMatches, loading, error, refresh, assignMedia }), [shows, media, songMatches, loading, error, refresh, assignMedia]);
}
