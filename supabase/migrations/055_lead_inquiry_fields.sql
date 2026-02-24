-- Migration 055: Extend cards table with balloon-business lead/inquiry fields
-- These columns power the lead pipeline, follow-up tracking, and "Where I Am" features

ALTER TABLE cards ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS venue_name TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS venue_city TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(10,2);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_separator BOOLEAN DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS didnt_book_reason TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS didnt_book_sub_reason TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS last_touched_at TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS last_touched_by UUID REFERENCES auth.users;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cards_event_date ON cards(event_date);
CREATE INDEX IF NOT EXISTS idx_cards_is_separator ON cards(is_separator) WHERE is_separator = true;
CREATE INDEX IF NOT EXISTS idx_cards_follow_up_date ON cards(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_lead_source ON cards(lead_source) WHERE lead_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_last_touched_at ON cards(last_touched_at);
CREATE INDEX IF NOT EXISTS idx_cards_client_email ON cards(client_email) WHERE client_email IS NOT NULL;
