import React, { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { getToken, useAuth } from "@clerk/react";
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

function fingerprintFor(file: File, ownerId: string) {
  return `concert-upload:${ownerId}:${file.name}:${file.size}:${file.lastModified}`;
}

async function clientUploadIdFor(file: File, ownerId: string): Promise<string> {
  const input = new TextEncoder().encode(`${ownerId}\0${file.name}\0${file.type}\0${file.size}\0${file.lastModified}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return `web-${[...digest].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function interruptedQueue(ownerId: string): QueueItem[] {
  const prefix = `concert-upload:${ownerId}:`;
  return Object.keys(localStorage)
    .filter(key => key.startsWith(prefix) && loadUploadState(localStorage.getItem(key)))
    .map(key => {
      const parts = key.slice(prefix.length).split(":");
      return { id: key, name: parts.slice(0, -2).join(":"), progress: 0, status: "Paused — reselect to resume", active: false, resumable: true };
    });
}

export default function Uploader({ shows, onMediaComplete, report }: { shows: Show[]; onMediaComplete: () => void; report: Report }) {
  const { userId } = useAuth();
  const ownerId = userId ?? "signed-out";
  const [queue, setQueue] = useState<QueueItem[]>(() => interruptedQueue(ownerId));
  const [uploading, setUploading] = useState(false);
  const [showId, setShowId] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const identityAbort = useRef(new AbortController());

  useEffect(() => {
    identityAbort.current.abort();
    identityAbort.current = new AbortController();
    setQueue(interruptedQueue(ownerId));
    setShowId("");
    setUploading(false);
    return () => identityAbort.current.abort();
  }, [ownerId]);

  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  function patch(id: string, values: Partial<QueueItem>) {
    setQueue(items => items.map(item => item.id === id ? { ...item, ...values } : item));
  }

  async function sendPart(url: string, chunk: Blob, signal: AbortSignal) {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const token = await getToken();
        const response = await fetch(url, {
          method: "PUT",
          body: chunk,
          signal,
          credentials: "same-origin",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
        });
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

  async function getState(file: File, contentHash: string | null, signal: AbortSignal): Promise<{ state: UploadState; fingerprint: string }> {
    const fingerprint = fingerprintFor(file, ownerId);
    const saved = loadUploadState(localStorage.getItem(fingerprint));
    if (saved) return { state: saved, fingerprint };
    const response = await api<unknown>("/api/uploads", {
      method: "POST",
      signal,
      body: JSON.stringify({ clientUploadId: await clientUploadIdFor(file, ownerId), name: file.name, type: file.type, size: file.size, ...(contentHash ? { contentHash } : {}) }),
    });
    const state = normalizeUploadState(response);
    localStorage.setItem(fingerprint, JSON.stringify(state));
    return { state, fingerprint };
  }

  async function uploadFile(file: File, queueId: string, selectedShowId: string) {
    const signal = identityAbort.current.signal;
    patch(queueId, { status: file.type.startsWith("video/") ? "Checking for duplicate" : "Starting upload" });
    const contentHash = file.type.startsWith("video/") ? await sha256File(file) : null;
    const { state, fingerprint } = await getState(file, contentHash, signal);
    patch(queueId, { status: "Reading media date" });
    const [timestamp, durationMs] = await Promise.all([mediaTimestamp(file), videoDuration(file)]);
    await api(`/api/uploads/${state.mediaId}`, {
      method: "PATCH",
      signal,
      body: JSON.stringify({ ...timestamp, durationMs, showId: selectedShowId || null }),
    });

    const totalParts = Math.ceil(file.size / state.chunkSize);
    for (let index = 0; index < totalParts; index++) {
      const partNumber = index + 1;
      if (!state.completed.some(part => part.partNumber === partNumber)) {
        patch(queueId, { status: `Part ${partNumber} of ${totalParts}` });
        const chunk = file.slice(index * state.chunkSize, Math.min(file.size, (index + 1) * state.chunkSize));
        const part = await sendPart(`/api/uploads/${state.mediaId}/parts/${partNumber}`, chunk, signal);
        state.completed.push(part);
        localStorage.setItem(fingerprint, JSON.stringify(state));
      }
      patch(queueId, { progress: Math.round(partNumber / totalParts * 100) });
    }

    patch(queueId, { status: "Finishing" });
    const completed = await api<Completion>(`/api/uploads/${state.mediaId}/complete`, {
      method: "POST",
      signal,
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

    const entries = uniqueFiles.map(file => ({ file, queueId: fingerprintFor(file, ownerId) }));
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
    <label className={`flex min-h-44 flex-col items-start justify-between rounded-panel border p-5 transition md:min-h-48 md:p-6 ${uploading ? "cursor-wait opacity-60" : "cursor-pointer border-control bg-accentSoft active:opacity-80"}`}>
      <input ref={input} className="hidden" type="file" accept="image/*,video/*" multiple disabled={uploading} onChange={event => void selected(event.target.files)} />
      <span className="grid h-12 w-12 place-items-center rounded-control bg-blue text-accentInk"><ImagePlus size={22} /></span>
      <span><strong className="block font-display text-2xl leading-tight">{uploading ? "Uploading" : "Choose photos or videos"}</strong><small className="mt-2 block max-w-lg text-sm text-muted">Completed items appear in your Library immediately. Interrupted files resume when reselected.</small></span>
    </label>

    <label className="mt-4 block">Assign uploads to
      <select className="mt-2" value={showId} disabled={uploading} onChange={event => setShowId(event.target.value)}>
        <option value="">Automatically from file date</option>
        {shows.map(show => <option key={show.id} value={show.id}>{show.title}</option>)}
      </select>
    </label>

    {queue.length > 0 && <div className="mt-5 border-t border-line">{queue.map(item => <div key={item.id} className="border-b border-line py-4 text-sm">
      <div className="flex items-baseline justify-between gap-3"><strong className="truncate font-semibold">{item.name}</strong><span className="shrink-0 tabular-nums text-muted">{item.progress}%</span></div>
      <div className="mt-0.5 flex items-center justify-between gap-3"><small className="text-muted">{item.status}</small>{item.resumable && !item.active && <button type="button" className="btn-quiet -mr-3 min-h-9 shrink-0" onClick={() => void cancel(item)}>Cancel</button>}</div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-line"><div className={`h-full transition-all ${item.active ? "bg-blue" : "bg-subtle"}`} style={{ width: `${item.progress}%` }} /></div>
    </div>)}</div>}
  </>;
}
