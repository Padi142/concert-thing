import React from "react";
import { ChevronRight } from "lucide-react";
import type { Show } from "../types";

export default function ShowList({ shows, mediaCount, onOpen }: { shows: Show[]; mediaCount: (id: string) => number; onOpen: (id: string) => void }) {
  if (!shows.length) return null;
  return <div>{shows.map(show => <button key={show.id} type="button" onClick={() => onOpen(show.id)} className="flex min-h-[88px] w-full items-center gap-3 border-b border-line py-4 text-left" aria-label={`Open ${show.title}`}>
    <span className="min-w-0 flex-1">
      <span className="block truncate font-display text-[19px] leading-tight">{show.title}</span>
      <span className="mt-1 block truncate text-sm text-muted">{show.venue}{show.locality ? ` · ${show.locality}` : ""}</span>
      <span className="mt-1 block text-[13px] text-subtle">{new Date(show.starts_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {mediaCount(show.id)} {mediaCount(show.id) === 1 ? "item" : "items"}</span>
    </span>
    <ChevronRight size={18} className="shrink-0 text-muted" />
  </button>)}</div>;
}
