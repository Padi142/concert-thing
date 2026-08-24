ALTER TABLE media_items ADD COLUMN public_token TEXT;

CREATE UNIQUE INDEX media_items_public_token
  ON media_items(public_token)
  WHERE public_token IS NOT NULL;
