// Vite middleware serving a fixed demo archive for README screenshots.
import type { Plugin } from "vite";

type Show = { id: string; title: string; venue: string; locality: string; starts_at: string; ends_at: string | null; timezone: string; artists: string[] };

const shows: Show[] = [
  { id: "s1", title: "Fontaines D.C. — Romance Tour", venue: "Forum Karlín", locality: "Prague", starts_at: "2025-11-14T20:00:00+01:00", ends_at: "2025-11-14T22:30:00+01:00", timezone: "Europe/Prague", artists: ["Fontaines D.C.", "Kneecap"] },
  { id: "s2", title: "IDLES at Lucerna", venue: "Lucerna Great Hall", locality: "Prague", starts_at: "2025-09-03T19:30:00+02:00", ends_at: "2025-09-03T22:00:00+02:00", timezone: "Europe/Prague", artists: ["IDLES", "Lambrini Girls"] },
  { id: "s3", title: "Rock for People 2025", venue: "Festivalpark", locality: "Hradec Králové", starts_at: "2025-06-12T14:00:00+02:00", ends_at: "2025-06-12T23:59:00+02:00", timezone: "Europe/Prague", artists: ["Turnstile", "Wet Leg", "Bring Me The Horizon"] },
  { id: "s4", title: "Wet Leg — Moisturizer Tour", venue: "Roxy", locality: "Prague", starts_at: "2025-03-21T20:00:00+01:00", ends_at: null, timezone: "Europe/Prague", artists: ["Wet Leg"] },
];

type Media = { id: string; show: string | null; type: "photo" | "video"; duration?: number; hue: number; size: number };
const mediaSeed: Media[] = [
  { id: "m01", show: "s1", type: "video", duration: 214_000, hue: 210, size: 412 },
  { id: "m02", show: "s1", type: "video", duration: 187_000, hue: 330, size: 356 },
  { id: "m03", show: "s1", type: "photo", hue: 20, size: 6 },
  { id: "m04", show: "s1", type: "video", duration: 251_000, hue: 270, size: 498 },
  { id: "m05", show: "s1", type: "photo", hue: 190, size: 5 },
  { id: "m06", show: "s1", type: "video", duration: 96_000, hue: 0, size: 171 },
  { id: "m07", show: "s1", type: "photo", hue: 45, size: 7 },
  { id: "m08", show: "s1", type: "video", duration: 302_000, hue: 160, size: 590 },
  { id: "m09", show: "s1", type: "video", duration: 143_000, hue: 300, size: 260 },
  { id: "m10", show: "s1", type: "photo", hue: 230, size: 6 },
  { id: "m11", show: "s2", type: "video", duration: 176_000, hue: 350, size: 322 },
  { id: "m12", show: "s2", type: "video", duration: 228_000, hue: 15, size: 431 },
  { id: "m13", show: "s2", type: "photo", hue: 200, size: 5 },
  { id: "m14", show: "s2", type: "video", duration: 119_000, hue: 280, size: 208 },
  { id: "m15", show: "s2", type: "photo", hue: 40, size: 6 },
  { id: "m16", show: "s3", type: "video", duration: 265_000, hue: 120, size: 512 },
  { id: "m17", show: "s3", type: "photo", hue: 30, size: 8 },
  { id: "m18", show: "s3", type: "video", duration: 198_000, hue: 260, size: 377 },
  { id: "m19", show: "s3", type: "video", duration: 157_000, hue: 185, size: 295 },
  { id: "m20", show: "s3", type: "photo", hue: 320, size: 7 },
  { id: "m21", show: null, type: "video", duration: 88_000, hue: 220, size: 162 },
  { id: "m22", show: null, type: "video", duration: 132_000, hue: 10, size: 241 },
  { id: "m23", show: null, type: "video", duration: 61_000, hue: 290, size: 118 },
];

const songs: Record<string, [string, string, number, number | null, string][]> = {
  m01: [["Starburster", "Fontaines D.C.", 4_000, 97, "confirmed"], ["Here's the Thing", "Fontaines D.C.", 168_000, 91, "pending"]],
  m02: [["Favourite", "Fontaines D.C.", 0, 98, "confirmed"]],
  m04: [["In the Modern World", "Fontaines D.C.", 12_000, 94, "confirmed"]],
  m06: [["Boys in the Better Land", "Fontaines D.C.", 0, 88, "pending"]],
  m08: [["Jackie Down the Line", "Fontaines D.C.", 21_000, 96, "confirmed"]],
  m09: [["Romance", "Fontaines D.C.", 0, 92, "confirmed"]],
  m11: [["Never Fight a Man with a Perm", "IDLES", 2_000, 95, "confirmed"]],
  m12: [["Grace", "IDLES", 8_000, 93, "confirmed"]],
  m14: [["Danny Nedelko", "IDLES", 0, 99, "confirmed"]],
  m16: [["Never Enough", "Turnstile", 15_000, 90, "confirmed"]],
  m18: [["Chaise Longue", "Wet Leg", 3_000, 97, "confirmed"]],
  m19: [["Throne", "Bring Me The Horizon", 0, 89, "pending"]],
};

