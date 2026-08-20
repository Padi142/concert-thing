import React, { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { ApiError, api } from "../api";
import { sha256File } from "../mediaHash";
import { loadUploadState, normalizeUploadState } from "../uploadState";
import { videoDuration } from "../mediaMetadata";
import { mediaTimestamp } from "../mediaTimestamp";
import { recognizeVideo } from "../recognition";
import type { Report, Show, UploadState } from "../types";

type QueueItem = {
  id: string;
  name: string;
  progress: number;
  status: string;
  active: boolean;
  resumable: boolean;
};

type Completion = {
  assignment: { showId: string; method: "automatic" | "owner" } | null;
};

function fingerprintFor(file: File) {
  return `concert-upload:${file.name}:${file.size}:${file.lastModified}`;
}

function interruptedQueue(): QueueItem[] {
  return Object.keys(localStorage)
    .filter(key => key.startsWith("concert-upload:") && loadUploadState(localStorage.getItem(key)))
    .map(key => {
      const parts = key.slice("concert-upload:".length).split(":");
      return { id: key, name: parts.slice(0, -2).join(":"), progress: 0, status: "Paused — reselect to resume", active: false, resumable: true };
    });
}

export default function Uploader({ shows, onMediaComplete, report }: { shows: Show[]; onMediaComplete: () => void; report: Report }) {
  const [queue, setQueue] = useState<QueueItem[]>(interruptedQueue);
  const [uploading, setUploading] = useState(false);
  const [showId, setShowId] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  function patch(id: string, values: Partial<QueueItem>) {
    setQueue(items => items.map(item => item.id === id ? { ...item, ...values } : item));
  }

  async function sendPart(url: string, chunk: Blob) {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { method: "PUT", body: chunk, credentials: "same-origin" });
        const value = await response.json() as { partNumber?: number; etag?: string; error?: string };
        if (!response.ok) throw new Error(value.error || "Part upload failed");
        return value as { partNumber: number; etag: string };
      } catch (error) {
        lastError = error as Error;
        await new Promise(resolve => setTimeout(resolve, 700 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  async function getState(file: File, contentHash: string | null): Promise<{ state: UploadState; fingerprint: string }> {
    const fingerprint = fingerprintFor(file);
    const saved = loadUploadState(localStorage.getItem(fingerprint));
    if (saved) return { state: saved, fingerprint };
    const response = await api<unknown>("/api/uploads", {
      method: "POST",
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size, ...(contentHash ? { contentHash } : {}) }),
    });
    const state = normalizeUploadState(response);
    localStorage.setItem(fingerprint, JSON.stringify(state));
    return { state, fingerprint };
  }

  async function uploadFile(file: File, queueId: string, selectedShowId: string) {
    patch(queueId, { status: file.type.startsWith("video/") ? "Checking for duplicate" : "Starting upload" });
    const contentHash = file.type.startsWith("video/") ? await sha256File(file) : null;
    const { state, fingerprint } = await getState(file, contentHash);
    patch(queueId, { status: "Reading media date" });
    const [timestamp, durationMs] = await Promise.all([mediaTimestamp(file), videoDuration(file)]);
    await api(`/api/uploads/${state.mediaId}`, {
      method: "PATCH",
      body: JSON.stringify({ ...timestamp, durationMs, showId: selectedShowId || null }),
    });

    const totalParts = Math.ceil(file.size / state.chunkSize);
    for (let index = 0; index < totalParts; index++) {
      const partNumber = index + 1;
      if (!state.completed.some(part => part.partNumber === partNumber)) {
        patch(queueId, { status: `Part ${partNumber} of ${totalParts}` });
        const chunk = file.slice(index * state.chunkSize, Math.min(file.size, (index + 1) * state.chunkSize));
        const part = await sendPart(`/api/uploads/${state.mediaId}/parts/${partNumber}`, chunk);
        state.completed.push(part);
        localStorage.setItem(fingerprint, JSON.stringify(state));
      }
      patch(queueId, { progress: Math.round(partNumber / totalParts * 100) });
    }

    patch(queueId, { status: "Finishing" });
    const completed = await api<Completion>(`/api/uploads/${state.mediaId}/complete`, {
      method: "POST",
      body: JSON.stringify({ parts: state.completed }),
    });
    localStorage.removeItem(fingerprint);
    const status = completed.assignment?.method === "automatic"
      ? "Assigned automatically"
      : completed.assignment ? "Assigned" : "In Inbox";
    patch(queueId, { progress: 100, status, active: false, resumable: false });
    onMediaComplete();
    if (file.type.startsWith("video/")) {
      patch(queueId, { status: "Uploaded · preparing recognition", active: true });
      void recognizeVideo(state.mediaId, file, message => patch(queueId, { status: `Uploaded · ${message}` }))
        .then(recognition => {
          const recognitionStatus = recognition.status === "budget_exhausted" ? "recognition budget exhausted" : "recognition submitted";
          patch(queueId, { status: `Uploaded · ${recognitionStatus}`, active: false });
        })
        .catch(error => {
          patch(queueId, { status: "Uploaded · recognition failed", active: false });
          report(`${file.name}: ${(error as Error).message}`, true);
        });
    }
  }

  async function cancel(item: QueueItem) {
    const state = loadUploadState(localStorage.getItem(item.id));
    try {
      if (state) await api(`/api/uploads/${state.mediaId}`, { method: "DELETE" });
    } catch (error) {
      report((error as Error).message, true);
      return;
    }
    localStorage.removeItem(item.id);
    setQueue(items => items.filter(candidate => candidate.id !== item.id));
  }

  async function selected(files: FileList | null) {
    if (!files?.length || uploading) return;
    const uniqueFiles = [...new Map([...files]
      .filter(file => file.type.startsWith("image/") || file.type.startsWith("video/"))
      .map(file => [`${file.name}:${file.size}:${file.lastModified}`, file])).values()];
    if (!uniqueFiles.length) {
      report("Choose photos or videos", true);
      return;
    }

    const entries = uniqueFiles.map(file => ({ file, queueId: fingerprintFor(file) }));
    setQueue(items => {
      const resumedIds = new Set(entries.map(entry => entry.queueId));
      const activeItems = entries.map(({ file, queueId }) => ({ id: queueId, name: file.name, progress: 0, status: "Waiting", active: true, resumable: true }));
      return [...activeItems, ...items.filter(item => !resumedIds.has(item.id))];
    });
    setUploading(true);

    let wakeLock: { release(): Promise<void> } | undefined;
    try {
      wakeLock = await (navigator as Navigator & { wakeLock?: { request(): Promise<{ release(): Promise<void> }> } }).wakeLock?.request();
    } catch { /* Wake Lock is optional. */ }

    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < entries.length) {
        const entry = entries[nextIndex++];
        try {
          await uploadFile(entry.file, entry.queueId, showId);
        } catch (error) {
          if (error instanceof ApiError && error.status === 409 && error.data.duplicate === true) {
            patch(entry.queueId, { status: "Duplicate — not uploaded", active: false, resumable: false });
            report(`${entry.file.name}: Duplicate video — not uploaded`, true);
          } else {
            patch(entry.queueId, { status: "Paused — reselect to resume", active: false, resumable: true });
            report(`${entry.file.name}: ${(error as Error).message}`, true);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, entries.length) }, worker));
    await wakeLock?.release();
    if (input.current) input.current.value = "";
    setUploading(false);
  }

  return <>
    <label className={`group flex min-h-48 flex-col items-start justify-between border border-ink p-5 text-left transition md:min-h-56 md:p-7 ${uploading ? "cursor-wait bg-ink/10" : "cursor-pointer bg-acid active:bg-acid/70"}`}>
      <input ref={input} className="hidden" type="file" accept="image/*,video/*" multiple disabled={uploading} onChange={event => void selected(event.target.files)} />
      <ImagePlus size={34} strokeWidth={1.8} />
      <span><strong className="block text-2xl leading-tight tracking-tight md:text-3xl">{uploading ? "Uploading" : "Choose photos or videos"}</strong><small className="mt-2 block max-w-lg text-sm text-ink/65">Completed items appear immediately. Interrupted files resume when reselected.</small></span>
    </label>

    <label className="mt-3 block">Assign uploads
      <select value={showId} disabled={uploading} onChange={event => setShowId(event.target.value)}>
        <option value="">Automatically from file date</option>
        {shows.map(show => <option key={show.id} value={show.id}>{show.title}</option>)}
      </select>
    </label>

    {queue.length > 0 && <div className="mt-4 border-t border-ink">{queue.map(item => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-1 border-b border-ink/25 py-4 text-sm">
      <strong className="truncate">{item.name}</strong><span className="font-bold">{item.progress}%</span>
      <small className="text-ink/50">{item.status}</small>{item.resumable && !item.active && <button className="justify-self-end text-xs font-bold underline" onClick={() => void cancel(item)}>Cancel</button>}
      <div className="col-span-2 mt-2 h-1 bg-ink/10"><div className={`h-full transition-all ${item.active ? "bg-ember" : "bg-ink"}`} style={{ width: `${item.progress}%` }} /></div>
    </div>)}</div>}
  </>;
}
