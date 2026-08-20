import React, { useState } from "react";
import { ImagePlus, Video } from "lucide-react";
import { api } from "../api";
import { formatDuration } from "../mediaMetadata";
import type { MediaItem, Report, Show, SongMatch } from "../types";
import SongMatches from "./SongMatches";

type Props = {
  items: MediaItem[];
  shows: Show[];
  matches: SongMatch[];
  onChanged: () => void;
  report: Report;
};

export default function MediaGrid(props: Props) {
  if (!props.items.length) return <p className="border-y border-ink/20 py-8 text-sm text-ink/50">Nothing here yet.</p>;
  return <div className="grid grid-cols-2 gap-x-2 gap-y-4 md:grid-cols-3 md:gap-3 lg:grid-cols-4">
    {props.items.map(item => <MediaCard key={item.id} item={item} {...props}/>) }
  </div>;
}

function MediaCard({ item, shows, matches, onChanged, report }: Props & { item: MediaItem }) {
  const [measuredDuration, setMeasuredDuration] = useState<number | null>(null);
  const duration = formatDuration(item.duration_ms ?? measuredDuration);

  async function assign(showId: string) {
    try {
      await api(`/api/media/${item.id}/assignment`, { method: "PATCH", body: JSON.stringify({ showId: showId || null }) });
      report("Assignment saved");
      onChanged();
    } catch (error) {
      report((error as Error).message, true);
    }
  }

  return <article className="media-tile">
    {item.media_type === "photo"
      ? <img className="aspect-square w-full bg-ink object-cover" loading="lazy" src={`/api/media/${item.id}/content`} alt={item.original_name}/>
      : <video className="aspect-square w-full bg-ink object-cover" controls preload="metadata" src={`/api/media/${item.id}/content`} onLoadedMetadata={event => setMeasuredDuration(Math.round(event.currentTarget.duration * 1000))}/>}
    <div className="p-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {item.media_type === "video" ? <Video className="shrink-0" size={14}/> : <ImagePlus className="shrink-0" size={14}/>}
        <strong className="truncate text-[13px]">{item.original_name}</strong>
      </div>
      <small className="text-[11px] text-ink/50">{duration ? `${duration} · ` : ""}{(item.byte_size / 1024 / 1024).toFixed(1)} MB</small>
      <select className="mt-2" aria-label={`Assign ${item.original_name} to a Show`} value={item.show_id || ""} onChange={event => void assign(event.target.value)}>
        <option value="">Inbox</option>
        {shows.map(show => <option key={show.id} value={show.id}>{show.title}</option>)}
      </select>
    </div>
    {item.media_type === "video" && <SongMatches item={item} matches={matches.filter(match => match.media_id === item.id)} onChanged={onChanged} report={report}/>}
  </article>;
}
