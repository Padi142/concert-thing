import React, { useState } from "react";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { api } from "../api";
import { formatDuration } from "../mediaDisplay";
import type { MediaItem, Report, Show, SongMatch } from "../types";
import SongMatches from "./SongMatches";
import StreamVideo from "./StreamVideo";
import VideoShare from "./VideoShare";

type Props = {
  item: MediaItem;
  shows: Show[];
  matches: SongMatch[];
  onClose: () => void;
  onChanged: () => void;
  report: Report;
};

export default function MediaDetail({ item, shows, matches, onClose, onChanged, report }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function assign(showId: string) {
    try {
      await api(`/api/media/${item.id}/assignment`, { method: "PATCH", body: JSON.stringify({ showId: showId || null }) });
      report("Assignment saved");
      onChanged();
    } catch (error) {
      report((error as Error).message, true);
    }
  }

  async function remove() {
    if (!confirming) return;
    setBusy(true);
    try {
      await api(`/api/media/${item.id}`, { method: "DELETE" });
      report("Removed from Library");
      onChanged();
      onClose();
    } catch (error) {
      report((error as Error).message, true);
      setBusy(false);
      setConfirming(false);
    }
  }

  return <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
    <button type="button" aria-label="Close" className="sheet-scrim absolute inset-0 cursor-default" onClick={onClose} />
    <div role="dialog" aria-modal="true" aria-label={item.original_name} className="relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-panel bg-surface sm:rounded-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <strong className="truncate text-sm font-semibold">{item.original_name}</strong>
        <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-muted hover:text-ink" aria-label="Close" onClick={onClose}><X size={19} /></button>
      </div>

      <div className="overflow-y-auto px-4 py-4">
        {item.media_type === "video"
          ? <div className="overflow-hidden rounded-tile"><StreamVideo mediaId={item.id} name={item.original_name} /></div>
          : <img className="max-h-[50dvh] w-full rounded-tile bg-placeholder object-contain" src={`/api/media/${item.id}/content`} alt={item.original_name} />}

        <p className="mt-3 text-sm text-muted">
          {item.captured_at ? <>Captured {new Date(item.captured_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</> : "Capture time unknown"}
          {formatDuration(item.duration_ms) ? ` · ${formatDuration(item.duration_ms)}` : ""}
        </p>
        <p className="mt-1 text-xs text-subtle">{(item.byte_size / 1024 / 1024).toFixed(1)} MB · {item.media_type === "video" ? "Video" : "Photo"}</p>

        {item.media_type === "video" && <VideoShare mediaId={item.id} mediaName={item.original_name} report={report} />}

        <label className="mt-5 block">Assigned Show
          <select className="mt-2" aria-label={`Assign ${item.original_name} to a Show`} value={item.show_id || ""} onChange={event => void assign(event.target.value)}>
            <option value="">Inbox — unassigned</option>
            {shows.map(show => <option key={show.id} value={show.id}>{show.title}</option>)}
          </select>
          {item.assignment_method === "automatic" && <span className="mt-1 block text-xs text-subtle">Assigned automatically</span>}
        </label>

        {item.media_type === "video" && <div className="mt-6 border-t border-line pt-4">
          <SongMatches item={item} matches={matches} onChanged={onChanged} report={report} />
        </div>}
      </div>

      <div className="border-t border-line px-4 py-3">
        {confirming
          ? <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">This permanently deletes the {item.media_type} from your archive.</span>
              <span className="flex shrink-0 gap-2">
                <button type="button" className="btn-secondary min-h-10" onClick={() => setConfirming(false)}>Keep</button>
                <button type="button" className="btn-primary min-h-10 !bg-danger !text-white" disabled={busy} onClick={() => void remove()}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : null}Delete</button>
              </span>
            </div>
          : <button type="button" className="btn-secondary w-full !border-dangerSoft !bg-dangerSoft !text-danger" onClick={() => setConfirming(true)}><Trash2 size={16} />Delete from archive</button>}
      </div>
    </div>
  </div>;
}
