import React, { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "./api";
import Archive from "./Archive";
import Login from "./components/Login";

function Toast({ message, error }: { message: string; error?: boolean }) {
  return <div aria-live="polite" className={`fixed inset-x-4 bottom-20 z-[60] max-w-sm border border-paper px-4 py-3 text-sm text-white transition md:inset-x-auto md:bottom-4 md:right-4 ${message ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"} ${error ? "bg-ember" : "bg-ink"}`}>{message}</div>;
}

export default function App() {
  const [session, setSession] = useState<"loading" | "in" | "out">("loading");
  const [toast, setToast] = useState({ message: "", error: false });
  const toastTimer = useRef<number | undefined>(undefined);
  function report(message: string, error = false) {
    window.clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = window.setTimeout(() => setToast({ message: "", error: false }), 3500);
  }
  useEffect(() => { api("/api/session").then(() => setSession("in")).catch(() => setSession("out")); }, []);
  if (session === "loading") return <div className="grid min-h-screen place-items-center"><LoaderCircle className="animate-spin" /></div>;
  return <>{session === "in" ? <Archive report={report} /> : <Login onLogin={() => setSession("in")} report={report} />}<Toast {...toast} /></>;
}
