import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, ChevronLeft, Images, Plus, Search, SearchX, X } from "lucide-react";
import { api } from "./api";
import type { MediaItem, Report, Show, SongMatch } from "./types";
import MediaDetail from "./components/MediaDetail";
import MediaGrid from "./components/MediaGrid";
import Navigation, { ViewName } from "./components/Navigation";
import ShowForm from "./components/ShowForm";
import ShowList from "./components/ShowList";
import ShowRecognition from "./components/ShowRecognition";
import ShowShare from "./components/ShowShare";
import Uploader from "./components/Uploader";
import StorageMeter from "./components/StorageMeter";
import type { StorageSnapshot } from "./storage";

type View = { name: ViewName } | { name: "show"; id: string };

function Heading({ eyebrow, action, children }: { eyebrow: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-3 px-5 md:px-0">
    <div className="min-w-0">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="font-display text-[28px] leading-8 md:text-[30px]">{children}</h1>
    </div>
    {action}
  </div>;
}

function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return <div className="mb-4 flex min-h-12 items-center rounded-control border border-control bg-surface px-3 focus-within:border-blue">
    <Search size={18} className="shrink-0 text-muted" />
    <input className="border-0 bg-transparent px-2 py-2 text-base focus:border-0 focus:ring-0 md:text-[15px]" style={{ boxShadow: "none" }} aria-label={label} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    {value && <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="grid h-10 w-10 shrink-0 place-items-center text-muted"><X size={17} /></button>}
  </div>;
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Images; title: string; detail: string }) {
  return <div className="empty-state"><Icon size={22} className="mb-2.5 text-blue" /><div className="font-display text-[21px] leading-7">{title}</div><p className="mt-1 text-[15px] leading-snug text-muted">{detail}</p></div>;
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return <div className="error-line">{message}{onRetry && <button type="button" className="btn-quiet mt-1 -ml-3 block" onClick={onRetry}>Try again</button>}</div>;
}

