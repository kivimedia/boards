-- Migration 077: Add toggle to include Fathom meetings in weekly client updates
ALTER TABLE client_meeting_configs ADD COLUMN IF NOT EXISTS include_fathom_meetings BOOLEAN NOT NULL DEFAULT true;
