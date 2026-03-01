-- Migration 076: Add 'analyzed' status for Fathom AI analysis pipeline
-- Also adds 'fathom_transcript' to knowledge_embeddings source types

ALTER TABLE fathom_recordings DROP CONSTRAINT IF EXISTS fathom_recordings_processing_status_check;
ALTER TABLE fathom_recordings ADD CONSTRAINT fathom_recordings_processing_status_check
  CHECK (processing_status IN ('pending', 'processing', 'matched', 'needs_review', 'analyzed', 'error'));
