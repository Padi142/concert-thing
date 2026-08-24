import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useStreamInfo } from "../mediaDisplay";

export default function StreamVideo({ mediaId, name, onDuration }: { mediaId: string; name: string; onDuration?: (durationMs: number) => void }) {
  const [stream, setStream] = useState<{ status: string; iframeUrl?: string; error?: string | null } | null>(null);
  const info = useStreamInfo(mediaId, true);

  useEffect(() => { if (info) setStream(info); }, [info]);

  if (stream?.status === "ready" && stream.iframeUrl) {
    return <iframe className="aspect-video w-full border-0 bg-black" src={stream.iframeUrl} title={name} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen />;
  }
  return <div className="relative">
    <video className="aspect-video w-full bg-black object-cover" controls playsInline preload="metadata" src={`/api/media/${mediaId}/content`} onLoadedMetadata={event => onDuration?.(Math.round(event.currentTarget.duration * 1000))} />
    {stream && stream.status !== "error" && <span className="pointer-events-none absolute right-2 top-2 rounded-[5px] bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-mediaInk">Optimizing video</span>}
  </div>;
}
