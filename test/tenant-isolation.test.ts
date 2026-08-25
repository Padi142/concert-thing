import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { listMedia } from "../src/server/media";
import { listSongMatches } from "../src/server/recognition";
import { listShows } from "../src/server/shows";
import { showShareStatus } from "../src/server/sharing";
import { claimLegacyData } from "../src/server/auth";
import type { AuthContext } from "../src/server/auth";
import type { Env } from "../src/server/env";
import { HttpError } from "../src/server/http";

class Statement {
  constructor(private readonly database: DatabaseSync, private readonly sql: string, private readonly params: unknown[] = []) {}
  bind(...params: unknown[]): Statement { return new Statement(this.database, this.sql, params); }
  first<T>(): T | null { return (this.database.prepare(this.sql).get(...this.params) as T | undefined) ?? null; }
  all<T>(): { results: T[] } { return { results: this.database.prepare(this.sql).all(...this.params) as T[] }; }
  run(): { meta: { changes: number } } {
    const result = this.database.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes) } };
  }
}

function migrate(database: DatabaseSync): void {
  for (const migration of [
    "0001_initial.sql", "0002_assignment_provenance.sql", "0003_song_recognition.sql",
    "0004_stream_video.sql", "0005_duplicate_videos.sql", "0005_mobile_upload_idempotency.sql",
    "0006_public_show_sharing.sql", "0007_short_public_links.sql", "0008_clerk_tenancy.sql", "0009_public_video_sharing.sql", "0010_storage_quota.sql",
  ]) database.exec(readFileSync(`migrations/${migration}`, "utf8"));
}

function env(database: DatabaseSync): Env {
  return {
    DB: {
      prepare: (sql: string) => new Statement(database, sql),
      batch: async (statements: Statement[]) => statements.map(statement => statement.run()),
    } as unknown as D1Database,
    MEDIA: {} as R2Bucket,
    STREAM: {} as Env["STREAM"],
    ASSETS: {} as Fetcher,
  };
}

const database = new DatabaseSync(":memory:");
migrate(database);
database.exec(`
  INSERT INTO shows (id,title,venue,starts_at,timezone,created_at,owner_id)
    VALUES ('show-a','A show','Venue','2026-01-01T20:00:00Z','UTC','2026-01-01','user-a'),
           ('show-b','B show','Venue','2026-01-02T20:00:00Z','UTC','2026-01-01','user-b');
  INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,show_id,content_hash,client_upload_id,created_at,owner_id)
    VALUES ('media-a','a/object','a.mp4','video','video/mp4',1,'ready','show-a',lower(hex(randomblob(32))),'client-a','2026-01-01','user-a'),
           ('media-b','b/object','b.mp4','video','video/mp4',1,'ready','show-b',lower(hex(randomblob(32))),'client-b','2026-01-01','user-b');
`);
database.exec(`
  INSERT INTO songs (id,title,primary_artist,normalized_title,normalized_artist,created_at)
    VALUES ('song-a','A song','A artist','a song','a artist','2026-01-01');
  INSERT INTO song_matches (id,media_id,start_ms,review_state,song_id,created_at,updated_at)
    VALUES ('match-a','media-a',0,'confirmed','song-a','2026-01-01','2026-01-01');
`);

const archive = env(database);
const userA: AuthContext = { userId: "user-a" };
const userB: AuthContext = { userId: "user-b" };
const showsA = await listShows(archive, userA);
assert.deepEqual((await showsA.json() as Array<{ id: string }>).map(show => show.id), ["show-a"]);
const mediaA = await listMedia(new Request("https://archive.example/api/media"), archive, userA);
assert.deepEqual((await mediaA.json() as Array<{ id: string }>).map(media => media.id), ["media-a"]);
const songsA = await listSongMatches(archive, userA);
assert.deepEqual((await songsA.json() as Array<{ media_id: string }>).map(match => match.media_id), ["media-a"]);

await assert.rejects(
  () => showShareStatus(new Request("https://archive.example/api/shows/show-b/share"), archive, "show-b", userA),
  (error: unknown) => error instanceof HttpError && error.status === 404,
);

// Tenant-local duplicate indexes allow equal client IDs and content hashes in
// different accounts while still rejecting a duplicate within one account.
database.prepare(`INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,content_hash,client_upload_id,created_at,owner_id)
  VALUES ('media-b-2','b/object-2','b2.mp4','video','video/mp4',1,'ready',(SELECT content_hash FROM media_items WHERE id = 'media-a'),'client-a','2026-01-01','user-b')`).run();
assert.throws(() => database.prepare(`INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,content_hash,client_upload_id,created_at,owner_id)
  VALUES ('media-a-2','a/object-2','a2.mp4','video','video/mp4',1,'ready',(SELECT content_hash FROM media_items WHERE id = 'media-a'),'client-a','2026-01-01','user-a')`).run());

const legacyDatabase = new DatabaseSync(":memory:");
migrate(legacyDatabase);
legacyDatabase.exec(`INSERT INTO shows (id,title,venue,starts_at,timezone,created_at) VALUES ('legacy-show','Legacy','Venue','2026-01-01T20:00:00Z','UTC','2026-01-01');`);
legacyDatabase.exec(`INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,created_at)
  VALUES ('legacy-media','legacy/object','legacy.jpg','photo','image/jpeg',1,'ready','2026-01-01');`);
const legacyEnv = env(legacyDatabase);
const firstClaim = await claimLegacyData(legacyEnv, userA);
assert.deepEqual(await firstClaim.json(), { claimed: true, legacyOwner: true, shows: 1, mediaItems: 1 });
const claimedStorage = legacyDatabase.prepare("SELECT used_bytes,reserved_bytes FROM owner_storage WHERE owner_id = 'user-a'").get() as { used_bytes: number; reserved_bytes: number };
assert.equal(claimedStorage.used_bytes, 1);
assert.equal(claimedStorage.reserved_bytes, 0);
const laterClaim = await claimLegacyData(legacyEnv, userB);
assert.deepEqual(await laterClaim.json(), { claimed: false, legacyOwner: false, shows: 0, mediaItems: 0 });

console.log("tenant isolation: passed");
