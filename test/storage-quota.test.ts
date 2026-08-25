import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beginUpload, cancelUpload, completeUpload, deleteMedia, listMedia, runStorageMaintenance, serveMedia, uploadStatus } from "../src/server/media";
import { listSongMatches } from "../src/server/recognition";
import { handle } from "../src/server/router";
import type { AuthContext } from "../src/server/auth";
import type { Env } from "../src/server/env";
import {
  StorageQuotaExceeded,
  getStorageQuota,
  reconcileStorage,
  reserveStorage,
} from "../src/server/storage";

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

function migrate(database: DatabaseSync): void {
  for (const migration of [
    "0001_initial.sql", "0002_assignment_provenance.sql", "0003_song_recognition.sql",
    "0004_stream_video.sql", "0005_duplicate_videos.sql", "0005_mobile_upload_idempotency.sql",
    "0006_public_show_sharing.sql", "0007_short_public_links.sql", "0008_clerk_tenancy.sql",
    "0009_public_video_sharing.sql", "0010_storage_quota.sql",
  ]) database.exec(readFileSync(`migrations/${migration}`, "utf8"));
}

const legacyDatabase = new DatabaseSync(":memory:");
for (const migration of [
  "0001_initial.sql", "0002_assignment_provenance.sql", "0003_song_recognition.sql",
  "0004_stream_video.sql", "0005_duplicate_videos.sql", "0005_mobile_upload_idempotency.sql",
  "0006_public_show_sharing.sql", "0007_short_public_links.sql", "0008_clerk_tenancy.sql",
  "0009_public_video_sharing.sql",
]) legacyDatabase.exec(readFileSync(`migrations/${migration}`, "utf8"));
legacyDatabase.exec(`
  INSERT INTO media_items (
    id,object_key,original_name,media_type,content_type,byte_size,status,created_at,owner_id
  ) VALUES ('legacy-media','legacy/object','legacy.jpg','photo','image/jpeg',17,'ready','2026-01-01','legacy-owner');
  INSERT INTO recognition_jobs (id,media_id,provider,status,created_at,updated_at)
  VALUES ('legacy-job','legacy-media','acrcloud','completed','2026-01-01','2026-01-01');
`);
legacyDatabase.exec(readFileSync("migrations/0010_storage_quota.sql", "utf8"));
assert.equal(legacyDatabase.prepare("SELECT COUNT(*) AS count FROM recognition_jobs WHERE media_id = 'legacy-media'").get().count, 1, "migration must preserve child rows");
assert.equal(legacyDatabase.prepare("SELECT used_bytes FROM owner_storage WHERE owner_id = 'legacy-owner'").get().used_bytes, 17, "migration must backfill usage");
assert.deepEqual(legacyDatabase.prepare("PRAGMA foreign_key_check").all(), [], "migration must preserve foreign keys");

function makeMedia(): { bucket: R2Bucket; multipart: { aborts: number; completes: number }; setSize: (size: number | null) => void; setDeleteFailure: (value: boolean) => void } {
  let size: number | null = null;
  let deleteFailure = false;
  const multipart = { aborts: 0, completes: 0 };
  const bucket = {
    createMultipartUpload: async () => ({
      uploadId: "upload-1",
      key: "object",
      uploadPart: async () => ({ partNumber: 1, etag: "etag" }),
      complete: async () => {
        multipart.completes += 1;
        size = size ?? 10;
        return {};
      },
      abort: async () => { multipart.aborts += 1; },
    }),
    resumeMultipartUpload: () => ({
      uploadId: "upload-1",
      key: "object",
      uploadPart: async () => ({ partNumber: 1, etag: "etag" }),
      complete: async () => {
        multipart.completes += 1;
        size = size ?? 10;
        return {};
      },
      abort: async () => { multipart.aborts += 1; },
    }),
    head: async () => size === null ? null : { size, httpEtag: "etag" },
    delete: async () => {
      if (deleteFailure) throw new Error("R2 unavailable");
      size = null;
    },
    get: async () => size === null ? null : { body: new Response("bytes").body },
  } as unknown as R2Bucket;
  return { bucket, multipart, setSize: value => { size = value; }, setDeleteFailure: value => { deleteFailure = value; } };
}

function makeEnv(database: DatabaseSync, media: R2Bucket, token?: string, jwtKey?: string): Env {
  return {
    DB: {
      prepare: (sql: string) => new Statement(database, sql),
      batch: async (statements: Statement[]) => statements.map(statement => statement.run()),
    } as unknown as D1Database,
    MEDIA: media,
    STREAM: {
      video: () => ({ delete: async () => undefined, details: async () => ({ readyToStream: false, status: { state: "processing" } }), generateToken: async () => "token" }),
    },
    ASSETS: {} as Fetcher,
    CLERK_JWT_KEY: jwtKey,
    CLERK_AUTHORIZED_PARTIES: token ? "https://archive.example" : undefined,
  };
}

