-- Orchestrator RPC functions for atomic job queue operations
-- Used by the outreach orchestrator to safely claim and process li_jobs

-- ============================================================================
-- acquire_next_li_job: Atomically claim the next pending job
-- Uses FOR UPDATE SKIP LOCKED to prevent double-processing
-- ============================================================================
CREATE OR REPLACE FUNCTION acquire_next_li_job(p_worker_id text, p_lock_duration interval DEFAULT '5 minutes')
RETURNS SETOF li_jobs AS $$
  UPDATE li_jobs
  SET locked_by = p_worker_id,
      lock_expires_at = now() + p_lock_duration,
      status = 'RUNNING',
      started_at = now(),
      attempts = attempts + 1
  WHERE id = (
    SELECT id FROM li_jobs
    WHERE (status = 'PENDING' OR (status = 'RUNNING' AND lock_expires_at < now()))
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;

-- ============================================================================
-- cleanup_stale_li_locks: Release jobs with expired locks
-- Returns the number of cleaned up jobs
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_stale_li_locks()
RETURNS integer AS $$
DECLARE
  cleaned integer;
BEGIN
  UPDATE li_jobs
  SET locked_by = NULL,
      lock_expires_at = NULL,
      status = 'PENDING'
  WHERE status = 'RUNNING'
    AND lock_expires_at < now()
    AND attempts < max_attempts;

  GET DIAGNOSTICS cleaned = ROW_COUNT;

  -- Mark exhausted jobs as FAILED
  UPDATE li_jobs
  SET status = 'FAILED',
      error_message = 'Max attempts reached after lock expiry',
      completed_at = now()
  WHERE status = 'RUNNING'
    AND lock_expires_at < now()
    AND attempts >= max_attempts;

  RETURN cleaned;
END;
$$ LANGUAGE plpgsql;
