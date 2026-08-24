# Concert Archive

A private, account-scoped archive service for concert photos and videos, deployed on Cloudflare.

## Implemented vertical slice

- Clerk sign-up and sign-in for the web and Expo apps, with short-lived session JWTs verified by the Worker
- Strict account isolation for Shows, Media Items, uploads, Stream playback, recognition, and Share Link management
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
- SHA-256 duplicate detection prevents the same video bytes from being uploaded twice
- Revocable public Show links let anyone with the URL watch and download that Show's ready videos
- Revocable per-video links expose one ready video as a direct inline media URL that Discord and similar clients can embed

Public links expose only ready videos assigned to that Show. Visitors watch short-lived signed Cloudflare Stream versions, see non-rejected recognized Songs and their timestamps, and download the private R2 original only through the Download action. Photos, other Shows, and owner controls remain private. Turning off a link invalidates its unguessable token.

Automatic Assignment occurs only when a media timestamp falls within exactly one Show. A Show without an end time uses a conservative six-hour window from its start; overlapping or unmatched windows leave the Media Item in the Inbox. Owner Assignment always takes precedence.

## Modules

```text
src/client/               React interface
  api.ts                  HTTP adapter used by all features
  components/             Account, Show, upload, media, and Song Match modules
  recognition.ts          Provider submission and retry orchestration
  Archive.tsx             Library composition, Song search, and data refresh
src/server/               Worker implementation
  router.ts               HTTP interface and route dispatch
  auth.ts                 Clerk verification and legacy-archive claiming
  shows.ts                Show persistence and validation
  media.ts                Ingestion, Assignment, search, and playback
  recognition/            Provider-neutral recognition and ACRCloud adapter
  http.ts                 Shared HTTP parsing/error behavior
src/worker.ts             Cloudflare entry point and error translation
migrations/               D1 schema history
mobile/                   Expo companion with a durable native upload queue
```

The Worker HTTP interface is the seam between client and server. D1 and R2 bindings remain private to the server modules.

## Mobile companion

The Expo app in [`mobile/`](mobile/) uses Clerk's SecureStore-backed session cache and sends a fresh session token to the same private Worker API. Selected photos and videos are copied into app-owned storage, recorded in account-scoped SQLite queues, and uploaded as resumable R2 multipart parts. Queue records survive relaunches; the server-side account-scoped `clientUploadId` makes upload creation idempotent if a response is lost.

Run the companion from its own workspace:

```bash
pnpm install
pnpm --filter concert-thing-mobile run typecheck
pnpm --filter concert-thing-mobile test
pnpm --filter concert-thing-mobile exec expo run:ios
# or: pnpm --filter concert-thing-mobile exec expo run:android
```

A development build is required for native background behavior. Normal app suspension can continue a native transfer, and deferred background work resumes the durable queue when the OS permits. A deliberate force-quit stops iOS background transfers; reopening the app resumes from SQLite. See [`mobile/README.md`](mobile/README.md) for setup and platform details.

## Song recognition

ACRCloud is isolated behind `RecognitionProvider`. After R2 upload completes, the Worker gives ACRCloud a temporary, unguessable download capability for the private original. ACRCloud pulls and processes the video asynchronously, so the browser can close after submission. Provider failure does not affect the private R2 original.

Recognition is configured for the ACRCloud File Scanning container in `eu-west-1`. There is no application-level monthly job limit; account billing and limits are managed in ACRCloud.

Store credentials interactively; never put values in source or shell history:

   ```bash
   wrangler secret put ACRCLOUD_ACCESS_TOKEN
   wrangler secret put ACRCLOUD_CONTAINER_ID
   ```

Clerk setup uses the CLI-linked application. The frontend publishable keys are build-time public configuration; the Worker verifies session tokens with Clerk's public JWT key stored as `CLERK_JWT_KEY` in Wrangler secrets.

Apply migrations and deploy:

   ```bash
   pnpm exec wrangler d1 migrations apply concert-thing --remote
   pnpm run deploy
   ```

Jobs are idempotent, have one retry, and expose completed, no-match, unsupported, and failed states. Machine reruns update only pending candidates; confirmed, rejected, edited, and manual Owner decisions are never overwritten. See [`docs/research/music-recognition.md`](docs/research/music-recognition.md).

## Video playback

Originals remain private in R2. The Stream binding imports each video through a temporary capability URL, transcodes it for adaptive playback, and requires short-lived signed playback tokens. The interface falls back to authenticated R2 range playback while encoding is in progress or if Stream is unavailable.

## Commands

```bash
pnpm install
pnpm test
pnpm run check
pnpm run deploy
```

Wrangler's local runtime does not support Android/Termux. On Termux, use:

```bash
pnpm install --ignore-scripts
pnpm run termux:shim
pnpm run check
pnpm run deploy
```

The shim only allows remote Wrangler commands; local `wrangler dev` is intentionally unsupported.

## Deployed archive

- URL: <https://concert-thing.padi142.workers.dev>
- D1 database: `concert-thing`
- R2 bucket: `concert-thing-media`
- Clerk application: `app_3IKYFrXthX2tnKuFp6mXYDSE5Zq`

The first Clerk account to sign in claims the pre-Clerk Shows and Media Items exactly once. Later accounts start with empty, isolated Libraries. The current migration snapshot is recorded in [`docs/current-uploads-summary.md`](docs/current-uploads-summary.md), with the complete non-secret list in [`docs/current-uploads.tsv`](docs/current-uploads.tsv).
