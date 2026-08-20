ALTER TABLE media_items ADD COLUMN captured_at_source TEXT
  CHECK (captured_at_source IN ('file_modified', 'embedded_metadata'));

ALTER TABLE media_items ADD COLUMN assignment_method TEXT
  CHECK (assignment_method IN ('automatic', 'owner'));

CREATE INDEX media_items_capture_time ON media_items(status, captured_at, assignment_method);
