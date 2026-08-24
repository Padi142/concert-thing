-- Clerk tenancy. NULL owner_id is intentionally retained for the one-time
-- migration endpoint; all newly-created private rows are assigned a user ID.
ALTER TABLE shows ADD COLUMN owner_id TEXT;
ALTER TABLE media_items ADD COLUMN owner_id TEXT;

-- The old indexes enforced uniqueness across every user. Replace them with
-- tenant-local uniqueness after adding owner_id. Existing rows remain intact.
DROP INDEX IF EXISTS media_items_video_content_hash;
DROP INDEX IF EXISTS idx_media_client_upload_id;

CREATE UNIQUE INDEX media_items_video_owner_content_hash
  ON media_items(owner_id, content_hash)
  WHERE owner_id IS NOT NULL AND content_hash IS NOT NULL AND status IN ('uploading', 'ready');

CREATE UNIQUE INDEX media_items_owner_client_upload_id
  ON media_items(owner_id, client_upload_id)
  WHERE owner_id IS NOT NULL AND client_upload_id IS NOT NULL;

CREATE INDEX shows_owner ON shows(owner_id, starts_at DESC);
CREATE INDEX media_items_owner ON media_items(owner_id, status, created_at DESC);
CREATE INDEX media_items_owner_show ON media_items(owner_id, show_id, status);

-- A single row is the claim guard. It prevents a later signed-in user from
-- taking ownership of the pre-Clerk archive after the first claim succeeds.
CREATE TABLE archive_legacy_claim (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);
