-- PageForge v2: Dual Figma input (desktop + mobile), build stages, animation support

-- Mobile Figma file support
ALTER TABLE pageforge_builds ADD COLUMN IF NOT EXISTS figma_file_key_mobile TEXT;
ALTER TABLE pageforge_builds ADD COLUMN IF NOT EXISTS figma_node_ids_mobile TEXT[] NOT NULL DEFAULT '{}';

-- Track which stage the build is in (desktop vs mobile optimization)
ALTER TABLE pageforge_builds ADD COLUMN IF NOT EXISTS build_stage TEXT NOT NULL DEFAULT 'desktop'
  CHECK (build_stage IN ('desktop', 'mobile', 'complete'));

-- Separate mobile VQA score (when compared against mobile Figma, not desktop)
ALTER TABLE pageforge_builds ADD COLUMN IF NOT EXISTS vqa_score_mobile_figma NUMERIC(5,2);

-- Animation plan support
ALTER TABLE pageforge_builds ADD COLUMN IF NOT EXISTS has_animation_plan BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pageforge_builds ADD COLUMN IF NOT EXISTS animation_figma_node TEXT;

-- Whether to pause at the element mapping gate
ALTER TABLE pageforge_builds ADD COLUMN IF NOT EXISTS review_element_mappings BOOLEAN NOT NULL DEFAULT false;
