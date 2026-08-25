export const FREE_PLAN_KEY = "free";
export const UPLOAD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type StoragePlan = {
  key: string;
  name: string;
};

export type StorageSnapshot = {
  effectiveQuotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  availableBytes: number;
  overQuota: boolean;
  plan: StoragePlan;
};

type StorageRow = {
  allowance_bytes: number;
  grant_bytes: number | null;
  used_bytes: number;
  reserved_bytes: number;
  plan_key: string;
  plan_name: string;
};

type OwnerCounterRow = {
  owner_id: string;
  used_bytes: number | null;
  reserved_bytes: number | null;
};

type OwnerStorageRow = {
  owner_id: string;
  used_bytes: number;
  reserved_bytes: number;
};

export class StorageQuotaExceeded extends Error {
  constructor(
    readonly requiredBytes: number,
    readonly storage: StorageSnapshot,
  ) {
    super("Storage quota exceeded");
    this.name = "StorageQuotaExceeded";
  }
}

function timestamp(value?: string): string {
  return value ?? new Date().toISOString();
}

function changed(result: D1Result): boolean {
  return Number(result.meta.changes ?? 0) > 0;
}

function snapshotFromRow(row: StorageRow): StorageSnapshot {
  const allowance = Number(row.allowance_bytes);
  const grants = Number(row.grant_bytes ?? 0);
  const used = Number(row.used_bytes);
  const reserved = Number(row.reserved_bytes);
  const effectiveQuotaBytes = allowance + grants;
  const committedBytes = used + reserved;
  return {
    effectiveQuotaBytes,
    usedBytes: used,
    reservedBytes: reserved,
    availableBytes: Math.max(0, effectiveQuotaBytes - committedBytes),
    overQuota: committedBytes > effectiveQuotaBytes,
    plan: { key: row.plan_key, name: row.plan_name },
  };
}

/** Ensure a newly authenticated Owner has one accounting row. */
export async function ensureOwnerStorage(
  db: D1Database,
  ownerId: string,
  at?: string,
): Promise<void> {
  const now = timestamp(at);
  await db.prepare(`
    INSERT INTO owner_storage (owner_id, plan_key, used_bytes, reserved_bytes, created_at, updated_at)
    VALUES (?, ?, 0, 0, ?, ?)
    ON CONFLICT(owner_id) DO NOTHING
  `).bind(ownerId, FREE_PLAN_KEY, now, now).run();
}

/**
 * Build the initialization statement used by the one-time legacy claim.  It
 * runs after ownership updates in the same D1 batch, so claimed rows and
 * their counters become visible together.
 */
export function ownerStorageInitializationStatement(
  db: D1Database,
  ownerId: string,
  at?: string,
): D1PreparedStatement {
  const now = timestamp(at);
  return db.prepare(`
    INSERT INTO owner_storage (
      owner_id, plan_key, used_bytes, reserved_bytes, created_at, updated_at
    )
    SELECT ?, ?,
      COALESCE(SUM(CASE WHEN status = 'ready' THEN byte_size ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status = 'uploading' THEN byte_size ELSE 0 END), 0),
      ?, ?
    FROM media_items
    WHERE owner_id = ?
    ON CONFLICT(owner_id) DO UPDATE SET
      used_bytes = excluded.used_bytes,
      reserved_bytes = excluded.reserved_bytes,
      updated_at = excluded.updated_at
  `).bind(ownerId, FREE_PLAN_KEY, now, now, ownerId);
}

/** Read the effective Storage Allowance and current usage for one Owner. */
export async function getStorageQuota(
  db: D1Database,
  ownerId: string,
  at?: string,
): Promise<StorageSnapshot> {
  const now = timestamp(at);
  await ensureOwnerStorage(db, ownerId, now);
  const row = await db.prepare(`
    SELECT
      p.allowance_bytes,
      COALESCE((
        SELECT SUM(g.byte_amount)
        FROM storage_grants g
        WHERE g.owner_id = os.owner_id
          AND (g.activates_at IS NULL OR g.activates_at <= ?)
          AND (g.expires_at IS NULL OR g.expires_at > ?)
          AND g.revoked_at IS NULL
      ), 0) AS grant_bytes,
      os.used_bytes,
      os.reserved_bytes,
      p.key AS plan_key,
      p.name AS plan_name
    FROM owner_storage os
    JOIN storage_plans p ON p.key = os.plan_key
    WHERE os.owner_id = ?
  `).bind(now, now, ownerId).first<StorageRow>();
  if (!row) throw new Error("Storage plan is not configured");
  return snapshotFromRow(row);
}

/**
 * Atomically reserve an upload's declared bytes.  The conditional UPDATE is
 * the enforcement boundary: concurrent requests cannot both pass a stale
 * read of the same Owner's available capacity.
 */
