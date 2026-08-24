import React, { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { ClerkFailed, ClerkLoaded, ClerkLoading, Show, SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { api } from "./api";
import Archive from "./Archive";
import PublicShow from "./PublicShow";

function Toast({ message, error }: { message: string; error?: boolean }) {
  return <div aria-live="polite" className={`fixed inset-x-4 bottom-24 z-[60] max-w-sm rounded-control border border-line bg-surface px-4 py-3 text-sm text-ink shadow-lg transition md:inset-x-auto md:bottom-6 md:right-6 ${message ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"} ${error ? "border-l-2 border-l-danger" : "border-l-2 border-l-success"}`}>{message}</div>;
}

function SignedInArchive({ report }: { report: (message: string, error?: boolean) => void }) {
  const { userId } = useAuth();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!userId) return;
    setReady(false);
    setError("");
    api("/api/account/claim-legacy", { method: "POST" })
      .then(() => setReady(true))
      .catch(cause => setError(cause instanceof Error ? cause.message : "Could not prepare your archive"));
  }, [userId]);
  if (error) return <main className="mx-auto grid min-h-screen max-w-md place-items-center px-5 text-center"><div><h1 className="font-display text-2xl">Could not open your archive</h1><p className="mt-3 text-muted">{error}</p></div></main>;
  if (!ready) return <div className="grid min-h-screen place-items-center"><LoaderCircle className="animate-spin text-blue" /></div>;
  return <Archive key={userId} report={report} />;
}

function Welcome() {
  return <main className="mx-auto flex min-h-[100dvh] max-w-lg items-center px-5">
    <section className="w-full py-10">
      <div className="eyebrow">Concert archive</div>
      <h1 className="mt-2 font-display text-[42px] leading-[1.05]">Keep the moments that made the night.</h1>
      <p className="mt-5 max-w-md text-[17px] leading-7 text-muted">A private home for your concert photos, videos, shows, and recognized songs.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <SignUpButton mode="redirect"><button type="button" className="btn-primary min-w-36">Create account</button></SignUpButton>
        <SignInButton mode="redirect"><button type="button" className="btn-secondary min-w-36">Sign in</button></SignInButton>
      </div>
    </section>
  </main>;
}

export default function App() {
  const publicToken = /^\/share\/((?:[A-Za-z0-9]{6}|[a-f0-9]{64}))\/?$/.exec(window.location.pathname)?.[1];
  const [toast, setToast] = useState({ message: "", error: false });
  const toastTimer = useRef<number | undefined>(undefined);
  const report = useCallback((message: string, error = false) => {
    window.clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = window.setTimeout(() => setToast({ message: "", error: false }), 3500);
  }, []);
  if (publicToken) return <PublicShow token={publicToken} />;
  return <>
    <ClerkLoading><div className="grid min-h-screen place-items-center"><LoaderCircle className="animate-spin text-blue" /></div></ClerkLoading>
    <ClerkFailed><main className="grid min-h-screen place-items-center px-5 text-center"><p>Authentication is temporarily unavailable.</p></main></ClerkFailed>
    <ClerkLoaded>
      <Show when="signed-out"><Welcome /></Show>
      <Show when="signed-in"><SignedInArchive report={report} /></Show>
    </ClerkLoaded>
    <Toast {...toast} />
  </>;
}
