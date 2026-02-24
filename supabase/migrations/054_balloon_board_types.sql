-- Migration 054: Add balloon business board types
-- Carolina Balloons HQ - replaces agency board types with balloon-business pipelines

ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'boutique_decor';
ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'marquee_letters';
ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'private_clients';
ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'owner_dashboard';
ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'va_workspace';
ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'general_tasks';
