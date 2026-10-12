import React from "react";
import { Cloud, Smartphone } from "lucide-react";
import { SignInButton, SignUpButton } from "@clerk/react";
import libraryDark from "./assets/landing/library-dark.webp";
import libraryLight from "./assets/landing/library-light.webp";
import phoneLibrary from "./assets/landing/phone-library.webp";
import thumb1 from "./assets/landing/thumb-1.webp";
import thumb2 from "./assets/landing/thumb-2.webp";
import thumb3 from "./assets/landing/thumb-3.webp";
import thumb4 from "./assets/landing/thumb-4.webp";

// Store listings for the mobile apps. A platform without a link is shown as "Coming soon" instead of a dead button.
const appLinks = { ios: "", android: "" };

const recognized = [
  { file: "IMG_4810.MOV", song: "Ginseng Strip 2002", duration: "3:34", thumb: thumb1 },
  { file: "IMG_4811.MOV", song: "Forever Yung", duration: "3:07", thumb: thumb2 },
  { file: "IMG_4813.MOV", song: "Kyoto", duration: "4:11", thumb: thumb3 },
  { file: "IMG_4815.MOV", song: "", duration: "5:02", thumb: thumb4 },
];

const outcomes = [
  { title: "Sorted by show", body: "Each photo and video is matched to a show by the time it was taken. Anything that could belong to two shows waits for you to decide." },
  { title: "Named by song", body: "Every video is scanned for the songs in it. You get titles with timestamps to confirm or correct, and you can search your library by song or artist." },
  { title: "Shared by link", body: "Send one link for a whole show or a single video. Friends watch and download without an account, and you can turn the link off at any time." },
];

const journey = [
  { product: "Workers", body: "Your upload arrives in 8 MiB parts. If the connection drops, it resumes from the last part that made it." },
  { product: "R2", body: "The original file is stored privately. It never gets a public address." },
  { product: "Stream", body: "A streaming copy is made for smooth playback on any connection, behind links that expire." },
  { product: "D1", body: "The show, the songs and your storage use are recorded, so you can find a clip by what was playing." },
];

function AccountButtons({ className = "" }: { className?: string }) {
  return <div className={`flex flex-wrap gap-2 ${className}`}>
    <SignUpButton mode="redirect"><button type="button" className="btn-primary">Create account</button></SignUpButton>
    <SignInButton mode="redirect"><button type="button" className="btn-secondary">Sign in</button></SignInButton>
  </div>;
}

function StoreButton({ store, device, href }: { store: string; device: string; href: string }) {
  const label = <><Smartphone size={18} className="shrink-0" /><span className="text-left leading-tight"><span className="block">{store}</span><span className="block text-xs font-normal text-muted">{href ? device : "Coming soon"}</span></span></>;
  return href
    ? <a className="btn-secondary min-h-14 px-4" href={href}>{label}</a>
    : <span className="btn-secondary min-h-14 border-line px-4 text-muted">{label}</span>;
}

