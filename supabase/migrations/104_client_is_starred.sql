-- Add is_starred column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;
