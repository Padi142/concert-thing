import React, { useEffect, useState } from "react";
import { AlertCircle, Music2, ScanSearch } from "lucide-react";
import { api } from "../api";
import { formatDuration } from "../mediaDisplay";
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

  const visibleMatches = matches.filter(match => match.review_state !== "rejected");
  const mayRetry = job?.status === "failed" && job.attempt_count < 2;
  const showManual = visibleMatches.length === 0 && !!job && ["failed", "no_match", "unsupported"].includes(job.status);
  const recognitionNote = job?.status === "failed"
    ? "Automatic recognition failed. The video is safe; you can retry or add its song manually."
    : job?.status === "no_match"
      ? "No song was recognized automatically."
      : job?.status === "unsupported"
        ? "Automatic recognition could not read this video's audio."
        : null;
  return <div>
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[.11em] text-muted"><Music2 size={14} />{visibleMatches.length ? `Songs in this video (${visibleMatches.length})` : "Songs in this video"}</span>
      <button type="button" className="btn-quiet min-h-10 !px-2" disabled={working || (!!job && !terminal.has(job.status)) || (job?.status === "failed" && !mayRetry)} onClick={() => void recognize()}>
        {mayRetry ? "Retry once" : visibleMatches.length ? "Find songs again" : job ? "Try again" : "Find songs"}
      </button>
    </div>
    {recognitionNote && <div className="mt-2 border-l-2 border-danger py-2 pl-3 text-sm leading-snug text-danger"><AlertCircle className="mb-1" size={14} /><span>{recognitionNote}</span></div>}
    {(progress || (job && !recognitionNote)) && <p className="mt-2 text-[13px] text-muted">{progress || statusLabel(job!)}</p>}
    <div className="mt-3 space-y-3">{visibleMatches.map(match => <div key={match.id} className="border-l-2 border-blue pl-3 text-sm">
      <div className="flex justify-between gap-2"><strong>{match.title}</strong><span className="shrink-0 text-subtle">{formatDuration(match.start_ms)}</span></div>
      <div className="text-muted">{match.artist}{match.confidence !== null ? ` · ${Math.round(match.confidence)}% confidence` : ""}</div>
      {match.review_state === "pending" && editing !== match.id && <div className="mt-1.5 flex gap-1 font-semibold text-blue">
        <button type="button" className="btn-quiet -ml-3 min-h-9" onClick={() => void review(match, "confirm")}>Confirm</button>
        <button type="button" className="btn-quiet min-h-9" onClick={() => setEditing(match.id)}>Edit</button>
        <button type="button" className="btn-quiet min-h-9 !text-muted" onClick={() => void review(match, "reject")}>Dismiss</button>
      </div>}
      {editing === match.id && <EditMatch match={match} onSave={(title, artist) => void review(match, "edit", title, artist)} onCancel={() => setEditing(null)} />}
      {match.review_state !== "pending" && <small className="uppercase tracking-wide text-subtle">{match.review_state}</small>}
    </div>)}</div>
    {showManual && <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-blue"><ScanSearch className="mr-1 inline" size={14} />Add a song manually</summary>
      <form className="mt-3 grid gap-3" onSubmit={event => void addManual(event)}>
        <label>Song title<input required name="title" placeholder="Song title" /></label>
        <label>Primary Artist<input required name="artist" placeholder="Primary Artist" /></label>
        <label>Start time in seconds<input required min="0" step="1" name="startSeconds" type="number" placeholder="Start, seconds" /></label>
        <button className="btn-primary" type="submit">Add Song</button>
      </form>
    </details>}
  </div>;
}

function EditMatch({ match, onSave, onCancel }: { match: SongMatch; onSave: (title: string, artist: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(match.title);
  const [artist, setArtist] = useState(match.artist);
  return <div className="mt-2 grid gap-2"><input value={title} onChange={event => setTitle(event.target.value)} aria-label="Song title"/><input value={artist} onChange={event => setArtist(event.target.value)} aria-label="Primary Artist"/><div className="flex gap-1 font-semibold text-blue"><button type="button" className="btn-quiet -ml-3 min-h-9" onClick={() => onSave(title, artist)}>Save</button><button type="button" className="btn-quiet min-h-9 !text-muted" onClick={onCancel}>Cancel</button></div></div>;
}

function statusLabel(job: Job) {
  const labels: Record<RecognitionStatus, string> = {
    preparing: "Preparing recognition", submitted: "Recognition submitted", processing: "Recognition in progress",
    completed: "Recognition complete", no_match: "No songs matched", unsupported: "Unsupported audio",
    budget_exhausted: "Monthly recognition limit reached", failed: job.last_error || "Recognition failed",
  };
  return labels[job.status];
}
