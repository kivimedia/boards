-- Migration 056: Venues table
-- Tracks event venues for friendor email outreach and capacity awareness

CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT DEFAULT 'NC',
  contact_name TEXT,
  contact_email TEXT,
  venue_type TEXT, -- hotel, event_space, church, school, corporate, park, etc.
  friendor_email_sent BOOLEAN DEFAULT false,
  friendor_email_sent_at TIMESTAMPTZ,
  relationship_status TEXT DEFAULT 'new', -- new, contacted, active_partner, inactive
  source TEXT, -- booked_event, referral, research
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venues_select" ON venues FOR SELECT TO authenticated USING (true);
CREATE POLICY "venues_insert" ON venues FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "venues_update" ON venues FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "venues_delete" ON venues FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_relationship ON venues(relationship_status);
CREATE INDEX IF NOT EXISTS idx_venues_friendor_sent ON venues(friendor_email_sent) WHERE friendor_email_sent = false;

-- Auto-update updated_at
CREATE TRIGGER set_venues_updated_at
  BEFORE UPDATE ON venues
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE venues;
