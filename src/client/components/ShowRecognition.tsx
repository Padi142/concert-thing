import React, { useState } from "react";
import { LoaderCircle, Music2 } from "lucide-react";
import { recognizeStoredVideo, waitForRecognition } from "../recognition";
import type { MediaItem, Report } from "../types";

type Props = {
  videos: MediaItem[];
  onChanged: () => void;
  report: Report;
};

export default function ShowRecognition({ videos, onChanged, report }: Props) {
  const [scanning, setScanning] = useState(false);
  const [submitted, setSubmitted] = useState(0);
  const [failed, setFailed] = useState(0);

  async function rescan() {
    if (!videos.length || scanning) return;
    const noun = videos.length === 1 ? "video" : "videos";
    if (!window.confirm(`Scan ${videos.length} ${noun} again? Existing confirmed, edited, and manually added songs will be preserved.`)) return;

    setScanning(true);
    setSubmitted(0);
    setFailed(0);
    const started: string[] = [];
    let failures = 0;
    for (const video of videos) {
      try {
        await recognizeStoredVideo(video.id, video.original_name, video.content_type, undefined, true);
        started.push(video.id);
        setSubmitted(started.length);
      } catch {
        failures += 1;
        setFailed(failures);
      }
    }
    setScanning(false);
    report(failures ? `${started.length} scans submitted · ${failures} failed to start` : `Recognition submitted for ${started.length} ${started.length === 1 ? "video" : "videos"}`, failures > 0);

    // Status reads collect provider results and persist recognized songs. This
    // promise intentionally outlives this view if the owner navigates elsewhere.
    void Promise.allSettled(started.map(waitForRecognition)).then(onChanged);
  }

  if (!videos.length) return null;
  const progress = scanning ? `${submitted + failed} of ${videos.length} submitted` : null;
  return <section className="mt-6 border-l-2 border-blue py-1 pl-4">
    <div className="flex items-center gap-2"><Music2 size={17} className="text-blue" /><h2 className="font-display text-[18px]">Song recognition</h2></div>
    <p className="mb-3 mt-1 max-w-xl text-sm leading-5 text-muted">Rescan all {videos.length} ready {videos.length === 1 ? "video" : "videos"} in this Show. Confirmed, edited, and manually added songs stay unchanged.</p>
    <button type="button" className="btn-secondary" disabled={scanning} onClick={() => void rescan()}>
      {scanning ? <LoaderCircle size={16} className="animate-spin" /> : <Music2 size={16} />}
      {scanning ? "Submitting scans…" : "Scan all videos again"}
    </button>
    {progress ? <p aria-live="polite" className="mt-2 text-[13px] text-muted">{progress}</p> : null}
  </section>;
}