const database = new DatabaseSync(":memory:");
migrate(database);
const auth: AuthContext = { userId: "owner-a" };
const media = makeMedia();
const env = makeEnv(database, media.bucket);

const defaultQuota = await getStorageQuota(env.DB, auth.userId, "2026-01-01T00:00:00.000Z");
assert.deepEqual(defaultQuota, {
  effectiveQuotaBytes: 10_000_000_000,
  usedBytes: 0,
  reservedBytes: 0,
  availableBytes: 10_000_000_000,
  overQuota: false,
  plan: { key: "free", name: "Free" },
});

database.prepare(`
  INSERT INTO storage_grants (id,owner_id,byte_amount,reason,source,created_at,expires_at)
  VALUES ('active','owner-a',2,'Promotion','test','2025-01-01','2026-02-01'),
         ('expired','owner-a',3,'Old promotion','test','2024-01-01','2025-12-01'),
         ('revoked','owner-a',4,'Revoked gift','test','2024-01-01',NULL)
`).run();
database.prepare("UPDATE storage_grants SET revoked_at = '2025-01-02' WHERE id = 'revoked'").run();
const grantQuota = await getStorageQuota(env.DB, auth.userId, "2026-01-01T00:00:00.000Z");
assert.equal(grantQuota.effectiveQuotaBytes, 10_000_000_002);
database.prepare("UPDATE owner_storage SET plan_key = 'pro' WHERE owner_id = 'owner-a'").run();
assert.equal((await getStorageQuota(env.DB, auth.userId, "2026-01-01T00:00:00.000Z")).effectiveQuotaBytes, 100_000_000_002);

database.prepare("UPDATE owner_storage SET plan_key = 'free' WHERE owner_id = 'owner-a'").run();
await reserveStorage(env.DB, auth.userId, 9_000_000_000, "2026-01-01T00:00:00.000Z");
await assert.rejects(
  () => reserveStorage(env.DB, auth.userId, 2_000_000_000, "2026-01-01T00:00:00.000Z"),
  (error: unknown) => error instanceof StorageQuotaExceeded && error.storage.availableBytes === 1_000_000_002,
);

const concurrentReservations = await Promise.allSettled([
  reserveStorage(env.DB, "owner-concurrent", 6_000_000_000, "2026-01-01T00:00:00.000Z"),
  reserveStorage(env.DB, "owner-concurrent", 6_000_000_000, "2026-01-01T00:00:00.000Z"),
]);
assert.equal(concurrentReservations.filter(result => result.status === "fulfilled").length, 1);
assert.equal(concurrentReservations.filter(result => result.status === "rejected").length, 1);
assert.equal((await getStorageQuota(env.DB, "owner-concurrent")).reservedBytes, 6_000_000_000);

// An over-quota Owner can still read and delete existing Media Items, while a
// new reservation is rejected by the same conditional accounting update.
database.prepare("INSERT INTO owner_storage (owner_id,plan_key,used_bytes,reserved_bytes,created_at,updated_at) VALUES ('owner-c','free',10000000000,0,'2026-01-01','2026-01-01')").run();
database.prepare(`
  INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,owner_id,created_at)
  VALUES ('over-media','over/object','over.jpg','photo','image/jpeg',10000000000,'ready','owner-c','2026-01-01')
`).run();
media.setSize(10000000000);
const overRead = await serveMedia(new Request("https://archive.example/api/media/over-media/content"), env, "over-media", { ownerId: "owner-c" });
assert.equal(overRead.status, 200);
await assert.rejects(
  () => beginUpload(new Request("https://archive.example/api/uploads", {
    method: "POST",
    body: JSON.stringify({ name: "blocked.jpg", type: "image/jpeg", size: 1 }),
    headers: { "content-type": "application/json" },
  }), env, { userId: "owner-c" }),
  (error: unknown) => error instanceof Error && "details" in error && (error as { details: { code?: string } }).details.code === "STORAGE_QUOTA_EXCEEDED",
);
await deleteMedia(env, "over-media", { userId: "owner-c" });
assert.equal((await getStorageQuota(env.DB, "owner-c")).usedBytes, 0);

