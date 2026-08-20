import React, { useEffect, useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { api } from "./api";
import type { MediaItem, Report, Show, SongMatch } from "./types";
import MediaGrid from "./components/MediaGrid";
import Navigation from "./components/Navigation";
import ShowForm from "./components/ShowForm";
import ShowList from "./components/ShowList";
import Uploader from "./components/Uploader";

export default function Archive({ report }: { report: Report }) {
  const [shows, setShows] = useState<Show[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [matches, setMatches] = useState<SongMatch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  async function refresh(query = activeSearch) {
    try {
      const [nextShows, nextMedia, nextMatches] = await Promise.all([
        api<Show[]>("/api/shows"),
        api<MediaItem[]>(`/api/media${query ? `?q=${encodeURIComponent(query)}` : ""}`),
        api<SongMatch[]>("/api/song-matches"),
      ]);
      setShows(nextShows);
      setMedia(nextMedia);
      setMatches(nextMatches);
    } catch (error) {
      report((error as Error).message, true);
    }
  }

  useEffect(() => {
    void refresh();
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, []);
  const inbox = useMemo(() => media.filter(item => !item.show_id), [media]);

  return <>
    <Navigation inboxCount={inbox.length} />
    <main className="mx-auto max-w-6xl px-4 pb-28 sm:px-5 md:pb-20">
      <div id="library" className="scroll-mt-4 border-b border-ink py-5 md:py-7">
        <div className="flex gap-5 text-xs font-bold uppercase tracking-wide text-ink/55"><span><strong className="text-ink">{media.length}</strong> media</span><span><strong className="text-ink">{shows.length}</strong> shows</span><span><strong className="text-ink">{inbox.length}</strong> inbox</span></div>
        <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); setActiveSearch(search); void refresh(search); }}><input className="m-0" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search confirmed songs or Artists" aria-label="Search Library by song"/><button className="button" type="submit">Search</button>{activeSearch && <button className="button-secondary" type="button" onClick={() => { setSearch(""); setActiveSearch(""); void refresh(""); }}>Clear</button>}</form>
      </div>

      <section id="upload" className="panel">
        <SectionLabel>Upload</SectionLabel>
        <Uploader shows={shows} onMediaComplete={() => void refresh()} report={report} />
      </section>

      <section id="inbox" className="panel">
        <SectionLabel>Inbox</SectionLabel>
        <MediaGrid items={inbox} shows={shows} matches={matches} onChanged={() => void refresh()} report={report} />
      </section>

      <section id="shows" className="panel">
        <div className="mb-5 flex min-h-12 items-center justify-between border-b border-ink pb-3">
          <span className="text-sm font-bold uppercase tracking-wide">Shows</span>
          <button className="button-secondary min-h-11 px-3" onClick={() => setShowForm(true)}><CalendarPlus size={16}/>Add</button>
        </div>
        {showForm && <ShowForm report={report} onCancel={() => setShowForm(false)} onCreated={() => { setShowForm(false); void refresh(); }} />}
        <ShowList shows={shows} />
      </section>

      <section className="panel">
        <SectionLabel>All media</SectionLabel>
        <MediaGrid items={media} shows={shows} matches={matches} onChanged={() => void refresh()} report={report} />
      </section>
    </main>
  </>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 border-b border-ink pb-3 text-sm font-bold uppercase tracking-wide">{children}</div>;
}
