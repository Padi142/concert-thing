import React, { useEffect, useState } from "react";
import { api } from "../api";

type StreamState = { status: string; iframeUrl?: string; error?: string | null };

let importQueue: Promise<void> = Promise.resolve();

function queueImport(mediaId: string): Promise<void> {
  const importVideo = importQueue.then(async () => {
    await api(`/api/media/${mediaId}/stream`, { method: "POST" });
  });
  importQueue = importVideo.catch(() => undefined);
  return importVideo;
}

export default function StreamVideo({ mediaId, name, onDuration }: { mediaId: string; name: string; onDuration: (durationMs: number) => void }) {
  const [stream, setStream] = useState<StreamState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function check() {
      try {
        const state = await api<StreamState>(`/api/media/${mediaId}/stream`);
        if (cancelled) return;
        setStream(state);
        if (state.status !== "ready" && state.status !== "error") timer = window.setTimeout(() => void check(), 5_000);
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void check(), 10_000);
      }
    }
    void queueImport(mediaId).then(check).catch(() => setStream({ status: "error" }));
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [mediaId]);

  if (stream?.status === "ready" && stream.iframeUrl) {
    return <iframe className="aspect-square w-full border-0 bg-ink" src={stream.iframeUrl} title={name} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen/>;
  }
  return <div className="relative">
    <video className="aspect-square w-full bg-ink object-cover" controls playsInline preload="none" src={`/api/media/${mediaId}/content`} onLoadedMetadata={event => onDuration(Math.round(event.currentTarget.duration * 1000))}/>
    {stream && stream.status !== "error" && <span className="pointer-events-none absolute right-2 top-2 bg-ink/80 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-paper">Optimizing video</span>}
  </div>;
}
