import React from "react";
import { MapPin } from "lucide-react";
import type { Show } from "../types";

export default function ShowList({ shows }: { shows: Show[] }) {
  if (!shows.length) return <p className="py-6 text-sm text-ink/50">No Shows yet.</p>;
  return <div>{shows.map(show => <article key={show.id} className="grid gap-2 border-b border-ink/25 py-5 md:grid-cols-[10rem_1fr_auto] md:items-center md:py-6">
    <time className="text-xs font-bold uppercase text-ember">{new Date(show.starts_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</time>
    <div><div className="text-lg font-bold leading-tight md:text-xl">{show.title}</div><p className="mt-1 text-sm text-ink/50">{show.artists.join(" · ") || "Artist not set"}</p></div>
    <p className="mt-1 flex items-center gap-1 text-xs md:mt-0"><MapPin size={13}/>{show.venue}{show.locality && `, ${show.locality}`}</p>
  </article>)}</div>;
}
