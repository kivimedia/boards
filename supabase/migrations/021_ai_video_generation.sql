-- Migration 021: AI Video Generation (P3.3)
-- Sora 2 + Veo 3 text-to-video, image-to-video

-- ============================================================================
-- AI VIDEO GENERATIONS
-- ============================================================================
CREATE TABLE ai_video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('sora', 'veo')),
  mode TEXT NOT NULL CHECK (mode IN ('text_to_video', 'image_to_video', 'start_end_frame')),
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  -- settings: { duration: number, aspect_ratio: string, resolution: string, fps: number, style?: string }
  source_image_url TEXT, -- for image_to_video / start_end_frame
  end_image_url TEXT, -- for start_end_frame
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  output_urls TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_url TEXT,
  storage_path TEXT,
  error_message TEXT,
  generation_time_ms INTEGER,
  estimated_cost NUMERIC(10,4),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_gen_card ON ai_video_generations(card_id);
CREATE INDEX idx_video_gen_user ON ai_video_generations(user_id);
CREATE INDEX idx_video_gen_status ON ai_video_generations(status);
CREATE INDEX idx_video_gen_provider ON ai_video_generations(provider);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE ai_video_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_gen_select" ON ai_video_generations FOR SELECT TO authenticated USING (true);
CREATE POLICY "video_gen_insert" ON ai_video_generations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "video_gen_update" ON ai_video_generations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "video_gen_delete" ON ai_video_generations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_video_gen_updated_at
  BEFORE UPDATE ON ai_video_generations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
