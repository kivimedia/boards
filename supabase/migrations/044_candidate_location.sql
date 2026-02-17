-- Add location field to podcast guest candidates
ALTER TABLE pga_candidates ADD COLUMN IF NOT EXISTS location text;
