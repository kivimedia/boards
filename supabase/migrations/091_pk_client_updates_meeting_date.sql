-- Add meeting date support to Client Updates tracker rows.
ALTER TABLE pk_client_updates
  ADD COLUMN IF NOT EXISTS meeting_date DATE;

CREATE INDEX IF NOT EXISTS idx_pk_client_updates_meeting_date
  ON pk_client_updates (meeting_date DESC);
