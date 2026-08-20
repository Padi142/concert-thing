import React from "react";
import { ImagePlus, Inbox, Library, Music2 } from "lucide-react";

const links = [
  { href: "#library", label: "Library", icon: Library },
  { href: "#inbox", label: "Inbox", icon: Inbox },
  { href: "#shows", label: "Shows", icon: Music2 },
  { href: "#upload", label: "Upload", icon: ImagePlus, primary: true },
];

export default function Navigation({ inboxCount }: { inboxCount: number }) {
  return <>
    <header className="border-b border-ink bg-paper px-5 md:sticky md:top-0 md:z-40">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between">
        <a href="#library" className="font-bold tracking-[.08em]">ARCHIVE</a>
        <nav className="hidden items-center gap-8 text-xs font-bold md:flex" aria-label="Primary navigation">
          {links.map(({ href, label, primary }) => <a key={href} href={href} className={primary ? "bg-acid px-4 py-3" : "py-3 hover:underline"}>{label}{label === "Inbox" && inboxCount > 0 ? ` · ${inboxCount}` : ""}</a>)}
        </nav>
        <span className="text-xs font-bold text-ink/45 md:hidden">{inboxCount} inbox</span>
      </div>
    </header>

    <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-ink bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
      {links.map(({ href, label, icon: Icon, primary }) => <a key={href} href={href} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-bold ${primary ? "bg-acid" : ""}`}>
        <Icon size={20} strokeWidth={2.2} />{label}
        {label === "Inbox" && inboxCount > 0 && <span className="absolute right-[24%] top-2 grid h-4 min-w-4 place-items-center bg-ember px-1 text-[9px] text-white">{inboxCount}</span>}
      </a>)}
    </nav>
  </>;
}
