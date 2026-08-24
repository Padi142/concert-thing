import * as SQLite from "expo-sqlite";
import type { QueuePart, QueueUpload } from "../types";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
const queueUploadColumns = new Set([
  "account_id", "local_uri", "original_name", "content_type", "byte_size", "content_hash", "captured_at", "duration_ms", "show_id",
  "state", "upload_id", "media_id", "chunk_size", "retry_count", "next_retry_at", "last_error", "created_at", "updated_at",
]);

const schema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS queue_uploads (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT,
    local_uri TEXT NOT NULL,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    content_hash TEXT,
    captured_at TEXT,
    duration_ms INTEGER,
    show_id TEXT,
    state TEXT NOT NULL,
    upload_id TEXT,
    media_id TEXT,
    chunk_size INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS queue_parts (
    queue_id TEXT NOT NULL,
    part_number INTEGER NOT NULL,
    byte_start INTEGER NOT NULL,
    byte_end INTEGER NOT NULL,
    etag TEXT,
    state TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (queue_id, part_number),
    FOREIGN KEY (queue_id) REFERENCES queue_uploads(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS queue_uploads_state_idx ON queue_uploads(state, next_retry_at, created_at);
  CREATE INDEX IF NOT EXISTS queue_parts_state_idx ON queue_parts(queue_id, state, part_number);
`;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("concert-thing-mobile.db").then(async (db) => {
      await db.execAsync(schema);
      const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(queue_uploads)");
      if (!columns.some((column) => column.name === "account_id")) {
        await db.execAsync("ALTER TABLE queue_uploads ADD COLUMN account_id TEXT");
      }
      if (!columns.some((column) => column.name === "content_hash")) {
        await db.execAsync("ALTER TABLE queue_uploads ADD COLUMN content_hash TEXT");
      }
      await db.execAsync("CREATE INDEX IF NOT EXISTS queue_uploads_account_state_idx ON queue_uploads(account_id, state, next_retry_at, created_at)");
      return db;
    });
  }
  return databasePromise;
}

export async function insertQueueUpload(upload: QueueUpload): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO queue_uploads
      (id,account_id,local_uri,original_name,content_type,byte_size,content_hash,captured_at,duration_ms,show_id,state,upload_id,media_id,chunk_size,retry_count,next_retry_at,last_error,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    upload.id,
    upload.account_id,
    upload.local_uri,
    upload.original_name,
    upload.content_type,
    upload.byte_size,
    upload.content_hash,
    upload.captured_at,
    upload.duration_ms,
    upload.show_id,
    upload.state,
    upload.upload_id,
    upload.media_id,
    upload.chunk_size,
    upload.retry_count,
    upload.next_retry_at,
    upload.last_error,
    upload.created_at,
    upload.updated_at,
  );
}

export async function claimUnownedQueueUploads(accountId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE queue_uploads SET account_id = ?, updated_at = ? WHERE account_id IS NULL", accountId, Date.now());
}

export async function listQueueUploads(accountId: string | null): Promise<QueueUpload[]> {
  if (!accountId) return [];
  const db = await getDatabase();
  return db.getAllAsync<QueueUpload>(`
    SELECT u.*,
      (SELECT COUNT(*) FROM queue_parts p WHERE p.queue_id = u.id) AS total_parts,
      (SELECT COUNT(*) FROM queue_parts p WHERE p.queue_id = u.id AND p.state = 'complete') AS completed_parts
    FROM queue_uploads u WHERE u.account_id = ? ORDER BY u.created_at DESC
  `, accountId);
}

export async function getQueueUpload(id: string, accountId: string | null): Promise<QueueUpload | null> {
  if (!accountId) return null;
  const db = await getDatabase();
  return db.getFirstAsync<QueueUpload>("SELECT * FROM queue_uploads WHERE id = ? AND account_id = ?", id, accountId);
}

export async function updateQueueUpload(id: string, accountId: string | null, patch: Partial<QueueUpload>): Promise<void> {
  if (!accountId) return;
  const entries = Object.entries({ ...patch, updated_at: patch.updated_at ?? Date.now() })
    .filter(([key, value]) => queueUploadColumns.has(key) && value !== undefined);
  if (!entries.length) return;
  const db = await getDatabase();
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  await db.runAsync(`UPDATE queue_uploads SET ${assignments} WHERE id = ? AND account_id = ?`, ...entries.map(([, value]) => value as string | number | null), id, accountId);
}

export async function removeQueueUpload(id: string, accountId: string | null): Promise<void> {
  if (!accountId) return;
  const db = await getDatabase();
  await db.runAsync("DELETE FROM queue_uploads WHERE id = ? AND account_id = ?", id, accountId);
}

export async function replaceQueueParts(uploadId: string, accountId: string | null, parts: QueuePart[]): Promise<void> {
  if (!accountId) return;
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const owner = await db.getFirstAsync<{ id: string }>("SELECT id FROM queue_uploads WHERE id = ? AND account_id = ?", uploadId, accountId);
    if (!owner) return;
    await db.runAsync("DELETE FROM queue_parts WHERE queue_id = ?", uploadId);
    for (const part of parts) {
      await db.runAsync(
        `INSERT INTO queue_parts (queue_id,part_number,byte_start,byte_end,etag,state,retry_count,updated_at)
          VALUES (?,?,?,?,?,?,?,?)`,
        part.queue_id,
        part.part_number,
        part.byte_start,
        part.byte_end,
        part.etag,
        part.state,
        part.retry_count,
        part.updated_at,
      );
    }
  });
}

export async function listQueueParts(uploadId: string, accountId: string | null): Promise<QueuePart[]> {
  if (!accountId) return [];
  const db = await getDatabase();
  return db.getAllAsync<QueuePart>("SELECT p.* FROM queue_parts p INNER JOIN queue_uploads u ON u.id = p.queue_id WHERE p.queue_id = ? AND u.account_id = ? ORDER BY p.part_number", uploadId, accountId);
}

export async function updateQueuePart(uploadId: string, accountId: string | null, partNumber: number, patch: Partial<QueuePart>): Promise<void> {
  if (!accountId) return;
  const entries = Object.entries({ ...patch, updated_at: patch.updated_at ?? Date.now() }).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const db = await getDatabase();
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  await db.runAsync(`UPDATE queue_parts SET ${assignments} WHERE queue_id = ? AND part_number = ? AND EXISTS (SELECT 1 FROM queue_uploads u WHERE u.id = queue_parts.queue_id AND u.account_id = ?)`, ...entries.map(([, value]) => value as string | number | null), uploadId, partNumber, accountId);
}

export async function resetStaleTransfers(accountId: string | null, staleBefore = Date.now() - 60_000): Promise<void> {
  if (!accountId) return;
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE queue_uploads SET state = 'queued', updated_at = ?
      WHERE account_id = ? AND state = 'uploading' AND updated_at < ?`,
    Date.now(),
    accountId,
    staleBefore,
  );
  await db.runAsync(
    `UPDATE queue_parts SET state = 'pending', updated_at = ?
      WHERE state = 'uploading' AND updated_at < ?
        AND EXISTS (SELECT 1 FROM queue_uploads u WHERE u.id = queue_parts.queue_id AND u.account_id = ?)`,
    Date.now(),
    staleBefore,
    accountId,
  );
}
