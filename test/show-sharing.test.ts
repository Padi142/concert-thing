import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handle } from "../src/server/router";
import type { Env } from "../src/server/env";
import { HttpError } from "../src/server/http";

class Statement {
  constructor(private readonly database: DatabaseSync, private readonly sql: string, private readonly params: unknown[] = []) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.database, this.sql, params);
  }

  first<T>(): T | null {
    return (this.database.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }

  all<T>(): { results: T[] } {
    return { results: this.database.prepare(this.sql).all(...this.params) as T[] };
  }

  run(): { meta: { changes: number } } {
    const result = this.database.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes) } };
  }
}

function testEnv(database: DatabaseSync): Env {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "user_1",
    sid: "session_1",
    azp: "https://archive.example",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  clerkToken = `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
  return {
    DB: { prepare: (sql: string) => new Statement(database, sql) } as unknown as D1Database,
    CLERK_JWT_KEY: publicPem,
    CLERK_AUTHORIZED_PARTIES: "https://archive.example",
    MEDIA: {} as R2Bucket,
    STREAM: {} as Env["STREAM"],
    ASSETS: {} as Fetcher,
  };
}

let clerkToken = "";

const database = new DatabaseSync(":memory:");
for (const migration of [
  "0001_initial.sql",
  "0002_assignment_provenance.sql",
  "0003_song_recognition.sql",
  "0004_stream_video.sql",
  "0005_duplicate_videos.sql",
  "0005_mobile_upload_idempotency.sql",
  "0006_public_show_sharing.sql",
  "0007_short_public_links.sql",
  "0008_clerk_tenancy.sql",
  "0009_public_video_sharing.sql",
  "0010_storage_quota.sql",
]) database.exec(readFileSync(`migrations/${migration}`, "utf8"));

database.prepare(`INSERT INTO shows (id,title,venue,locality,starts_at,ends_at,timezone,created_at)
  VALUES ('show-1','Tour stop','Venue','City','2026-01-01T20:00:00Z','2026-01-01T23:00:00Z','UTC','2026-01-01')`).run();
database.prepare("UPDATE shows SET owner_id = 'user_1' WHERE id = 'show-1'").run();
database.prepare(`INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,show_id,created_at)
  VALUES ('video-1','object-1','first.mp4','video','video/mp4',10,'ready','show-1','2026-01-01')`).run();
database.prepare("UPDATE media_items SET owner_id = 'user_1' WHERE id = 'video-1'").run();
database.prepare("UPDATE media_items SET stream_uid = 'stream-1', stream_status = 'ready' WHERE id = 'video-1'").run();
database.prepare(`INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,show_id,created_at)
  VALUES ('photo-1','object-2','cover.jpg','photo','image/jpeg',10,'ready','show-1','2026-01-01')`).run();
database.prepare("UPDATE media_items SET owner_id = 'user_1' WHERE id = 'photo-1'").run();
database.prepare(`INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,show_id,created_at)
  VALUES ('uploading-1','object-3','later.mp4','video','video/mp4',10,'uploading','show-1','2026-01-01')`).run();
database.prepare("UPDATE media_items SET owner_id = 'user_1' WHERE id = 'uploading-1'").run();
database.prepare(`INSERT INTO songs (id,title,primary_artist,normalized_title,normalized_artist,created_at)
  VALUES ('song-1','First Song','The Artist','first song','the artist','2026-01-01')`).run();
database.prepare(`INSERT INTO song_matches (id,media_id,start_ms,end_ms,review_state,song_id,created_at,updated_at)
  VALUES ('match-1','video-1',12000,42000,'confirmed','song-1','2026-01-01','2026-01-01')`).run();
database.prepare(`INSERT INTO song_matches (id,media_id,start_ms,candidate_title,candidate_artist,review_state,created_at,updated_at)
  VALUES ('match-2','video-1',50000,'Second Song','Another Artist','pending','2026-01-01','2026-01-01')`).run();
database.prepare(`INSERT INTO song_matches (id,media_id,start_ms,candidate_title,candidate_artist,review_state,created_at,updated_at)
  VALUES ('match-rejected','video-1',70000,'Wrong Song','Wrong Artist','rejected','2026-01-01','2026-01-01')`).run();

const env = testEnv(database);
env.MEDIA = {
  head: async () => ({ size: 12, httpEtag: "video-etag" }),
  get: async () => ({ body: new Response("video bytes").body }),
} as unknown as R2Bucket;
env.STREAM = {
  video: (id: string) => ({
    details: async () => ({ id, readyToStream: true, preview: "https://customer.example/stream-preview", status: { state: "ready" } }),
    generateToken: async () => "signed-stream-token",
    delete: async () => undefined,
  }),
} as unknown as Env["STREAM"];
const ownerHeaders = { authorization: `Bearer ${clerkToken}` };
const videoShareStatus = await handle(new Request("https://archive.example/api/media/video-1/share", { headers: ownerHeaders }), env);
assert.deepEqual(await videoShareStatus.json(), { shared: false, url: null });
const videoShare = await handle(new Request("https://archive.example/api/media/video-1/share", { method: "POST", headers: ownerHeaders }), env);
assert.equal(videoShare.status, 200);
const videoShareBody = await videoShare.json() as { shared: boolean; url: string };
assert.equal(videoShareBody.shared, true);
assert.match(videoShareBody.url, /^https:\/\/archive\.example\/video\/[A-Za-z0-9]{6}\.mp4$/);
const publicVideo = await handle(new Request(videoShareBody.url), env);
assert.equal(publicVideo.status, 200);
assert.equal(publicVideo.headers.get("content-type"), "video/mp4");
assert.match(publicVideo.headers.get("content-disposition") ?? "", /^inline;/);
assert.equal(publicVideo.headers.get("cache-control"), "public, max-age=300");
assert.deepEqual(new Uint8Array(await publicVideo.arrayBuffer()), new TextEncoder().encode("video bytes"));
const revokedVideoShare = await handle(new Request("https://archive.example/api/media/video-1/share", { method: "DELETE", headers: ownerHeaders }), env);
assert.deepEqual(await revokedVideoShare.json(), { shared: false, url: null });
await assert.rejects(
  () => handle(new Request(videoShareBody.url), env),
  (cause: unknown) => cause instanceof HttpError && cause.status === 404,
);

const share = await handle(new Request("https://archive.example/api/shows/show-1/share", { method: "POST", headers: ownerHeaders }), env);
assert.equal(share.status, 200);
const shareBody = await share.json() as { shared: boolean; url: string };
assert.equal(shareBody.shared, true);
assert.match(shareBody.url, /^https:\/\/archive\.example\/share\/[A-Za-z0-9]{6}$/);

const publicUrl = new URL(shareBody.url);
const publicResponse = await handle(new Request(`https://archive.example/api/public/shows${publicUrl.pathname.slice("/share".length)}`), env);
assert.equal(publicResponse.status, 200);
const publicBody = await publicResponse.json() as { show: { title: string }; videos: { id: string; stream: { status: string; iframeUrl?: string }; songs: { title: string; artist: string; start_ms: number }[]; content_url?: string; download_url: string }[] };
assert.equal(publicBody.show.title, "Tour stop");
assert.deepEqual(publicBody.videos.map(video => video.id), ["video-1"]);
assert.equal(publicBody.videos[0].content_url, undefined, "the original must not be used as the public player source");
assert.equal(publicBody.videos[0].stream.status, "ready");
assert.equal(publicBody.videos[0].stream.iframeUrl, "https://customer.example/signed-stream-token/iframe");
assert.deepEqual(publicBody.videos[0].songs.map(song => [song.title, song.artist, song.start_ms]), [
  ["First Song", "The Artist", 12000],
  ["Second Song", "Another Artist", 50000],
]);
assert.match(publicBody.videos[0].download_url, /\?download=1$/);

