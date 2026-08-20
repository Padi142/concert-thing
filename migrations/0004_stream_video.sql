ALTER TABLE media_items ADD COLUMN stream_uid TEXT;
ALTER TABLE media_items ADD COLUMN stream_status TEXT;
ALTER TABLE media_items ADD COLUMN stream_source_token TEXT;
ALTER TABLE media_items ADD COLUMN stream_error TEXT;
CREATE UNIQUE INDEX idx_media_stream_uid ON media_items(stream_uid) WHERE stream_uid IS NOT NULL;
CREATE UNIQUE INDEX idx_media_stream_source_token ON media_items(stream_source_token) WHERE stream_source_token IS NOT NULL;
