-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- Digest email configurations
CREATE TABLE IF NOT EXISTS digest_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  include_assigned boolean DEFAULT true,
  include_overdue boolean DEFAULT true,
  include_mentions boolean DEFAULT true,
  include_completed boolean DEFAULT false,
  send_time time DEFAULT '09:00:00',
  enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE digest_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own digest config"
  ON digest_configs FOR ALL
  USING (auth.uid() = user_id);