const names = (item: Media, index: number) => item.type === "video" ? `IMG_${4810 + index * 7}.MOV` : `IMG_${4810 + index * 7}.HEIC`;

const media = mediaSeed.map((item, index) => {
  const show = shows.find(candidate => candidate.id === item.show);
  const start = new Date(show?.starts_at ?? "2025-10-02T21:10:00+02:00").getTime();
  return {
    id: item.id,
    original_name: names(item, index),
    media_type: item.type,
    content_type: item.type === "video" ? "video/quicktime" : "image/heic",
    byte_size: item.size * 1024 * 1024,
    duration_ms: item.duration ?? null,
    captured_at: new Date(start + (index % 10) * 9 * 60_000 + 35 * 60_000).toISOString(),
    status: "ready",
    show_id: show?.id ?? null,
    show_title: show?.title ?? null,
    assignment_method: show ? (index % 3 ? "automatic" : "owner") : null,
    created_at: "2025-11-15T09:00:00Z",
  };
});

const matches = Object.entries(songs).flatMap(([mediaId, list]) => list.map(([title, artist, start, confidence, state], index) => ({
  id: `${mediaId}-song-${index}`, media_id: mediaId, start_ms: start, end_ms: null, confidence,
  candidate_title: title, candidate_artist: artist, review_state: state, song_id: null, title, artist,
})));

/** Procedural stage-light artwork standing in for real concert photos. */
function stageArt(hue: number, seed: number, width = 1280, height = 960, play = false): string {
  const random = (n: number) => { const x = Math.sin(seed * 97.13 + n * 13.7) * 43758.5453; return x - Math.floor(x); };
  const beams = Array.from({ length: 5 }, (_, i) => {
    const x = width * (0.12 + i * 0.19 + (random(i) - 0.5) * 0.08);
    const spread = width * (0.12 + random(i + 9) * 0.12);
    const beamHue = (hue + (i % 2 ? 40 : -25) + random(i + 3) * 30) % 360;
    return `<polygon points="${x - 8},0 ${x + 8},0 ${x + spread},${height} ${x - spread},${height}" fill="hsla(${beamHue},95%,65%,${0.16 + random(i + 5) * 0.16})" filter="url(#b)"/>`;
  }).join("");
  const crowd = Array.from({ length: 34 }, (_, i) => {
    const cx = (i / 33) * width + (random(i + 20) - 0.5) * 40;
    const cy = height * (0.86 + random(i + 40) * 0.06);
    const r = width * (0.028 + random(i + 60) * 0.018);
    const arm = random(i + 80) > 0.82 ? `<rect x="${cx - 6}" y="${cy - r * 4.2}" width="12" height="${r * 3.4}" rx="6" transform="rotate(${(random(i) - 0.5) * 30} ${cx} ${cy})"/>` : "";
    return `<circle cx="${cx}" cy="${cy - r}" r="${r}"/><rect x="${cx - r * 1.6}" y="${cy - r * 0.2}" width="${r * 3.2}" height="${height}" rx="${r}"/>${arm}`;
  }).join("");
  const performer = `<g fill="#05060a" opacity=".92"><circle cx="${width * 0.5}" cy="${height * 0.47}" r="${width * 0.028}"/><rect x="${width * 0.47}" y="${height * 0.5}" width="${width * 0.06}" height="${height * 0.24}" rx="${width * 0.02}"/><rect x="${width * 0.4}" y="${height * 0.69}" width="${width * 0.2}" height="${height * 0.05}" rx="6"/></g>`;
  const playButton = play ? `<circle cx="${width / 2}" cy="${height / 2}" r="${height * 0.09}" fill="rgba(0,0,0,.55)"/><polygon points="${width / 2 - height * 0.03},${height / 2 - height * 0.045} ${width / 2 - height * 0.03},${height / 2 + height * 0.045} ${width / 2 + height * 0.05},${height / 2}" fill="#fff"/><rect x="${width * 0.04}" y="${height * 0.93}" width="${width * 0.92}" height="6" rx="3" fill="rgba(255,255,255,.3)"/><rect x="${width * 0.04}" y="${height * 0.93}" width="${width * 0.35}" height="6" rx="3" fill="#2166f3"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<defs><filter id="b"><feGaussianBlur stdDeviation="14"/></filter>
<radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="hsl(${hue},80%,42%)"/><stop offset=".55" stop-color="hsl(${(hue + 30) % 360},70%,14%)"/><stop offset="1" stop-color="#05060a"/></radialGradient>
<radialGradient id="h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="hsla(${(hue + 50) % 360},100%,85%,.9)"/><stop offset="1" stop-color="hsla(${hue},100%,60%,0)"/></radialGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>${beams}
<ellipse cx="${width * 0.5}" cy="${height * 0.42}" rx="${width * 0.22}" ry="${height * 0.2}" fill="url(#h)"/>
${performer}<g fill="#020306">${crowd}</g>${playButton}</svg>`;
}

const svgUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const hueOf = (id: string) => mediaSeed.find(item => item.id === id)?.hue ?? 210;
const seedOf = (id: string) => Number(id.slice(1)) || 1;

function stream(id: string) {
  const poster = stageArt(hueOf(id), seedOf(id), 1280, 720, true);
  return {
    status: "ready",
    thumbnailUrl: svgUrl(stageArt(hueOf(id), seedOf(id), 640, 640)),
    iframeUrl: `data:text/html;charset=utf-8,${encodeURIComponent(`<body style="margin:0;background:#000"><img style="width:100%;height:100vh;object-fit:cover;display:block" src="${svgUrl(poster)}"></body>`)}`,
  };
}

function publicShow() {
  const show = shows[0];
  return {
    show,
    videos: media.filter(item => item.show_id === show.id && item.media_type === "video").slice(0, 3).map(item => ({
      ...item, stream: stream(item.id), download_url: "#",
      songs: matches.filter(match => match.media_id === item.id).map(({ id, title, artist, start_ms, end_ms, media_id }) => ({ id, title, artist, start_ms, end_ms, media_id })),
    })),
  };
}

const GB = 1_000_000_000;
const routes: [RegExp, (match: RegExpExecArray) => unknown][] = [
  [/^\/api\/shows$/, () => shows],
  [/^\/api\/media$/, () => media],
  [/^\/api\/song-matches$/, () => matches],
  [/^\/api\/account\/storage$/, () => ({ effectiveQuotaBytes: 50 * GB, usedBytes: 18.4 * GB, reservedBytes: 1.2 * GB, availableBytes: 30.4 * GB, overQuota: false, plan: { key: "plus", name: "Plus" } })],
  [/^\/api\/media\/(\w+)\/stream$/, match => stream(match[1])],
  [/^\/api\/media\/(\w+)\/recognition$/, () => ({ id: "job", status: "completed", attempt_count: 1, last_error: null })],
  [/^\/api\/media\/(\w+)\/share$/, () => ({ shared: true, url: "https://shows.krejzac.cz/share/vF7kQ2" })],
  [/^\/api\/shows\/(\w+)\/share$/, () => ({ shared: true, url: "https://shows.krejzac.cz/share/R8mTz4" })],
  [/^\/api\/public\/shows\/(\w+)$/, () => publicShow()],
  [/^\/api\/admin\/users$/, () => [
    { userId: "user_2xKq9VnD3hTqLw8RbZ1mFpA0cYe", plan: { key: "plus", name: "Plus" }, allowanceBytes: 50 * GB, promotionBytes: 0, effectiveQuotaBytes: 50 * GB, usedBytes: 18.4 * GB, reservedBytes: 1.2 * GB, uploadCount: 23, uploadBytes: 18.4 * GB },
    { userId: "user_2yLm4TbQ8sWdN1xVhK7pRgJ3uFi", plan: { key: "free", name: "Free" }, allowanceBytes: 5 * GB, promotionBytes: 10 * GB, effectiveQuotaBytes: 15 * GB, usedBytes: 11.2 * GB, reservedBytes: 0, uploadCount: 61, uploadBytes: 11.2 * GB },
    { userId: "user_2zPa7GcR5vYeM6tJnS2wHkL9oDq", plan: { key: "free", name: "Free" }, allowanceBytes: 5 * GB, promotionBytes: 0, effectiveQuotaBytes: 5 * GB, usedBytes: 4.7 * GB, reservedBytes: 0, uploadCount: 14, uploadBytes: 4.7 * GB },
  ]],
];

export function demoApi(): Plugin {
  return {
    name: "concert-thing-demo-api",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? "").split("?")[0];
        const content = /^\/api\/media\/(\w+)\/content$/.exec(path);
        if (content) {
          response.setHeader("content-type", "image/svg+xml");
          response.end(stageArt(hueOf(content[1]), seedOf(content[1])));
          return;
        }
        for (const [pattern, handler] of routes) {
          const match = pattern.exec(path);
          if (!match) continue;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(handler(match)));
          return;
        }
        if (path.startsWith("/api/")) {
          response.setHeader("content-type", "application/json");
          response.end("{}");
          return;
        }
        if (path.startsWith("/share/")) request.url = "/index.html";
        next();
      });
    },
  };
}
