-- Probability (0-1) that a pending candidate was performed at its Media Item's
-- Show, as judged by the decision model. NULL until judged, and whenever the
-- Media Item has no Show to judge against.
ALTER TABLE song_matches ADD COLUMN plausibility REAL
  CHECK (plausibility IS NULL OR plausibility BETWEEN 0 AND 1);
