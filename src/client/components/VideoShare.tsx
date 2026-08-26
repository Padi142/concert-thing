import React, { useEffect, useState } from "react";
import { Check, Copy, Link2, Link2Off, LoaderCircle, Share2 } from "lucide-react";
import { api } from "../api";
import { copyLink } from "./ShowShare";
import type { Report, VideoShare as VideoShareState } from "../types";

type Props = { mediaId: string; report: Report };

export default function VideoShare({ mediaId, report }: Props) {
  const [share, setShare] = useState<VideoShareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setShare(null);
    setCopied(false);
    api<VideoShareState>(`/api/media/${mediaId}/share`)
      .then(value => { if (!cancelled) setShare(value); })
      .catch(error => { if (!cancelled) report((error as Error).message, true); });
    return () => { cancelled = true; };
  }, [mediaId, report]);

  async function shareLink() {
    setBusy(true);
    try {
      const next = share?.url ? share : await api<VideoShareState>(`/api/media/${mediaId}/share`, { method: "POST" });
      setShare(next);
      if (!next.url) throw new Error("Could not create the public video link");
      if (navigator.share) {
        try {
          await navigator.share({ url: next.url });
          report("Share sheet opened");
          return;
        } catch (error) {
          if ((error as DOMException).name === "AbortError") return;
        }
      }
      await copyLink(next.url);
      setCopied(true);
      report("Video link copied");
    } catch (error) {
      report((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!share?.url) return;
    try {
      await copyLink(share.url);
      setCopied(true);
      report("Video link copied");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch (error) {
      report((error as Error).message, true);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      const next = await api<VideoShareState>(`/api/media/${mediaId}/share`, { method: "DELETE" });
      setShare(next);
      setCopied(false);
      report("Video link turned off");
    } catch (error) {
      report((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  if (!share) return <div className="mt-5 flex min-h-12 items-center text-sm text-muted"><LoaderCircle size={16} className="mr-2 animate-spin" />Loading video sharing…</div>;

  return <section className="mt-5 border-l-2 border-blue py-1 pl-4">
    <div className="flex items-center gap-2"><Link2 size={17} className="text-blue" /><h2 className="font-display text-[18px]">Share this video</h2></div>
    <p className="mb-3 mt-1 max-w-xl text-sm leading-5 text-muted">The link includes a video preview and an inline player. Anyone with it can watch the video.</p>
    {share.url ? <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void shareLink()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Share2 size={16} />}Share video</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link"}</button>
        <button type="button" className="btn-quiet min-h-12 !text-danger" disabled={busy} onClick={() => void revoke()}><Link2Off size={16} />Turn off</button>
      </div>
      <a href={share.url} target="_blank" rel="noreferrer" className="mt-3 block max-w-full truncate text-xs text-subtle underline decoration-line underline-offset-4">{share.url}</a>
    </> : <button type="button" className="btn-primary" disabled={busy} onClick={() => void shareLink()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Link2 size={16} />}Create video link</button>}
  </section>;
}
