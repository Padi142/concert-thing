import React, { ChangeEvent, FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "../api";
import type { Report } from "../types";
export default function ShowForm({ onCreated, onCancel, report }: { onCreated: () => void; onCancel: () => void; report: Report }) {
  const [busy, setBusy] = useState(false);
  function defaultEnd(event: ChangeEvent<HTMLInputElement>) {
    const end = event.currentTarget.form?.elements.namedItem("endsAt") as HTMLInputElement | null;
    if (!event.currentTarget.value || !end || end.value) return;
    const value = new Date(event.currentTarget.value);
    value.setHours(value.getHours() + 4);
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    end.value = local;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    const starts = String(data.get("startsAt")); const ends = String(data.get("endsAt"));
    const payload = { title: data.get("title"), venue: data.get("venue"), locality: data.get("locality"), artists: String(data.get("artists") || "").split(",").map(x => x.trim()).filter(Boolean), startsAt: new Date(starts).toISOString(), endsAt: ends ? new Date(ends).toISOString() : null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    try { await api("/api/shows", { method: "POST", body: JSON.stringify(payload) }); report("Show created"); onCreated(); }
    catch (error) { report((error as Error).message, true); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="grid gap-4 rounded-panel border border-line bg-surface p-5 md:grid-cols-2">
    <label>Show name<input className="mt-2" name="title" placeholder="The Eras Tour" required /></label>
    <label>Artists<input className="mt-2" name="artists" placeholder="Artist One, Artist Two" /></label>
    <label>Venue<input className="mt-2" name="venue" placeholder="Venue" required /></label>
    <label>City / locality<input className="mt-2" name="locality" placeholder="London" /></label>
    <label>Starts<input className="mt-2" name="startsAt" type="datetime-local" required onChange={defaultEnd} /></label>
    <label>Ends<input className="mt-2" name="endsAt" type="datetime-local" required /></label>
    <div className="flex justify-end gap-2 md:col-span-2"><button type="button" onClick={onCancel} className="btn-secondary">Cancel</button><button disabled={busy} className="btn-primary">{busy && <LoaderCircle size={14} className="animate-spin" />}Create Show</button></div>
  </form>;
}
