ALTER TABLE media_items ADD COLUMN duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0);

CREATE TABLE songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  primary_artist TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  normalized_artist TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (normalized_title, normalized_artist)
);

CREATE TABLE recognition_jobs (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'preparing', 'submitted', 'processing', 'completed', 'no_match',
    'unsupported', 'budget_exhausted', 'failed'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 2),
  poll_failure_count INTEGER NOT NULL DEFAULT 0 CHECK (poll_failure_count BETWEEN 0 AND 2),
  provider_job_id TEXT,
  provider_upload_key TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX recognition_jobs_provider_id
  ON recognition_jobs(provider, provider_job_id)
  WHERE provider_job_id IS NOT NULL;
CREATE INDEX recognition_jobs_status ON recognition_jobs(status, updated_at);
CREATE INDEX recognition_jobs_media ON recognition_jobs(media_id, provider, created_at);

CREATE TABLE recognition_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES recognition_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 2),
  status TEXT NOT NULL CHECK (status IN ('started', 'submitted', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (job_id, attempt_number)
);

CREATE TABLE song_matches (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  recognition_job_id TEXT REFERENCES recognition_jobs(id) ON DELETE SET NULL,
  provider TEXT,
  provider_match_id TEXT,
  start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
  end_ms INTEGER CHECK (end_ms IS NULL OR end_ms >= start_ms),
  confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  candidate_title TEXT,
  candidate_artist TEXT,
  candidate_external_ids TEXT,
  review_state TEXT NOT NULL CHECK (review_state IN ('pending', 'confirmed', 'rejected', 'edited', 'manual')),
  song_id TEXT REFERENCES songs(id) ON DELETE SET NULL,
  owner_title TEXT,
  owner_artist TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (review_state IN ('pending', 'rejected') AND song_id IS NULL)
    OR (review_state IN ('confirmed', 'edited', 'manual') AND song_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX song_matches_provider_identity
  ON song_matches(media_id, provider, provider_match_id)
  WHERE provider_match_id IS NOT NULL;
CREATE INDEX song_matches_media_time ON song_matches(media_id, start_ms);
CREATE INDEX song_matches_song ON song_matches(song_id, review_state);
