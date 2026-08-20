PRAGMA foreign_keys = ON;

CREATE TABLE shows (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  venue TEXT NOT NULL,
  locality TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE show_artists (
  show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  PRIMARY KEY (show_id, artist_id)
);

CREATE TABLE media_items (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  captured_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'ready', 'failed')),
  upload_id TEXT,
  show_id TEXT REFERENCES shows(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX media_items_inbox ON media_items(status, show_id, created_at);