export default function Landing() {
  return <div id="top">
    <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
      <a href="#top" className="font-display text-lg tracking-tight">Concert Thing</a>
      <nav className="flex items-center gap-1 text-sm font-semibold" aria-label="Primary navigation">
        <a href="#apps" className="hidden min-h-10 items-center px-3 text-muted transition hover:text-ink sm:flex">Mobile apps</a>
        <SignInButton mode="redirect"><button type="button" className="min-h-10 px-3 text-muted transition hover:text-ink">Sign in</button></SignInButton>
        <SignUpButton mode="redirect"><button type="button" className="btn-primary ml-2 min-h-10 px-4 text-sm md:min-h-10">Create account</button></SignUpButton>
      </nav>
    </header>

    <main>
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-12 pt-10 md:grid-cols-[1.1fr_.9fr] md:pb-16 md:pt-20">
        <div>
          <h1 className="font-display text-[40px] leading-[1.04] tracking-[-0.04em] md:text-[54px]">Your concert videos, sorted by show and named by song</h1>
          <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed text-muted">Upload the clips from your phone. Concert Thing files each one under the right show, finds the songs playing in it, and gives you one link to share the night.</p>
          <AccountButtons className="mt-7" />
          <p className="mt-3 text-sm text-subtle">Every account starts with 10 GB of storage.</p>
        </div>

        <div className="rounded-panel border border-line bg-surface p-4 md:p-5" aria-label="Example: a show with its videos named by song">
          <h2 className="font-display text-lg tracking-tight">Yung Lean, Forever Yung Tour</h2>
          <p className="mt-0.5 text-sm text-muted">Forum Karlín, 9 Nov 2025</p>
          <p className="mt-3 text-xs text-subtle">Song found in each video</p>
          <ul className="mt-2 divide-y divide-line border-t border-line">
            {recognized.map(({ file, song, duration, thumb }, index) => <li key={file} className="flex items-center gap-3 py-2.5 last:pb-0">
              <img src={thumb} width={44} height={44} alt="" className="h-11 w-11 shrink-0 rounded-control object-cover" />
              <span className="relative min-w-0 flex-1">
                {song
                  ? <><span className="landing-song block truncate text-[15px] font-semibold" style={{ animationDelay: `${0.7 + index * 0.55}s` }}>{song}</span><span className="landing-listening absolute left-0 top-0 text-[15px] text-muted" style={{ animationDelay: `${0.7 + index * 0.55}s` }} aria-hidden="true">Listening for songs</span></>
                  : <span className="block text-[15px] text-muted">Listening for songs</span>}
                <span className="block font-mono text-xs text-subtle">{file}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-subtle">{duration}</span>
            </li>)}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line py-5 text-sm text-muted">
          <span className="flex items-center gap-2 font-semibold text-ink"><Cloud size={18} className="fill-cloudflare text-cloudflare" />Runs on Cloudflare</span>
          {journey.map(({ product }) => <span key={product}>{product}</span>)}
          <a href="#cloudflare" className="font-semibold text-blue sm:ml-auto">Where your clip goes</a>
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-5 py-14 md:py-20">
        <h2 className="max-w-[20ch] font-display text-[32px] leading-[1.08] tracking-[-0.03em] md:text-[40px]">From a full camera roll to a library you can search</h2>
        <div className="mt-8 grid gap-x-8 gap-y-6 md:grid-cols-3">
          {outcomes.map(({ title, body }) => <div key={title}>
            <h3 className="font-display text-xl tracking-tight">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
          </div>)}
        </div>
        <picture>
          <source srcSet={libraryDark} media="(prefers-color-scheme: dark)" />
          <img src={libraryLight} width={1800} height={964} loading="lazy" alt="The library, grouped by show, with song titles on the video tiles" className="mt-10 h-auto w-full rounded-panel border border-line" />
        </picture>
      </section>

      <section id="apps" className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-5 py-14 md:grid-cols-[1fr_auto] md:gap-16 md:py-20">
          <div>
            <h2 className="max-w-[18ch] font-display text-[32px] leading-[1.08] tracking-[-0.03em] md:text-[40px]">The phone app keeps uploading after you put it away</h2>
            <p className="mt-4 max-w-[48ch] text-[17px] leading-relaxed text-muted">Pick the night's videos once. The queue is saved on your phone, uploads carry on in the background, and anything interrupted resumes where it stopped.</p>
            <ul className="mt-5 max-w-[48ch] space-y-2 text-[15px] text-muted">
              <li className="border-l-2 border-blue pl-3">Send videos to Concert Thing from your camera roll's share menu.</li>
              <li className="border-l-2 border-blue pl-3">A video you already uploaded is caught before any data is sent.</li>
            </ul>
            <div className="mt-7 flex flex-wrap gap-2">
              <StoreButton store="App Store" device="iPhone and iPad" href={appLinks.ios} />
              <StoreButton store="Google Play" device="Android" href={appLinks.android} />
            </div>
            <p className="mt-3 text-sm text-subtle">The web app also installs to your home screen from the browser's share menu.</p>
          </div>
          <img src={phoneLibrary} width={640} height={1385} loading="lazy" alt="The library on a phone" className="mx-auto h-auto w-[250px] rounded-[34px] border-[7px] border-ink" />
        </div>
      </section>

      <section id="cloudflare" className="mx-auto max-w-5xl px-5 py-14 md:py-20">
        <p className="flex items-center gap-2 text-sm font-semibold text-cloudflareInk"><Cloud size={18} className="fill-cloudflare text-cloudflare" />Built on Cloudflare</p>
        <h2 className="mt-2 font-display text-[32px] leading-[1.08] tracking-[-0.03em] md:text-[40px]">Where your clip goes</h2>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-muted">Four Cloudflare services carry each clip from your phone to the people you share it with.</p>
        <ol className="landing-journey mt-10 grid gap-8 md:grid-cols-4 md:gap-6">
          {journey.map(({ product, body }, index) => <li key={product} className="relative pl-12 md:pl-0">
            <span className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full border border-cloudflare bg-canvas text-sm font-semibold tabular-nums md:static">{index + 1}</span>
            <h3 className="font-display text-2xl tracking-tight md:mt-4">{product}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
          </li>)}
        </ol>
        <p className="mt-10 max-w-[64ch] border-t border-line pt-5 text-sm text-subtle">Two things happen outside Cloudflare. Songs are matched by ACRCloud, which reads each video through a temporary private link, and sign-in is handled by Clerk.</p>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-5xl px-5 py-14 md:py-20">
          <h2 className="max-w-[16ch] font-display text-[32px] leading-[1.08] tracking-[-0.03em] md:text-[40px]">Start with the last show you went to</h2>
          <AccountButtons className="mt-7" />
        </div>
      </section>
    </main>

    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
        <span className="font-display text-base tracking-tight text-ink">Concert Thing</span>
        <span className="flex items-center gap-2"><Cloud size={16} className="fill-cloudflare text-cloudflare" />Built on Cloudflare Workers, R2, Stream and D1</span>
      </div>
      <p className="mx-auto max-w-5xl px-5 pb-6 text-xs text-subtle">Example photos: <a className="underline" href="https://www.flickr.com/photos/meikati/">Yung Lean at the Vogue, 31 March 2016</a>, by Kati Jenson, <a className="underline" href="https://creativecommons.org/licenses/by/2.0">CC BY 2.0</a>, cropped.</p>
    </footer>
  </div>;
}
