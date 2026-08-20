import React, { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "../api";
import type { Report } from "../types";
export default function Login({ onLogin, report }: { onLogin: () => void; report: Report }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    try { await api("/api/session", { method: "POST", body: JSON.stringify({ token: form.get("token") }) }); onLogin(); }
    catch (error) { report((error as Error).message, true); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-[100dvh] max-w-md items-center px-5"><section className="w-full border-t border-ink py-6">
    <div className="mb-8 text-sm font-bold tracking-[.08em]">ARCHIVE</div>
    <form onSubmit={submit} className="grid gap-4"><label>Owner token<input name="token" type="password" autoComplete="current-password" required autoFocus /></label><button className="button w-full" disabled={busy}>{busy && <LoaderCircle size={15} className="animate-spin" />}Open</button></form>
  </section></main>;
}
