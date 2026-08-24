import React from "react";
import { ImageOff, Play, Video } from "lucide-react";
import { formatDuration, preferredSongMatches, useStreamInfo } from "../mediaDisplay";
import type { MediaItem, Report, Show, SongMatch } from "../types";

type Props = {
  items: MediaItem[];
  shows: Show[];
  matches: SongMatch[];
  onOpen: (id: string) => void;
  onChanged: () => void;
  report: Report;
};

export default function MediaGrid({ items, matches, onOpen }: Props) {
  const preferred = preferredSongMatches(matches);
  if (!items.length) return null;
  return <div className="grid grid-cols-3 gap-1 px-1 sm:grid-cols-4 md:gap-1.5 lg:grid-cols-5">
    {items.map(item => <MediaTile key={item.id} item={item} song={preferred.get(item.id)} onOpen={onOpen} />)}
  </div>;
}

function MediaTile({ item, song, onOpen }: { item: MediaItem; song?: SongMatch; onOpen: (id: string) => void }) {
  const stream = useStreamInfo(item.id, item.media_type === "video");
  const duration = formatDuration(item.duration_ms);
  const title = song?.title?.trim() || "";
  const artist = (song?.artist || "").trim();
  const thumbnail = item.media_type === "video" && stream?.status === "ready" ? stream.thumbnailUrl : null;

  return <button type="button" className="media-tile text-left" aria-label={`Open ${item.original_name}`} onClick={() => onOpen(item.id)}>
    {item.media_type === "photo"
      ? <img className="h-full w-full object-cover" loading="lazy" src={`/api/media/${item.id}/content`} alt={item.original_name} />
      : thumbnail
        ? <img className="h-full w-full object-cover" loading="lazy" src={thumbnail} alt={item.original_name} />
        : <span className="grid h-full w-full place-items-center text-muted"><Video size={26} /></span>}
    {item.media_type === "video" && title ? <span className="absolute inset-x-0 bottom-0 block px-2 pb-1.5 pt-2 text-mediaInk" style={{ background: "var(--scrim-strong)" }}>
      <span className="block truncate text-[11px] font-semibold leading-tight">{title}</span>
      <span className="mt-0.5 flex items-center gap-1"><Play size={9} /><span className="truncate text-[10px] opacity-80">{[artist, duration].filter(Boolean).join(" · ")}</span></span>
    </span> : null}
    {item.media_type === "video" && !title ? <span className="absolute bottom-2 left-2 flex items-center rounded-[5px] bg-black/70 px-2 py-1 text-mediaInk">
      <Play size={10} />{duration && <span className="ml-1 text-[11px]">{duration}</span>}
    </span> : null}
    {item.status !== "ready" && <span className="absolute right-2 top-2 rounded-[5px] bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-mediaInk"><ImageOff size={11} /></span>}
  </button>;
}
