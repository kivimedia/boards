-- PageForge v2: Element mapping knowledge base and per-build mapping decisions

-- Knowledge base: stores approved Figma -> Divi 5 mappings that improve over time
CREATE TABLE IF NOT EXISTS pageforge_element_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_profile_id UUID REFERENCES pageforge_site_profiles(id) ON DELETE CASCADE,

  -- What was in Figma
  figma_element_type TEXT NOT NULL,
  figma_element_name TEXT,
  figma_properties JSONB NOT NULL DEFAULT '{}',

  -- What Divi 5 module was chosen
  divi5_module TEXT NOT NULL,
  divi5_config JSONB NOT NULL DEFAULT '{}',

  -- Learning data
  was_overridden BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  confidence_score NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  times_approved INTEGER NOT NULL DEFAULT 0,
  times_overridden INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pf_elem_map_site ON pageforge_element_mappings(site_profile_id);
CREATE INDEX IF NOT EXISTS idx_pf_elem_map_type ON pageforge_element_mappings(figma_element_type);

-- Per-build mapping decisions (links a build's sections to approved/overridden mappings)
CREATE TABLE IF NOT EXISTS pageforge_build_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES pageforge_builds(id) ON DELETE CASCADE,
  section_index INTEGER NOT NULL,
  section_name TEXT NOT NULL,
  figma_element_type TEXT NOT NULL,

  -- AI proposal
  proposed_divi5_module TEXT NOT NULL,
  proposed_config JSONB NOT NULL DEFAULT '{}',
  proposal_reasoning TEXT,

  -- User decision
  decision TEXT CHECK (decision IN ('approved', 'overridden', 'pending')) NOT NULL DEFAULT 'pending',
  final_divi5_module TEXT,
  final_config JSONB,
  override_reason TEXT,
  decided_by UUID,
  decided_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pf_build_mappings_build ON pageforge_build_mappings(build_id);

-- RLS
ALTER TABLE pageforge_element_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pageforge_build_mappings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pageforge_element_mappings' AND policyname = 'Authenticated users can manage element mappings'
  ) THEN
    CREATE POLICY "Authenticated users can manage element mappings"
      ON pageforge_element_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pageforge_build_mappings' AND policyname = 'Authenticated users can manage build mappings'
  ) THEN
    CREATE POLICY "Authenticated users can manage build mappings"
      ON pageforge_build_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
