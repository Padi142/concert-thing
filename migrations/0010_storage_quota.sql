-- Storage accounting is kept in D1. Media rows remain the source of truth for
-- reconciliation, while owner_storage provides atomic reservation counters.

-- The original media_items status CHECK is intentionally preserved. A
-- non-null deletion_started_at is the durable "deleting" state; keeping the
-- existing status value avoids rebuilding a table with dependent foreign keys.
ALTER TABLE media_items ADD COLUMN upload_activity_at TEXT;
ALTER TABLE media_items ADD COLUMN deletion_started_at TEXT;
ALTER TABLE media_items ADD COLUMN deletion_error TEXT;

UPDATE media_items
SET upload_activity_at = created_at
WHERE status = 'uploading' AND upload_activity_at IS NULL;

CREATE INDEX media_items_upload_activity ON media_items(status, upload_activity_at);
CREATE INDEX media_items_deleting ON media_items(status, deletion_started_at);

CREATE TABLE storage_plans (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  allowance_bytes INTEGER NOT NULL CHECK (allowance_bytes >= 0)
);

INSERT INTO storage_plans (key, name, allowance_bytes) VALUES
  ('free', 'Free', 10000000000),
  ('pro', 'Pro', 100000000000);

CREATE TABLE owner_storage (
  owner_id TEXT PRIMARY KEY,
  plan_key TEXT NOT NULL REFERENCES storage_plans(key) DEFAULT 'free',
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE storage_grants (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  byte_amount INTEGER NOT NULL CHECK (byte_amount > 0),
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  external_reference TEXT,
  created_at TEXT NOT NULL,
  activates_at TEXT,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE INDEX storage_grants_active
  ON storage_grants(owner_id, activates_at, expires_at, revoked_at);

CREATE UNIQUE INDEX storage_grants_external_reference
  ON storage_grants(owner_id, source, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE TABLE upload_expirations (
  media_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  expired_at TEXT NOT NULL
);

CREATE INDEX upload_expirations_owner ON upload_expirations(owner_id, expired_at);

-- Stream is a derived copy. Keep failed cleanup work after the original row
-- is gone so it can never retain Owner quota.
CREATE TABLE stream_cleanup (
  stream_uid TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT
);

CREATE TABLE owner_storage_repair_log (
  owner_id TEXT PRIMARY KEY,
  repaired_at TEXT NOT NULL,
  previous_used_bytes INTEGER NOT NULL,
  previous_reserved_bytes INTEGER NOT NULL,
  repaired_used_bytes INTEGER NOT NULL,
  repaired_reserved_bytes INTEGER NOT NULL
);

-- Existing claimed Owners get the default Free plan and counters derived from
-- existing Media Item states. Rows with no owner remain for the legacy claim.
INSERT INTO owner_storage (
  owner_id, plan_key, used_bytes, reserved_bytes, created_at, updated_at
)
SELECT
  owner_id,
  'free',
  COALESCE(SUM(CASE WHEN status = 'ready' THEN byte_size ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN status = 'uploading' THEN byte_size ELSE 0 END), 0),
  MIN(created_at),
  MIN(created_at)
FROM media_items
WHERE owner_id IS NOT NULL
GROUP BY owner_id;

-- A status transition is the accounting boundary. The media handler changes
-- status only after the R2 operation is known to have succeeded.
CREATE TRIGGER media_items_accounting_commit
AFTER UPDATE OF status ON media_items
WHEN OLD.owner_id IS NOT NULL
  AND OLD.status = 'uploading'
  AND NEW.status = 'ready'
  AND NEW.deletion_started_at IS NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM owner_storage
    WHERE owner_id = NEW.owner_id AND reserved_bytes >= OLD.byte_size
  ) THEN RAISE(ABORT, 'storage reservation is missing') END);

  UPDATE owner_storage
  SET reserved_bytes = reserved_bytes - OLD.byte_size,
      used_bytes = used_bytes + NEW.byte_size,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE owner_id = NEW.owner_id;
END;

CREATE TRIGGER media_items_accounting_delete_guard
BEFORE DELETE ON media_items
WHEN OLD.owner_id IS NOT NULL
BEGIN
  SELECT (CASE
    WHEN OLD.status = 'uploading' AND NOT EXISTS (
      SELECT 1 FROM owner_storage
      WHERE owner_id = OLD.owner_id AND reserved_bytes >= OLD.byte_size
    ) THEN RAISE(ABORT, 'storage reservation is missing')
    WHEN OLD.status = 'ready' AND NOT EXISTS (
      SELECT 1 FROM owner_storage
      WHERE owner_id = OLD.owner_id AND used_bytes >= OLD.byte_size
    ) THEN RAISE(ABORT, 'storage usage is missing')
  END);
END;

CREATE TRIGGER media_items_accounting_delete
AFTER DELETE ON media_items
WHEN OLD.owner_id IS NOT NULL
BEGIN
  UPDATE owner_storage
  SET reserved_bytes = (CASE WHEN OLD.status = 'uploading'
    THEN reserved_bytes - OLD.byte_size ELSE reserved_bytes END),
      used_bytes = (CASE WHEN OLD.status = 'ready'
    THEN used_bytes - OLD.byte_size ELSE used_bytes END),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE owner_id = OLD.owner_id;
END;
