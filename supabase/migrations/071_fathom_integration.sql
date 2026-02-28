-- Migration 071: Fathom Video Intelligence integration
-- Stores meeting recordings from Fathom webhooks, participant identities, and meeting-participant links

-- ============================================================================
-- FATHOM RECORDINGS
-- ============================================================================
CREATE TABLE fathom_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fathom_recording_id BIGINT NOT NULL UNIQUE,
  title TEXT,
  meeting_title TEXT,
  share_url TEXT,
  fathom_url TEXT,
  duration_seconds INT,
  recorded_at TIMESTAMPTZ,
  recording_start_time TIMESTAMPTZ,
  recording_end_time TIMESTAMPTZ,
  transcript_language TEXT,
  transcript JSONB,
  fathom_summary TEXT,
  fathom_action_items JSONB,
  ai_summary TEXT,
  ai_action_items JSONB,
  calendar_invitees JSONB,
  recorded_by JSONB,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'matched', 'needs_review', 'error')),
  matched_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  matched_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  matched_by TEXT,
  error_message TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fathom_recordings_status ON fathom_recordings(processing_status);
CREATE INDEX idx_fathom_recordings_client ON fathom_recordings(matched_client_id);
CREATE INDEX idx_fathom_recordings_card ON fathom_recordings(matched_card_id);
CREATE INDEX idx_fathom_recordings_recorded_at ON fathom_recordings(recorded_at DESC);

-- ============================================================================
-- PARTICIPANT IDENTITIES (lookup table, grows over time)
-- ============================================================================
CREATE TABLE participant_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  display_name TEXT,
  fathom_speaker_name TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_name TEXT,
  source TEXT NOT NULL DEFAULT 'calendar_email'
    CHECK (source IN ('calendar_email', 'speaker_name', 'manual')),
  confidence TEXT NOT NULL DEFAULT 'high'
    CHECK (confidence IN ('high', 'medium', 'low')),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_participant_identities_email ON participant_identities(email) WHERE email IS NOT NULL;
CREATE INDEX idx_participant_identities_client ON participant_identities(client_id);

-- ============================================================================
-- MEETING PARTICIPANTS (junction table)
-- ============================================================================
CREATE TABLE meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES fathom_recordings(id) ON DELETE CASCADE,
  identity_id UUID REFERENCES participant_identities(id) ON DELETE SET NULL,
  speaker_display_name TEXT,
  speaker_email TEXT,
  is_external BOOLEAN DEFAULT true,
  speaker_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_participants_recording ON meeting_participants(recording_id);
CREATE INDEX idx_meeting_participants_identity ON meeting_participants(identity_id);

-- ============================================================================
-- ROUTING RULES (for Phase 2, but create table now to avoid another migration)
-- ============================================================================
CREATE TABLE fathom_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INT NOT NULL DEFAULT 0,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('participant', 'client_day', 'day', 'keyword', 'fallback')),
  conditions JSONB NOT NULL DEFAULT '{}',
  target_client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  target_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  match_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fathom_routing_rules_priority ON fathom_routing_rules(priority);

-- ============================================================================
-- CLIENT AI RULES (for Phase 3, create now)
-- ============================================================================
CREATE TABLE client_ai_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  rule_text TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'summary' CHECK (rule_type IN ('summary', 'action_items', 'tone', 'filter', 'general')),
  is_global BOOLEAN NOT NULL DEFAULT false,
  priority INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_ai_rules_client ON client_ai_rules(client_id);
