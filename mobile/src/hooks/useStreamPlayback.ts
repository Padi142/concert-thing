import { useEffect, useState } from "react";
import { getStreamPlayback, startStreamImport } from "../lib/api";
import { streamPlaybackAction, type StreamPlayback } from "../lib/streamPlayback";

export function useStreamPlayback(mediaId: string, enabled: boolean): StreamPlayback | null {
  const [playback, setPlayback] = useState<StreamPlayback | null>(null);

  useEffect(() => {
    let cancelled = false;
    let importRequested = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    setPlayback(null);
    if (!enabled) return () => undefined;

    const schedule = (delay: number) => {
      if (!cancelled) timer = setTimeout(() => void refresh(), delay);
    };
    const refresh = async () => {
      try {
        const next = await getStreamPlayback(mediaId);
        if (cancelled) return;
        setPlayback(next);
        const action = streamPlaybackAction(next, importRequested);
        if (action === "start") {
          importRequested = true;
          await startStreamImport(mediaId);
          schedule(1_000);
        } else if (action === "poll") {
          schedule(5_000);
        }
      } catch {
        schedule(10_000);
      }
    };

    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, mediaId]);

  return playback;
}
