-- PageForge v2: New build status values for the expanded pipeline

-- Add new phase status values
-- Note: ALTER TYPE ... ADD VALUE IF NOT EXISTS requires separate statements
DO $$
BEGIN
  -- Element mapping gate
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'element_mapping_gate' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'element_mapping_gate';
  END IF;

  -- Mobile phases
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'mobile_markup_generation' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'mobile_markup_generation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'mobile_deploy' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'mobile_deploy';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'mobile_vqa_capture' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'mobile_vqa_capture';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'mobile_vqa_comparison' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'mobile_vqa_comparison';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'mobile_vqa_fix_loop' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'mobile_vqa_fix_loop';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'mobile_functional_qa' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'mobile_functional_qa';
  END IF;

  -- Animation phases
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'animation_detection' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'animation_detection';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'animation_implementation' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'animation_implementation';
  END IF;

  -- Final review gate (replaces developer_review_gate for side-by-side review)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'final_review_gate' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pageforge_build_status')) THEN
    ALTER TYPE pageforge_build_status ADD VALUE 'final_review_gate';
  END IF;
END $$;
