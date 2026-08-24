ALTER TABLE shows ADD COLUMN public_token TEXT;

CREATE UNIQUE INDEX shows_public_token
  ON shows(public_token)
  WHERE public_token IS NOT NULL;
