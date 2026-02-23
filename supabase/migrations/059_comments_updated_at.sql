-- Add updated_at column to comments table
-- This was missing, causing PATCH /api/cards/[id]/comments to fail with
-- "column updated_at of relation comments does not exist"

alter table comments
  add column if not exists updated_at timestamptz default null;

-- Auto-update updated_at when a comment is edited
create or replace function update_comment_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger comments_updated_at
  before update on comments
  for each row
  execute function update_comment_updated_at();