// A reservation made before a downgrade is still allowed to complete.
database.prepare("INSERT INTO owner_storage (owner_id,plan_key,used_bytes,reserved_bytes,created_at,updated_at) VALUES ('owner-d','free',0,0,'2026-01-01','2026-01-01')").run();
const preDowngrade = await beginUpload(new Request("https://archive.example/api/uploads", {
  method: "POST",
  body: JSON.stringify({ name: "reserved.jpg", type: "image/jpeg", size: 10, clientUploadId: "reserved-01" }),
  headers: { "content-type": "application/json" },
}), env, { userId: "owner-d" });
const preDowngradeId = (await preDowngrade.json() as { mediaId: string }).mediaId;
database.prepare("UPDATE owner_storage SET used_bytes = 10000000000 WHERE owner_id = 'owner-d'").run();
media.setSize(10);
await completeUpload(new Request("https://archive.example/api/uploads/complete", {
  method: "POST",
  body: JSON.stringify({ parts: [{ partNumber: 1, etag: "etag" }] }),
  headers: { "content-type": "application/json" },
}), env, preDowngradeId, { userId: "owner-d" });
const completedQuota = await getStorageQuota(env.DB, "owner-d");
assert.equal(completedQuota.reservedBytes, 0);
await completeUpload(new Request("https://archive.example/api/uploads/complete", {
  method: "POST",
  body: JSON.stringify({ parts: [{ partNumber: 1, etag: "etag" }] }),
  headers: { "content-type": "application/json" },
}), env, preDowngradeId, { userId: "owner-d" });
assert.deepEqual(await getStorageQuota(env.DB, "owner-d"), completedQuota, "completion retries move counters once");

database.prepare("INSERT INTO owner_storage (owner_id,plan_key,used_bytes,reserved_bytes,created_at,updated_at) VALUES ('owner-e','free',10,0,'2026-01-01','2026-01-01')").run();
database.prepare(`
  INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,owner_id,content_hash,created_at)
  VALUES ('duplicate-media','duplicate/object','duplicate.mp4','video','video/mp4',10,'ready','owner-e',lower(hex(randomblob(32))),'2026-01-01')
`).run();
const duplicateHash = (database.prepare("SELECT content_hash FROM media_items WHERE id = 'duplicate-media'").get() as { content_hash: string }).content_hash;
const duplicateResponse = await beginUpload(new Request("https://archive.example/api/uploads", {
  method: "POST",
  body: JSON.stringify({ name: "duplicate.mp4", type: "video/mp4", size: 10, contentHash: duplicateHash }),
  headers: { "content-type": "application/json" },
}), env, { userId: "owner-e" });
assert.equal(duplicateResponse.status, 409);
assert.equal((await getStorageQuota(env.DB, "owner-e")).reservedBytes, 0, "duplicate detection must happen before reservation");

database.prepare("INSERT INTO owner_storage (owner_id,plan_key,used_bytes,reserved_bytes,created_at,updated_at) VALUES ('owner-f','free',5,0,'2026-01-01','2026-01-01')").run();
database.prepare("INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,owner_id,created_at) VALUES ('flaky-media','flaky/object','flaky.jpg','photo','image/jpeg',5,'ready','owner-f','2026-01-01')").run();
database.prepare("INSERT INTO songs (id,title,primary_artist,normalized_title,normalized_artist,created_at) VALUES ('flaky-song','Flaky Song','Artist','flaky song','artist','2026-01-01')").run();
database.prepare("INSERT INTO song_matches (id,media_id,start_ms,review_state,song_id,created_at,updated_at) VALUES ('flaky-match','flaky-media',0,'confirmed','flaky-song','2026-01-01','2026-01-01')").run();
media.setSize(5);
media.setDeleteFailure(true);
const deletionPending = await deleteMedia(env, "flaky-media", { userId: "owner-f" });
assert.equal(deletionPending.status, 202);
assert.equal((await getStorageQuota(env.DB, "owner-f")).usedBytes, 5, "failed R2 deletion remains charged");
assert.deepEqual(await (await listMedia(new Request("https://archive.example/api/media"), env, { userId: "owner-f" })).json(), [], "deleting items stay hidden");
assert.deepEqual(await (await listSongMatches(env, { userId: "owner-f" })).json(), [], "deleting items stay hidden from recognition");
media.setDeleteFailure(false);
await deleteMedia(env, "flaky-media", { userId: "owner-f" });
const repeatedDeletion = await deleteMedia(env, "flaky-media", { userId: "owner-f" });
assert.equal(repeatedDeletion.status, 200, "repeated deletion must converge after finalization");
assert.equal((await getStorageQuota(env.DB, "owner-f")).usedBytes, 0);

