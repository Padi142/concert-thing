import React, { useEffect, useState } from "react";
import { Music2, ScanSearch } from "lucide-react";
import { api } from "../api";
import { formatDuration } from "../mediaMetadata";
import { recognizeStoredVideo } from "../recognition";
import type { MediaItem, RecognitionStatus, Report, SongMatch } from "../types";

type Job = { status: RecognitionStatus; attempt_count: number; last_error: string | null };

const terminal = new Set<RecognitionStatus>(["completed", "no_match", "unsupported", "budget_exhausted", "failed"]);

export default function SongMatches({ item, matches, onChanged, report }: { item: MediaItem; matches: SongMatch[]; onChanged: () => void; report: Report }) {
  const [job, setJob] = useState<Job | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  async function refreshStatus() {
    try {
      const next = await api<Job>(`/api/media/${item.id}/recognition`);
      setJob(next);
      if (next.status === "completed") onChanged();
      return next;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    void refreshStatus().then(initial => {
      if (!initial || terminal.has(initial.status)) return;
      const timer = window.setInterval(() => void refreshStatus().then(next => {
        if (cancelled || (next && terminal.has(next.status))) window.clearInterval(timer);
      }), 8_000);
      if (cancelled) window.clearInterval(timer);
    });
    return () => { cancelled = true; };
  }, [item.id, working]);

  async function recognize() {
    setWorking(true);
    try {
      const isRerun = !!job && job.status !== "failed";
      const next = await recognizeStoredVideo(item.id, item.original_name, item.content_type, setProgress, isRerun);
      setJob({ status: next.status, attempt_count: next.attempt_count, last_error: next.last_error ?? null });
      setProgress("");
      report("Recognition submitted");
    } catch (error) {
      report((error as Error).message, true);
      await refreshStatus();
    } finally {
      setWorking(false);
    }
  }

  async function review(match: SongMatch, action: "confirm" | "reject" | "edit", title?: string, artist?: string) {
    try {
      await api(`/api/song-matches/${match.id}`, { method: "PATCH", body: JSON.stringify({ action, title, artist }) });
      setEditing(null);
      onChanged();
    } catch (error) {
      report((error as Error).message, true);
    }
  }

  async function addManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api(`/api/media/${item.id}/song-matches`, { method: "POST", body: JSON.stringify({
        title: data.get("title"), artist: data.get("artist"), startMs: Number(data.get("startSeconds")) * 1000,
      }) });
      event.currentTarget.reset();
      onChanged();
    } catch (error) {
      report((error as Error).message, true);
    }
  }

  const mayRetry = job?.status === "failed" && job.attempt_count < 2;
  return <div className="border-t border-ink/20 px-2.5 py-3">
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide"><Music2 size={13}/>Song matches</span>
      <button className="text-[11px] font-bold underline disabled:opacity-40" disabled={working || (!!job && !terminal.has(job.status)) || (job?.status === "failed" && !mayRetry)} onClick={() => void recognize()}>
        {mayRetry ? "Retry once" : job?.status === "budget_exhausted" ? "Check budget" : matches.length ? "Run again" : "Recognize"}
      </button>
    </div>
    {(progress || job) && <p className="mt-2 text-[11px] text-ink/55">{progress || statusLabel(job!)}</p>}
    <div className="mt-2 space-y-2">{matches.map(match => <div key={match.id} className="border-l-2 border-ember pl-2 text-xs">
      <div className="flex justify-between gap-2"><strong>{match.title}</strong><span className="shrink-0 text-ink/45">{formatDuration(match.start_ms)}</span></div>
      <div className="text-ink/55">{match.artist}{match.confidence !== null ? ` · ${Math.round(match.confidence)}%` : ""}</div>
      {match.review_state === "pending" && editing !== match.id && <div className="mt-1.5 flex gap-3 font-bold"><button className="underline" onClick={() => void review(match, "confirm")}>Confirm</button><button className="underline" onClick={() => setEditing(match.id)}>Edit</button><button className="underline" onClick={() => void review(match, "reject")}>Reject</button></div>}
      {editing === match.id && <EditMatch match={match} onSave={(title, artist) => void review(match, "edit", title, artist)} onCancel={() => setEditing(null)} />}
      {match.review_state !== "pending" && <small className="uppercase tracking-wide text-ink/45">{match.review_state}</small>}
    </div>)}</div>
    <details className="mt-3 text-xs"><summary className="cursor-pointer font-bold"><ScanSearch className="mr-1 inline" size={13}/>Add missing song</summary>
      <form className="mt-2 grid gap-2" onSubmit={event => void addManual(event)}><input required name="title" placeholder="Song title" aria-label="Song title"/><input required name="artist" placeholder="Primary Artist" aria-label="Primary Artist"/><input required min="0" step="1" name="startSeconds" type="number" placeholder="Start, seconds" aria-label="Start time in seconds"/><button className="button min-h-10" type="submit">Add Song</button></form>
    </details>
  </div>;
}

function EditMatch({ match, onSave, onCancel }: { match: SongMatch; onSave: (title: string, artist: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(match.title);
  const [artist, setArtist] = useState(match.artist);
  return <div className="mt-2 grid gap-2"><input value={title} onChange={event => setTitle(event.target.value)}/><input value={artist} onChange={event => setArtist(event.target.value)}/><div className="flex gap-3 font-bold"><button className="underline" onClick={() => onSave(title, artist)}>Save</button><button className="underline" onClick={onCancel}>Cancel</button></div></div>;
}

function statusLabel(job: Job) {
  const labels: Record<RecognitionStatus, string> = {
    preparing: "Waiting to send video", submitted: "Recognition submitted", processing: "Recognition in progress",
    completed: "Recognition complete", no_match: "No songs matched", unsupported: "Unsupported audio",
    budget_exhausted: "Monthly recognition limit reached", failed: job.last_error || "Recognition failed",
  };
  return labels[job.status];
}