export async function reserveStorage(
  db: D1Database,
  ownerId: string,
  bytes: number,
  at?: string,
): Promise<StorageSnapshot> {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new RangeError("Storage reservation must be a positive integer");
  }
  const now = timestamp(at);
  await ensureOwnerStorage(db, ownerId, now);
  const result = await db.prepare(`
    UPDATE owner_storage
    SET reserved_bytes = reserved_bytes + ?,
        updated_at = ?
    WHERE owner_id = ?
      AND used_bytes + reserved_bytes + ? <= (
        SELECT p.allowance_bytes + COALESCE((
          SELECT SUM(g.byte_amount)
          FROM storage_grants g
          WHERE g.owner_id = owner_storage.owner_id
            AND (g.activates_at IS NULL OR g.activates_at <= ?)
            AND (g.expires_at IS NULL OR g.expires_at > ?)
            AND g.revoked_at IS NULL
        ), 0)
        FROM storage_plans p
        WHERE p.key = owner_storage.plan_key
      )
  `).bind(bytes, now, ownerId, bytes, now, now).run();
  if (!changed(result)) {
    throw new StorageQuotaExceeded(bytes, await getStorageQuota(db, ownerId, now));
  }
  return getStorageQuota(db, ownerId, now);
}

/** Release a reservation made before the Media Item row was persisted. */
export async function releaseUnpersistedStorage(
  db: D1Database,
  ownerId: string,
  bytes: number,
  at?: string,
): Promise<boolean> {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return false;
  const result = await db.prepare(`
    UPDATE owner_storage
    SET reserved_bytes = reserved_bytes - ?,
        updated_at = ?
    WHERE owner_id = ? AND reserved_bytes >= ?
  `).bind(bytes, timestamp(at), ownerId, bytes).run();
  return changed(result);
}

export type ReconciliationResult = {
  ownersChecked: number;
  ownersRepaired: number;
};

/**
 * Repair counters from D1 Media Item states.  It intentionally does not
 * delete rows for missing R2 objects; the deletion worker must establish that
 * cross-system fact before releasing the Owner's committed bytes.
 */
export async function reconcileStorage(
  db: D1Database,
  at?: string,
): Promise<ReconciliationResult> {
  const now = timestamp(at);
  const counters = await db.prepare(`
    SELECT owner_id,
      SUM(CASE WHEN status = 'ready' THEN byte_size ELSE 0 END) AS used_bytes,
      SUM(CASE WHEN status = 'uploading' THEN byte_size ELSE 0 END) AS reserved_bytes
    FROM media_items
    WHERE owner_id IS NOT NULL
    GROUP BY owner_id
  `).all<OwnerCounterRow>();
  const existing = await db.prepare(
    "SELECT owner_id, used_bytes, reserved_bytes FROM owner_storage",
  ).all<OwnerStorageRow>();
  const expected = new Map<string, { usedBytes: number; reservedBytes: number }>();
  for (const row of counters.results) {
    expected.set(row.owner_id, {
      usedBytes: Number(row.used_bytes ?? 0),
      reservedBytes: Number(row.reserved_bytes ?? 0),
    });
  }
  for (const row of existing.results) {
    if (!expected.has(row.owner_id)) expected.set(row.owner_id, { usedBytes: 0, reservedBytes: 0 });
  }

  for (const ownerId of expected.keys()) await ensureOwnerStorage(db, ownerId, now);
  const statements: D1PreparedStatement[] = [];
  let ownersRepaired = 0;
  const current = new Map(existing.results.map(row => [row.owner_id, row]));
  for (const [ownerId, values] of expected) {
    const previous = current.get(ownerId);
    if (!previous || previous.used_bytes !== values.usedBytes || previous.reserved_bytes !== values.reservedBytes) {
      ownersRepaired += 1;
      statements.push(db.prepare(`
        UPDATE owner_storage
        SET used_bytes = ?, reserved_bytes = ?, updated_at = ?
        WHERE owner_id = ?
      `).bind(values.usedBytes, values.reservedBytes, now, ownerId));
      statements.push(db.prepare(`
        INSERT INTO owner_storage_repair_log (
          owner_id, repaired_at, previous_used_bytes, previous_reserved_bytes,
          repaired_used_bytes, repaired_reserved_bytes
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_id) DO UPDATE SET
          repaired_at = excluded.repaired_at,
          previous_used_bytes = excluded.previous_used_bytes,
          previous_reserved_bytes = excluded.previous_reserved_bytes,
          repaired_used_bytes = excluded.repaired_used_bytes,
          repaired_reserved_bytes = excluded.repaired_reserved_bytes
      `).bind(
        ownerId,
        now,
        previous?.used_bytes ?? 0,
        previous?.reserved_bytes ?? 0,
        values.usedBytes,
        values.reservedBytes,
      ));
    }
  }
  if (statements.length) await db.batch(statements);
  return { ownersChecked: expected.size, ownersRepaired };
}
