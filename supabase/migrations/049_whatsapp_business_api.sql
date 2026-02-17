-- Migration 049: WhatsApp Business API Support
-- Part of Phase 9.2: WhatsApp Integration Enhancement
-- Schema: profiles.role uses user_role enum (admin,department_lead,member,guest,client,observer)

-- Add delivery status tracking columns to whatsapp_messages
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image', 'video', 'document', 'audio'));

-- Unique index on external_id for idempotent webhook processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_external_id
  ON whatsapp_messages(external_id) WHERE external_id IS NOT NULL;

-- WhatsApp config table (API credentials, per-agency)
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  webhook_verify_token TEXT NOT NULL,
  business_account_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;

-- Only admin roles can view/modify config
DROP POLICY IF EXISTS "Admins can manage WhatsApp config" ON whatsapp_config;
CREATE POLICY "Admins can manage WhatsApp config"
  ON whatsapp_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );
