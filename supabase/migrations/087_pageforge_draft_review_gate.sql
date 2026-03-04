-- Add draft review gate columns to pageforge_builds
ALTER TABLE pageforge_builds
  ADD COLUMN IF NOT EXISTS draft_gate_decision TEXT,
  ADD COLUMN IF NOT EXISTS draft_gate_feedback TEXT,
  ADD COLUMN IF NOT EXISTS draft_gate_decided_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS draft_gate_decided_at TIMESTAMPTZ;
