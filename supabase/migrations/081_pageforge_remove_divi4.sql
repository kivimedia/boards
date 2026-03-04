-- ============================================================================
-- 081: PageForge - Remove Divi 4, Default to Divi 5
-- Divi 5 is now the primary page builder. Gutenberg remains as optional.
-- Divi 4 support is removed entirely.
-- ============================================================================

-- 1. Migrate any existing divi4 rows to divi5
UPDATE pageforge_site_profiles SET page_builder = 'divi5' WHERE page_builder = 'divi4';
UPDATE pageforge_builds SET page_builder = 'divi5' WHERE page_builder = 'divi4';

-- 2. Change column defaults from gutenberg to divi5
ALTER TABLE pageforge_site_profiles ALTER COLUMN page_builder SET DEFAULT 'divi5';
ALTER TABLE pageforge_builds ALTER COLUMN page_builder SET DEFAULT 'divi5';

-- 3. Remove divi4 from the enum (Postgres requires recreating the type)
ALTER TYPE page_builder_type RENAME TO page_builder_type_old;
CREATE TYPE page_builder_type AS ENUM ('gutenberg', 'divi5');
ALTER TABLE pageforge_site_profiles
  ALTER COLUMN page_builder TYPE page_builder_type
  USING page_builder::text::page_builder_type;
ALTER TABLE pageforge_builds
  ALTER COLUMN page_builder TYPE page_builder_type
  USING page_builder::text::page_builder_type;
DROP TYPE page_builder_type_old;
