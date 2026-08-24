ALTER TABLE media_items ADD COLUMN client_upload_id TEXT;

CREATE UNIQUE INDEX idx_media_client_upload_id
  ON media_items(client_upload_id)
  WHERE client_upload_id IS NOT NULL;
