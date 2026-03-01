-- Migration 075: Shift current_phase for in-progress PageForge builds
-- The auto_name phase was inserted at index 1, pushing all subsequent phases up by 1.
-- Builds that have already passed preflight (phase 0) need their current_phase incremented.

UPDATE pageforge_builds
SET current_phase = current_phase + 1
WHERE current_phase >= 1
  AND status NOT IN ('published', 'failed', 'cancelled');
