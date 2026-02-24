-- ============================================================================
-- 063_weekly_task_color.sql
-- Add color column to client_weekly_tasks for task color-coding
-- ============================================================================

ALTER TABLE client_weekly_tasks
  ADD COLUMN color TEXT DEFAULT NULL
    CHECK (color IS NULL OR color IN ('blue', 'purple', 'green', 'orange', 'red', 'pink', 'teal', 'yellow'));
