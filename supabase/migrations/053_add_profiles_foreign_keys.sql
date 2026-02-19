-- Add direct FK constraints from user_id columns to profiles(id)
-- so PostgREST can resolve profile:profiles(*) joins.
-- Currently these columns reference auth.users which PostgREST cannot
-- traverse to reach the profiles table.

-- comments.user_id → profiles(id)
DO $$ BEGIN
  ALTER TABLE comments
    ADD CONSTRAINT comments_user_id_profiles_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- activity_log.user_id → profiles(id)
DO $$ BEGIN
  ALTER TABLE activity_log
    ADD CONSTRAINT activity_log_user_id_profiles_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- board_members.user_id → profiles(id)
DO $$ BEGIN
  ALTER TABLE board_members
    ADD CONSTRAINT board_members_user_id_profiles_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- card_assignees.user_id → profiles(id)
DO $$ BEGIN
  ALTER TABLE card_assignees
    ADD CONSTRAINT card_assignees_user_id_profiles_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
