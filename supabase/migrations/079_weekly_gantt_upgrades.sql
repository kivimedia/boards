-- 079: Weekly Gantt planner upgrades
-- - client_team_members table for assigning agency team to clients
-- - day_labels / day_colors on weekly plans for per-day customization

-- 1. Client-team assignment table
CREATE TABLE IF NOT EXISTS client_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, user_id)
);

ALTER TABLE client_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage client team"
  ON client_team_members FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 2. Day customization columns on weekly plans
ALTER TABLE client_weekly_plans
  ADD COLUMN IF NOT EXISTS day_labels JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS day_colors JSONB DEFAULT '{}';

-- day_labels example: {"1": "Sprint start", "3": "Review"}
-- day_colors example: {"1": "#fff3e0", "5": "#e8f5e9"}
-- Keys are day indices: 0 = weekly/unassigned, 1-7 = Mon-Sun
