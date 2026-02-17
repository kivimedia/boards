-- QA baselines for visual regression testing
CREATE TABLE IF NOT EXISTS qa_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL,
  url text NOT NULL,
  viewport text NOT NULL CHECK (viewport IN ('desktop', 'tablet', 'mobile')),
  screenshot_path text NOT NULL,
  approved_by uuid,
  approved_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(card_id, url, viewport)
);

ALTER TABLE qa_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage baselines"
  ON qa_baselines FOR ALL
  USING (auth.role() = 'authenticated');

-- QA monitoring schedules
CREATE TABLE IF NOT EXISTS qa_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL,
  url text NOT NULL,
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'biweekly')),
  enabled boolean DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  notify_user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(card_id, url)
);

ALTER TABLE qa_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage schedules"
  ON qa_schedules FOR ALL
  USING (auth.role() = 'authenticated');
