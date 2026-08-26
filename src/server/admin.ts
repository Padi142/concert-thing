import type { AuthContext } from "./auth";
import type { Env } from "./env";
import { body, HttpError, json, text } from "./http";
import { getStorageQuota } from "./storage";

export type AdminUserSummary = {
  userId: string;
  plan: { key: string; name: string };
  allowanceBytes: number;
  promotionBytes: number;
  effectiveQuotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  uploadCount: number;
  uploadBytes: number;
};

type AdminUserRow = {
  owner_id: string;
  plan_key: string;
  plan_name: string;
  allowance_bytes: number;
  grant_bytes: number | null;
  used_bytes: number | null;
  reserved_bytes: number | null;
  upload_count: number | null;
  upload_bytes: number | null;
};

const adminUsersQuery = `
  WITH known_users AS (
    SELECT owner_id FROM owner_storage
    UNION
    SELECT owner_id FROM media_items WHERE owner_id IS NOT NULL
  )
  SELECT
    users.owner_id,
    plans.key AS plan_key,
    plans.name AS plan_name,
    plans.allowance_bytes,
    COALESCE(owner_storage.used_bytes, 0) AS used_bytes,
    COALESCE(owner_storage.reserved_bytes, 0) AS reserved_bytes,
    COALESCE((
      SELECT SUM(grant_row.byte_amount)
      FROM storage_grants grant_row
      WHERE grant_row.owner_id = users.owner_id
        AND (grant_row.activates_at IS NULL OR grant_row.activates_at <= ?)
        AND (grant_row.expires_at IS NULL OR grant_row.expires_at > ?)
        AND grant_row.revoked_at IS NULL
    ), 0) AS grant_bytes,
    COALESCE((
      SELECT COUNT(*)
      FROM media_items media
      WHERE media.owner_id = users.owner_id
        AND media.status = 'ready'
        AND media.deletion_started_at IS NULL
    ), 0) AS upload_count,
    COALESCE((
      SELECT SUM(media.byte_size)
      FROM media_items media
      WHERE media.owner_id = users.owner_id
        AND media.status = 'ready'
        AND media.deletion_started_at IS NULL
    ), 0) AS upload_bytes
  FROM known_users users
  LEFT JOIN owner_storage ON owner_storage.owner_id = users.owner_id
  JOIN storage_plans plans ON plans.key = COALESCE(owner_storage.plan_key, 'free')
  ORDER BY users.owner_id COLLATE NOCASE
`;

function summaryFromRow(row: AdminUserRow): AdminUserSummary {
  const allowanceBytes = Number(row.allowance_bytes);
  const promotionBytes = Number(row.grant_bytes ?? 0);
  return {
    userId: row.owner_id,
    plan: { key: row.plan_key, name: row.plan_name },
    allowanceBytes,
    promotionBytes,
    effectiveQuotaBytes: allowanceBytes + promotionBytes,
    usedBytes: Number(row.used_bytes ?? 0),
    reservedBytes: Number(row.reserved_bytes ?? 0),
    uploadCount: Number(row.upload_count ?? 0),
    uploadBytes: Number(row.upload_bytes ?? 0),
  };
}

async function isAdmin(db: D1Database, userId: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS present FROM admin_users WHERE user_id = ?").bind(userId).first());
}

export async function requireAdmin(db: D1Database, auth: AuthContext): Promise<void> {
  if (!await isAdmin(db, auth.userId)) throw new HttpError(403, "Administrator access is required");
}

export async function adminStatus(env: Env, auth: AuthContext): Promise<Response> {
  return json({ isAdmin: await isAdmin(env.DB, auth.userId) });
}

export async function listAdminUsers(env: Env, auth: AuthContext, at = new Date().toISOString()): Promise<Response> {
  await requireAdmin(env.DB, auth);
  const result = await env.DB.prepare(adminUsersQuery).bind(at, at).all<AdminUserRow>();
  return json(result.results.map(summaryFromRow));
}

export async function createPromotion(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  await requireAdmin(env.DB, auth);
  const input = await body(request);
  const userId = text(input.userId, "userId");
  const additionalBytes = Number(input.additionalBytes);
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes <= 0) {
    throw new HttpError(400, "additionalBytes must be a positive safe integer");
  }
  const reason = input.reason === undefined ? "Admin promotion" : text(input.reason, "reason");
  if (reason.length > 160) throw new HttpError(400, "reason must be 160 characters or fewer");

  const target = await env.DB.prepare(`
    SELECT 1 AS present FROM owner_storage WHERE owner_id = ?
    UNION
    SELECT 1 AS present FROM media_items WHERE owner_id = ?
    LIMIT 1
  `).bind(userId, userId).first();
  if (!target) throw new HttpError(404, "User is not present in the archive");

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO storage_grants (
      id, owner_id, byte_amount, reason, source, external_reference, created_at
    ) VALUES (?, ?, ?, ?, 'admin_panel', ?, ?)
  `).bind(id, userId, additionalBytes, reason, id, createdAt).run();

  return json({
    id,
    userId,
    additionalBytes,
    reason,
    storage: await getStorageQuota(env.DB, userId, createdAt),
  }, 201);
}
