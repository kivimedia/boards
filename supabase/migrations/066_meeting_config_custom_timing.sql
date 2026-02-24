-- Allow custom timing values (stored as text like '2_hours_before', '30_min_before', etc.)
ALTER TABLE client_meeting_configs DROP CONSTRAINT IF EXISTS client_meeting_configs_update_timing_check;
ALTER TABLE client_meeting_configs ADD CONSTRAINT client_meeting_configs_update_timing_check
  CHECK (update_timing IN ('30_min_before', '1_hour_before', '2_hours_before', '1_day_before', 'custom'));

-- Add custom_minutes column for arbitrary timing
ALTER TABLE client_meeting_configs
  ADD COLUMN IF NOT EXISTS custom_minutes INTEGER DEFAULT NULL;
