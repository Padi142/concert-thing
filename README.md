# Concert Archive

A private, single-Owner archive for concert photos and videos, deployed on Cloudflare.

## Implemented vertical slice

- Owner-token authentication with a secure, HTTP-only session cookie
- Create Shows with Artists, venue, locality, times, and timezone
- Resumable 8 MiB multipart uploads with two-file concurrency and live completion updates
- Originals stored privately in R2
- Media Item and Show metadata stored in D1
- Explicit upload-to-Show Assignment or automatic Assignment from embedded MP4/file timestamps
- Ambiguous Media Items enter the Inbox for explicit Assignment
- Private photo display and adaptive Cloudflare Stream video playback with R2 fallback
- Responsive React + Tailwind interface and installable web manifest
- Video duration in the Inbox and Library
- Automatic, asynchronous ACRCloud Song recognition using private direct video uploads
- Timestamped Song Match review: confirm, reject, edit, or manually add
- Library search by confirmed Song title or primary Artist

Share Links, duplicate detection, and deletion are deliberately deferred.

Automatic Assignment occurs only when a media timestamp falls within exactly one Show. A Show without an end time uses a conservative six-hour window from its start; overlapping or unmatched windows leave the Media Item in the Inbox. Owner Assignment always takes precedence.

## Modules

```text
src/client/               React interface
  api.ts                  HTTP adapter used by all features
  components/             Login, Show, upload, media, and Song Match modules
  recognition.ts          Provider submission and retry orchestration
  Archive.tsx             Library composition, Song search, and data refresh
src/server/               Worker implementation
  router.ts               HTTP interface and route dispatch
  auth.ts                 Owner session module
  shows.ts                Show persistence and validation
  media.ts                Ingestion, Assignment, search, and playback
  recognition/            Provider-neutral recognition and ACRCloud adapter
  http.ts                 Shared HTTP parsing/error behavior
src/worker.ts             Cloudflare entry point and error translation
migrations/               D1 schema history
```

The Worker HTTP interface is the seam between client and server. D1 and R2 bindings remain private to the server modules.

## Song recognition

ACRCloud is isolated behind `RecognitionProvider`. After R2 upload completes, the Worker gives ACRCloud a temporary, unguessable download capability for the private original. ACRCloud pulls and processes the video asynchronously, so the browser can close after submission. Provider failure does not affect the private R2 original.

Recognition is configured for the ACRCloud File Scanning container in `eu-west-1`. There is no application-level monthly job limit; account billing and limits are managed in ACRCloud.

Store credentials interactively; never put values in source or shell history:

   ```bash
   wrangler secret put ACRCLOUD_ACCESS_TOKEN
   wrangler secret put ACRCLOUD_CONTAINER_ID
   ```

Apply migrations and deploy:

   ```bash
   npx wrangler d1 migrations apply concert-thing --remote
   npm run deploy
   ```

Jobs are idempotent, have one retry, and expose completed, no-match, unsupported, and failed states. Machine reruns update only pending candidates; confirmed, rejected, edited, and manual Owner decisions are never overwritten. See [`docs/research/music-recognition.md`](docs/research/music-recognition.md).

## Video playback

Originals remain private in R2. The Stream binding imports each video through a temporary capability URL, transcodes it for adaptive playback, and requires short-lived signed playback tokens. The interface falls back to authenticated R2 range playback while encoding is in progress or if Stream is unavailable.

## Commands

```bash
npm install
npm test
npm run check
npm run deploy
```

Wrangler's local runtime does not support Android/Termux. On Termux, use:

```bash
npm install --ignore-scripts
npm run termux:shim
npm run check
npm run deploy
```

The shim only allows remote Wrangler commands; local `wrangler dev` is intentionally unsupported.

## Deployed archive

- URL: <https://concert-thing.padi142.workers.dev>
- D1 database: `concert-thing`
- R2 bucket: `concert-thing-media`
- The generated Owner token is stored locally in `.owner-token` (mode 600) and excluded by `.gitignore`.

Rotate access by generating a new token and running `wrangler secret put OWNER_TOKEN`.