export default function Archive({ report }: { report: Report }) {
  const [view, setView] = useState<View>({ name: "library" });
  const [shows, setShows] = useState<Show[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [matches, setMatches] = useState<SongMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [showsSearch, setShowsSearch] = useState("");
  const [openMediaId, setOpenMediaId] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageSnapshot | null>(null);

  async function refreshStorage() {
    try {
      setStorage(await api<StorageSnapshot>("/api/account/storage"));
    } catch {
      // Archive loading remains usable if the storage meter cannot refresh.
    }
  }

  async function refresh() {
    try {
      const [nextShows, nextMedia, nextMatches, nextStorage] = await Promise.all([
        api<Show[]>("/api/shows"),
        api<MediaItem[]>("/api/media"),
        api<SongMatch[]>("/api/song-matches"),
        api<StorageSnapshot>("/api/account/storage").catch(() => null),
      ]);
      setShows(Array.isArray(nextShows) ? nextShows : []);
      setMedia(Array.isArray(nextMedia) ? nextMedia : []);
      setMatches(Array.isArray(nextMatches) ? nextMatches : []);
      if (nextStorage) setStorage(nextStorage);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
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
  const openMedia = useMemo(() => media.find(item => item.id === openMediaId) ?? null, [media, openMediaId]);

  const libraryGroups = useMemo(() => {
    const needle = librarySearch.trim().toLocaleLowerCase();
    const filtered = needle
      ? media.filter(item => {
          const songHit = matches.some(match => match.media_id === item.id && `${match.title} ${match.artist}`.toLocaleLowerCase().includes(needle));
          return songHit || [item.original_name, item.show_title].some(value => value?.toLocaleLowerCase().includes(needle));
        })
      : media;
    const groups: { show: Show | null; items: MediaItem[] }[] = shows.map(show => ({ show, items: filtered.filter(item => item.show_id === show.id) })).filter(group => group.items.length > 0);
    const unassigned = filtered.filter(item => !item.show_id);
    if (unassigned.length) groups.push({ show: null, items: unassigned });
    return groups;
  }, [media, shows, matches, librarySearch]);

  const visibleShows = useMemo(() => {
    const needle = showsSearch.trim().toLocaleLowerCase();
    if (!needle) return shows;
    return shows.filter(show => [show.title, show.venue, show.locality, ...show.artists].some(value => value.toLocaleLowerCase().includes(needle)));
  }, [shows, showsSearch]);

  const detailShow = view.name === "show" ? shows.find(candidate => candidate.id === view.id) : undefined;

  return <>
    <Navigation active={view.name === "show" ? "shows" : view.name} onNavigate={name => { setView({ name }); setOpenMediaId(null); setShowForm(false); }} inboxCount={inbox.length} />

    <main id="top" className="mx-auto max-w-5xl pb-32 pt-5 md:pb-16 md:pt-9">
      {view.name === "library" && <>
        <Heading eyebrow="Concert archive" action={<button type="button" className="icon-btn !bg-blue !text-accentInk" aria-label="Add photos or videos" onClick={() => setView({ name: "queue" })}><Plus size={22} /></button>}>Library</Heading>
        <div className="px-5 md:px-0">
          <SearchField value={librarySearch} onChange={setLibrarySearch} placeholder="Search files, shows, or songs" label="Search Library by file, Show, or Song" />
          {loading && !media.length ? <p className="py-6 text-[15px] text-muted">Loading your archive…</p> : null}
          <ErrorLine message={error ?? ""} onRetry={() => void refresh()} />
        </div>
        {!loading && !error && !media.length ? <div className="px-5 md:px-0"><EmptyState icon={Images} title="Your archive starts here" detail="Select photos or videos to upload. Completed items appear here, grouped under their Show." /></div> : null}
        {!loading && !error && !!media.length && !libraryGroups.length ? <div className="px-5 md:px-0"><EmptyState icon={SearchX} title="No matches" detail="Try a filename, Show, or confirmed Song title." /></div> : null}
        {libraryGroups.map(({ show, items }) => <section key={show?.id ?? "inbox"} className="mb-8">
          <div className="mb-3 px-5 md:px-0">
            <div className="font-display text-xl">{show ? show.title : "Unassigned"}</div>
            <div className="mt-1 text-sm text-muted">{show ? `${show.venue}${show.starts_at ? ` · ${new Date(show.starts_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}` : "Inbox"} · {items.length} {items.length === 1 ? "item" : "items"}</div>
            <div className="hairline mt-3" />
          </div>
          <MediaGrid items={items} shows={shows} matches={matches} onOpen={setOpenMediaId} onChanged={() => void refresh()} report={report} />
        </section>)}
      </>}

      {view.name === "inbox" && <>
        <Heading eyebrow="Needs review" action={<span className="text-[13px] font-semibold text-muted">{inbox.length} waiting</span>}>Inbox</Heading>
        <div className="px-5 md:px-0">
          {loading && !media.length ? <p className="py-6 text-[15px] text-muted">Loading inbox…</p> : null}
          <ErrorLine message={error ?? ""} onRetry={() => void refresh()} />
          {!loading && !error && !inbox.length ? <EmptyState icon={Images} title="Inbox is clear" detail="Every media item is assigned to a Show. New uploads land here when confidence is too low for automatic assignment." /> : null}
          {!!inbox.length && <MediaGrid items={inbox} shows={shows} matches={matches} onOpen={setOpenMediaId} onChanged={() => void refresh()} report={report} />}
        </div>
      </>}

      {(view.name === "shows" || view.name === "show") && (detailShow ?
        <>
          <div className="mb-5 flex items-center gap-3 px-5 md:px-0">
            <button type="button" className="icon-btn shrink-0" aria-label="Go back" onClick={() => setView({ name: "shows" })}><ChevronLeft size={22} /></button>
            <div className="min-w-0"><div className="eyebrow mb-0">Show</div><div className="truncate font-display text-2xl">{detailShow.title}</div></div>
          </div>
          <div className="hairline mb-4 mx-5 md:mx-0" />
          <div className="px-5 md:px-0">
            <p className="text-base">{detailShow.venue}{detailShow.locality ? ` · ${detailShow.locality}` : ""}</p>
            <p className="mt-1 text-sm text-muted">{new Date(detailShow.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}{detailShow.ends_at ? ` – ${new Date(detailShow.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
            {!!detailShow.artists.length && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{detailShow.artists.map(artist => <span key={artist} className="text-sm font-medium text-blue">{artist}</span>)}</div>}
            {(() => {
              const items = media.filter(item => item.show_id === detailShow.id);
              const videos = items.filter(item => item.media_type === "video" && item.status === "ready");
              return <>
                <ShowShare showId={detailShow.id} showTitle={detailShow.title} report={report} />
                <ShowRecognition videos={videos} onChanged={() => void refresh()} report={report} />
                {!items.length ? <EmptyState icon={Images} title="No media assigned" detail="Assign photos or videos to this Show from a media item's detail view." /> : <>
                  <div className="mb-3 mt-8 flex items-baseline justify-between"><h2 className="font-display text-xl">Archive</h2><span className="text-[13px] text-muted">{items.length} {items.length === 1 ? "item" : "items"}</span></div>
                  <MediaGrid items={items} shows={shows} matches={matches} onOpen={setOpenMediaId} onChanged={() => void refresh()} report={report} />
                </>}
              </>;
            })()}
          </div>
        </>
        :
        <>
          <Heading eyebrow="Your events" action={<button type="button" className="icon-btn !bg-blue !text-accentInk" aria-label="Create a Show" onClick={() => setShowForm(value => !value)}><CalendarPlus size={20} /></button>}>Shows</Heading>
          <div className="px-5 md:px-0">
            <SearchField value={showsSearch} onChange={setShowsSearch} placeholder="Search shows, venues, artists" label="Search Shows by title, venue, or Artist" />
            {showForm && <div className="mb-6"><ShowForm report={report} onCancel={() => setShowForm(false)} onCreated={() => { setShowForm(false); void refresh(); }} /></div>}
            {loading && !shows.length ? <p className="py-6 text-[15px] text-muted">Loading shows…</p> : null}
            <ErrorLine message={error ?? ""} onRetry={() => void refresh()} />
            {!loading && !error && !shows.length ? <EmptyState icon={CalendarDays} title="No shows yet" detail="Create the event first, then new media can be assigned to it." /> : null}
            {!loading && !error && !!shows.length && !visibleShows.length ? <EmptyState icon={SearchX} title="No matching shows" detail="Try another venue, artist, or title." /> : null}
            <ShowList shows={visibleShows} mediaCount={id => media.filter(item => item.show_id === id).length} onOpen={id => setView({ name: "show", id })} />
          </div>
        </>
      )}

      {view.name === "queue" && <>
        <Heading eyebrow="Uploads">Queue</Heading>
        <div className="px-5 md:px-0">
          <StorageMeter storage={storage} loading={loading} />
          <Uploader shows={shows} storage={storage} onStorageChanged={() => void refreshStorage()} onMediaComplete={() => void refresh()} report={report} />
        </div>
      </>}
    </main>

    {openMedia && <MediaDetail item={openMedia} shows={shows} matches={matches.filter(match => match.media_id === openMedia.id)} onClose={() => setOpenMediaId(null)} onChanged={() => void refresh()} report={report} />}
  </>;
}

export { EmptyState, SearchField };
