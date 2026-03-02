-- Add onboarding flag to profiles for client users
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS needs_onboarding BOOLEAN DEFAULT true;

-- Existing users don't need onboarding
UPDATE profiles SET needs_onboarding = false WHERE needs_onboarding = true;
