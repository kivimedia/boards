-- 064_weekly_task_assignee_name.sql
-- Add assignee_name column for client-defined task owners (not agency team).
-- This allows clients to define their own list of people for task assignment.

ALTER TABLE client_weekly_tasks
  ADD COLUMN IF NOT EXISTS assignee_name TEXT DEFAULT NULL;
