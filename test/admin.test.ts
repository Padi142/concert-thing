import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { adminStatus, createPromotion, listAdminUsers } from "../src/server/admin";
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
    "0006_public_show_sharing.sql", "0007_short_public_links.sql", "0008_clerk_tenancy.sql",
    "0009_public_video_sharing.sql", "0010_storage_quota.sql", "0011_admin_panel.sql",
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
  INSERT INTO owner_storage (owner_id,plan_key,used_bytes,reserved_bytes,created_at,updated_at)
    VALUES ('user-admin','free',30,5,'2026-01-01','2026-01-01'),
           ('user-other','free',0,0,'2026-01-01','2026-01-01');
  INSERT INTO media_items (id,object_key,original_name,media_type,content_type,byte_size,status,owner_id,created_at)
    VALUES ('media-ready','admin/object','ready.jpg','photo','image/jpeg',30,'ready','user-admin','2026-01-01'),
           ('media-uploading','admin/uploading','uploading.mp4','video','video/mp4',5,'uploading','user-admin','2026-01-01');
  INSERT INTO storage_grants (id,owner_id,byte_amount,reason,source,created_at)
    VALUES ('grant-1','user-admin',2,'Founding promotion','test','2026-01-01');
  INSERT INTO admin_users (user_id,created_at) VALUES ('user-admin','2026-01-01');
`);

const archive = env(database);
assert.deepEqual(await (await adminStatus(archive, { userId: "user-other" })).json(), { isAdmin: false });
assert.deepEqual(await (await adminStatus(archive, { userId: "user-admin" })).json(), { isAdmin: true });
await assert.rejects(
  () => listAdminUsers(archive, { userId: "user-other" }),
  (error: unknown) => error instanceof HttpError && error.status === 403,
);

const listed = await listAdminUsers(archive, { userId: "user-admin" }, "2026-01-02T00:00:00.000Z");
const users = await listed.json() as Array<{ userId: string; plan: { key: string; name: string }; allowanceBytes: number; promotionBytes: number; effectiveQuotaBytes: number; usedBytes: number; reservedBytes: number; uploadCount: number; uploadBytes: number }>;
const admin = users.find(user => user.userId === "user-admin");
assert.deepEqual(admin, {
  userId: "user-admin",
  plan: { key: "free", name: "Free" },
  allowanceBytes: 10_000_000_000,
  promotionBytes: 2,
  effectiveQuotaBytes: 10_000_000_002,
  usedBytes: 30,
  reservedBytes: 5,
  uploadCount: 1,
  uploadBytes: 30,
});

await assert.rejects(
  () => createPromotion(new Request("https://archive.example/api/admin/promotions", { method: "POST", body: JSON.stringify({ userId: "user-other", additionalBytes: 5 }) }), archive, { userId: "user-other" }),
  (error: unknown) => error instanceof HttpError && error.status === 403,
);
const promotion = await createPromotion(new Request("https://archive.example/api/admin/promotions", {
  method: "POST",
  body: JSON.stringify({ userId: "user-other", additionalBytes: 5, reason: "Welcome promotion" }),
}), archive, { userId: "user-admin" });
assert.equal(promotion.status, 201);
const promotionBody = await promotion.json() as { userId: string; additionalBytes: number; storage: { effectiveQuotaBytes: number } };
assert.equal(promotionBody.userId, "user-other");
assert.equal(promotionBody.additionalBytes, 5);
assert.equal(promotionBody.storage.effectiveQuotaBytes, 10_000_000_005);

await assert.rejects(
  () => createPromotion(new Request("https://archive.example/api/admin/promotions", { method: "POST", body: JSON.stringify({ userId: "missing", additionalBytes: 5 }) }), archive, { userId: "user-admin" }),
  (error: unknown) => error instanceof HttpError && error.status === 404,
);

console.log("admin tests passed");