// Keep this lifecycle test small after exercising the large-value accounting.
database.prepare("UPDATE owner_storage SET used_bytes = 0, reserved_bytes = 0 WHERE owner_id = 'owner-a'").run();
const first = await beginUpload(new Request("https://archive.example/api/uploads", {
  method: "POST",
  body: JSON.stringify({ name: "show.jpg", type: "image/jpeg", size: 10, clientUploadId: "client-01" }),
  headers: { "content-type": "application/json" },
}), env, auth);
assert.equal(first.status, 201);
const second = await beginUpload(new Request("https://archive.example/api/uploads", {
  method: "POST",
  body: JSON.stringify({ name: "show.jpg", type: "image/jpeg", size: 10, clientUploadId: "client-01" }),
  headers: { "content-type": "application/json" },
}), env, auth);
assert.equal(second.status, 200, "clientUploadId retries must not reserve twice");
assert.equal((await getStorageQuota(env.DB, auth.userId)).reservedBytes, 10);
const mediaId = (await first.json() as { mediaId: string }).mediaId;

media.setSize(11);
await assert.rejects(
  () => completeUpload(new Request("https://archive.example/api/uploads/complete", {
    method: "POST",
    body: JSON.stringify({ parts: [{ partNumber: 1, etag: "etag" }] }),
    headers: { "content-type": "application/json" },
  }), env, mediaId, auth),
  (error: unknown) => error instanceof Error && error.message.includes("does not match"),
);
assert.equal((await getStorageQuota(env.DB, auth.userId)).reservedBytes, 0, "size mismatch releases reservation");

const stale = await beginUpload(new Request("https://archive.example/api/uploads", {
  method: "POST",
  body: JSON.stringify({ name: "stale.jpg", type: "image/jpeg", size: 10, clientUploadId: "stale-01" }),
  headers: { "content-type": "application/json" },
}), env, auth);
const staleId = (await stale.json() as { mediaId: string }).mediaId;
database.prepare("UPDATE media_items SET upload_activity_at = '2025-01-01' WHERE id = ?").run(staleId);
await runStorageMaintenance(env, "2025-01-09T00:00:00.000Z");
assert.equal((await getStorageQuota(env.DB, auth.userId)).reservedBytes, 0, "expiry releases reservations");
await assert.rejects(
  () => uploadStatus(env, staleId, auth),
  (error: unknown) => error instanceof Error && "details" in error && (error as { details: { code?: string } }).details.code === "UPLOAD_EXPIRED",
);

const cancelled = await beginUpload(new Request("https://archive.example/api/uploads", {
  method: "POST",
  body: JSON.stringify({ name: "cancelled.jpg", type: "image/jpeg", size: 10, clientUploadId: "cancelled-01" }),
  headers: { "content-type": "application/json" },
}), env, auth);
const cancelledId = (await cancelled.json() as { mediaId: string }).mediaId;
assert.equal((await getStorageQuota(env.DB, auth.userId)).reservedBytes, 10);
assert.equal((await cancelUpload(env, cancelledId, auth)).status, 204);
assert.equal((await cancelUpload(env, cancelledId, auth)).status, 204);
assert.equal((await getStorageQuota(env.DB, auth.userId)).reservedBytes, 0, "cancellation retries release once");

const readyId = "ready-1";
database.prepare(`
  INSERT INTO owner_storage (owner_id,plan_key,used_bytes,reserved_bytes,created_at,updated_at)
  VALUES ('owner-b','free',5,0,'2026-01-01','2026-01-01')
`).run();
database.prepare(`
  INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,owner_id,created_at)
  VALUES (?, 'ready/object', 'ready.jpg', 'photo', 'image/jpeg', 5, 'ready', 'owner-b', '2026-01-01')
`).run(readyId);
media.setSize(5);
await deleteMedia(env, readyId, { userId: "owner-b" });
assert.equal((await getStorageQuota(env.DB, "owner-b")).usedBytes, 0, "deletion releases usage after R2 deletion");

database.prepare("UPDATE owner_storage SET used_bytes = 99, reserved_bytes = 77 WHERE owner_id = 'owner-a'").run();
const repaired = await reconcileStorage(env.DB, "2026-01-03T00:00:00.000Z");
assert.equal(repaired.ownersRepaired > 0, true);
assert.deepEqual((await getStorageQuota(env.DB, "owner-a")).usedBytes, 0);

// Exercise the authenticated route contract with a real Clerk-signed test token.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test" })).toString("base64url");
const payload = Buffer.from(JSON.stringify({ sub: "route-owner", azp: "https://archive.example", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
const signer = createSign("RSA-SHA256");
signer.update(`${header}.${payload}`);
signer.end();
const clerkToken = `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
const routeEnv = makeEnv(database, media.bucket, clerkToken, publicPem);
const quotaResponse = await handle(new Request("https://archive.example/api/account/storage", { headers: { authorization: `Bearer ${clerkToken}` } }), routeEnv);
assert.equal(quotaResponse.status, 200);
assert.equal((await quotaResponse.json() as { plan: { key: string } }).plan.key, "free");

console.log("storage quota accounting: passed");
