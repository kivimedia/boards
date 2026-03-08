-- 065: Allow day_start=0, day_end=0 for "Weekly" (unassigned day) tasks
-- The Weekly slot uses dayIndex=0 but the original CHECK required >= 1.

ALTER TABLE client_weekly_tasks
  DROP CONSTRAINT IF EXISTS client_weekly_tasks_day_start_check,
  DROP CONSTRAINT IF EXISTS client_weekly_tasks_day_end_check,
  DROP CONSTRAINT IF EXISTS day_range_valid;

ALTER TABLE client_weekly_tasks
  ADD CONSTRAINT client_weekly_tasks_day_start_check CHECK (day_start >= 0 AND day_start <= 7),
  ADD CONSTRAINT client_weekly_tasks_day_end_check   CHECK (day_end >= 0 AND day_end <= 7),
  ADD CONSTRAINT day_range_valid                      CHECK (day_end >= day_start);
