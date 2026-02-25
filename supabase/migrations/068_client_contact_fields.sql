-- Migration 068: Add email, phone, location to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS location TEXT;
