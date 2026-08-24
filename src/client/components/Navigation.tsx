import React from "react";
import { CalendarDays, Inbox, Images, UploadCloud } from "lucide-react";
import { UserButton } from "@clerk/react";

export type ViewName = "library" | "inbox" | "shows" | "queue";

const tabs: { name: ViewName; label: string; icon: typeof Images }[] = [
  { name: "library", label: "Library", icon: Images },
  { name: "inbox", label: "Inbox", icon: Inbox },
  { name: "shows", label: "Shows", icon: CalendarDays },
  { name: "queue", label: "Queue", icon: UploadCloud },
];

export default function Navigation({ active, onNavigate, inboxCount }: { active: ViewName; onNavigate: (view: ViewName) => void; inboxCount: number }) {
  return <>
    <header className="sticky top-0 z-40 hidden border-b border-line bg-canvas md:block">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <a href="#top" onClick={event => { event.preventDefault(); onNavigate("library"); }} className="font-display text-lg tracking-tight">Concert Archive</a>
        <nav className="flex items-center gap-1 text-sm font-semibold" aria-label="Primary navigation">
          {tabs.map(({ name, label, icon: Icon }) => <button key={name} type="button" onClick={() => onNavigate(name)} aria-current={active === name ? "page" : undefined} className={`flex min-h-10 items-center gap-2 rounded-control px-3 transition ${active === name ? "bg-accentSoft text-blue" : "text-muted hover:text-ink"}`}>
            <Icon size={16} />{label}{name === "inbox" && inboxCount > 0 ? ` · ${inboxCount}` : ""}
          </button>)}
          <div className="ml-3 border-l border-line pl-4"><UserButton /></div>
        </nav>
      </div>
    </header>

    <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map(({ name, label, icon: Icon }) => <button key={name} type="button" onClick={() => onNavigate(name)} aria-current={active === name ? "page" : undefined} className={`relative flex min-h-[68px] flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active === name ? "text-blue" : "text-subtle"}`}>
        <Icon size={21} strokeWidth={active === name ? 2.3 : 2} />
        {label}
        {name === "inbox" && inboxCount > 0 && <span className="absolute right-[22%] top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-accentInk">{inboxCount}</span>}
      </button>)}
    </nav>
    <div className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-50 md:hidden"><UserButton /></div>
  </>;
}
