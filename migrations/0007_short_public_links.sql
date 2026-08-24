-- Existing share tokens were already random. Keeping their first six characters
-- makes every current Show link short while preserving a fresh token per Show.
UPDATE shows
SET public_token = substr(public_token, 1, 6)
WHERE public_token IS NOT NULL AND length(public_token) != 6;