const publicContent = await handle(new Request(`https://archive.example${publicBody.videos[0].download_url.replace("?download=1", "")}`), env);
assert.equal(publicContent.status, 200);
assert.equal(publicContent.headers.get("cache-control"), "public, max-age=300");
assert.match(publicContent.headers.get("content-disposition") ?? "", /^attachment;/);
const publicDownload = await handle(new Request(`https://archive.example${publicBody.videos[0].download_url}`), env);
assert.equal(publicDownload.status, 200);
assert.match(publicDownload.headers.get("content-disposition") ?? "", /^attachment;/);

const status = await handle(new Request("https://archive.example/api/shows/show-1/share", { headers: ownerHeaders }), env);
assert.deepEqual(await status.json(), shareBody);
await assert.rejects(
  () => handle(new Request("https://archive.example/api/shows/show-1/share"), env),
  (cause: unknown) => cause instanceof HttpError && cause.status === 401,
);

const revoked = await handle(new Request("https://archive.example/api/shows/show-1/share", { method: "DELETE", headers: ownerHeaders }), env);
assert.deepEqual(await revoked.json(), { shared: false, url: null });
await assert.rejects(
  () => handle(new Request(`https://archive.example/api/public/shows${publicUrl.pathname.slice("/share".length)}`), env),
  (cause: unknown) => cause instanceof HttpError && cause.status === 404,
);

console.log("public Show sharing: passed");
