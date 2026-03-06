-- Allow multiple meeting configs per client (was 1:1, now 1:many)
DROP INDEX IF EXISTS idx_cmc_client;

-- Regular index for query performance (non-unique)
CREATE INDEX IF NOT EXISTS idx_cmc_client_id ON client_meeting_configs (client_id);
