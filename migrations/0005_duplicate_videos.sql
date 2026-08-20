ALTER TABLE media_items ADD COLUMN content_hash TEXT;

CREATE UNIQUE INDEX media_items_video_content_hash
  ON media_items(content_hash)
  WHERE content_hash IS NOT NULL AND status IN ('uploading', 'ready');
