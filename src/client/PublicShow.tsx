/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
import React, { useEffect, useState } from "react";
import { Download, Film, LoaderCircle, Music2 } from "lucide-react";
import { publicApi } from "./api";
import { formatDuration } from "./mediaDisplay";
import type { PublicShowArchive, PublicVideo } from "./types";

function VideoCard({ video }: { video: PublicVideo }) {
  const detail = [formatDuration(video.duration_ms), `${(video.byte_size / 1024 / 1024).toFixed(1)} MB`].filter(Boolean).join(" · ");
  return <article className="overflow-hidden rounded-panel border border-line bg-surface">
    {video.stream.status === "ready" && video.stream.iframeUrl
      ? <iframe className="aspect-video w-full border-0 bg-black" src={video.stream.iframeUrl} title={video.original_name} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      : <div className="grid aspect-video w-full place-items-center bg-black px-6 text-center text-sm text-mediaInk"><div><LoaderCircle size={20} className="mx-auto mb-2 animate-spin" /><p>{video.stream.status === "error" ? "The Stream version is unavailable." : "Preparing the Stream version…"}</p></div></div>}
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{video.original_name}</h2>
        <p className="mt-1 text-xs text-muted">{detail}</p>
      </div>
      <a className="btn-secondary shrink-0" href={video.download_url} download><Download size={16} />Download</a>
    </div>
    {video.songs.length ? <div className="border-t border-line px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.08em] text-muted"><Music2 size={14} />Recognized songs</div>
      <ol className="divide-y divide-line">{video.songs.map(song => <li key={song.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{song.title}</div><div className="mt-0.5 truncate text-xs text-muted">{song.artist}</div></div>
        <span className="shrink-0 text-xs tabular-nums text-subtle">{formatDuration(song.start_ms)}</span>
      </li>)}</ol>
    </div> : null}
  </article>;
}

export default function PublicShow({ token }: { token: string }) {
  const [archive, setArchive] = useState<PublicShowArchive | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function load() {
      try {
        const value = await publicApi<PublicShowArchive>(`/api/public/shows/${token}`);
        if (cancelled) return;
        setArchive(value);
        const processing = value.videos.some(video => !["ready", "error", "not_started"].includes(video.stream.status));
        if (processing) timer = window.setTimeout(() => void load(), 10_000);
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      }
    }
    void load();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [token]);

  if (error) return <main className="grid min-h-screen place-items-center px-5"><div className="empty-state"><Film size={22} className="mb-2.5 text-blue" /><h1 className="font-display text-[24px]">This link is unavailable</h1><p className="mt-1 text-[15px] text-muted">It may have been turned off by the Show owner.</p></div></main>;
  if (!archive) return <main className="grid min-h-screen place-items-center"><LoaderCircle className="animate-spin text-blue" aria-label="Loading shared Show" /></main>;

  const { show, videos } = archive;
  return <main className="mx-auto min-h-screen max-w-3xl px-5 pb-16 pt-10 md:pt-16">
    <header className="mb-8">
      <div className="eyebrow">Shared concert archive</div>
      <h1 className="font-display text-[34px] leading-tight md:text-[42px]">{show.title}</h1>
      <p className="mt-3 text-base">{show.venue}{show.locality ? ` · ${show.locality}` : ""}</p>
      <p className="mt-1 text-sm text-muted">{new Date(show.starts_at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}</p>
      {!!show.artists.length && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{show.artists.map(artist => <span key={artist} className="text-sm font-medium text-blue">{artist}</span>)}</div>}
      <div className="hairline mt-6" />
    </header>
    {videos.length ? <section aria-label="Shared videos" className="grid minmax-0 gap-5">{videos.map(video => <VideoCard key={video.id} video={video} />)}</section> : <div className="empty-state"><Film size={22} className="mb-2.5 text-blue" /><h2 className="font-display text-[21px]">No videos yet</h2><p className="mt-1 text-[15px] text-muted">The owner has not uploaded any ready videos to this Show.</p></div>}
  </main>;
}
