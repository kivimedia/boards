-- ============================================================================
-- 001_initial_schema.sql
-- Initial database schema for Agency Board (Trello-like project management)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Enum Types
-- --------------------------------------------------------------------------
create type board_type as enum (
  'dev',
  'training',
  'account_manager',
  'graphic_designer',
  'executive_assistant',
  'video_editor'
);

-- --------------------------------------------------------------------------
-- 2. Profiles
-- --------------------------------------------------------------------------
create table profiles (
  id          uuid        primary key references auth.users on delete cascade,
  display_name text       not null,
  avatar_url  text,
  role        text        default 'member',
  created_at  timestamptz default now()
);

-- --------------------------------------------------------------------------
-- 3. Boards
-- --------------------------------------------------------------------------
create table boards (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  type        board_type  not null,
  created_by  uuid        references auth.users,
  created_at  timestamptz default now()
);

-- --------------------------------------------------------------------------
-- 4. Lists
-- --------------------------------------------------------------------------
create table lists (
  id          uuid        primary key default gen_random_uuid(),
  board_id    uuid        references boards on delete cascade,
  name        text        not null,
  position    integer     not null default 0,
  created_at  timestamptz default now()
);

-- --------------------------------------------------------------------------
-- 5. Cards
-- --------------------------------------------------------------------------
create table cards (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  description text        default '',
  due_date    timestamptz,
  created_by  uuid        references auth.users,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- --------------------------------------------------------------------------
-- 6. Card Placements (enables mirroring a card across multiple lists)
-- --------------------------------------------------------------------------
create table card_placements (
  id          uuid        primary key default gen_random_uuid(),
  card_id     uuid        references cards on delete cascade,
  list_id     uuid        references lists on delete cascade,
  position    integer     not null default 0,
  is_mirror   boolean     default false,
  created_at  timestamptz default now()
);

-- --------------------------------------------------------------------------
-- 7. Labels
-- --------------------------------------------------------------------------
create table labels (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  color       text        not null,
  board_id    uuid        references boards on delete cascade
);

-- --------------------------------------------------------------------------
-- 8. Card Labels (join table)
-- --------------------------------------------------------------------------
create table card_labels (
  card_id     uuid        references cards on delete cascade,
  label_id    uuid        references labels on delete cascade,
  primary key (card_id, label_id)
);

-- --------------------------------------------------------------------------
-- 9. Comments
-- --------------------------------------------------------------------------
create table comments (
  id          uuid        primary key default gen_random_uuid(),
  card_id     uuid        references cards on delete cascade,
  user_id     uuid        references auth.users,
  content     text        not null,
  created_at  timestamptz default now()
);

-- --------------------------------------------------------------------------
-- 10. Card Assignees (join table)
-- --------------------------------------------------------------------------
create table card_assignees (
  card_id     uuid        references cards on delete cascade,
  user_id     uuid        references auth.users on delete cascade,
  primary key (card_id, user_id)
);

-- ============================================================================
-- Trigger Functions
-- ============================================================================

-- Auto-update updated_at on cards -----------------------------------------
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cards_updated_at
  before update on cards
  for each row
  execute function update_updated_at();

-- Auto-create profile on new auth user ------------------------------------
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- profiles ----------------------------------------------------------------
alter table profiles enable row level security;

create policy "profiles: anyone can read"
  on profiles for select
  using (true);

create policy "profiles: owner can update"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- boards ------------------------------------------------------------------
alter table boards enable row level security;

create policy "boards: authenticated read"
  on boards for select
  to authenticated
  using (true);

create policy "boards: authenticated insert"
  on boards for insert
  to authenticated
  with check (true);

create policy "boards: authenticated update"
  on boards for update
  to authenticated
  using (true)
  with check (true);

create policy "boards: authenticated delete"
  on boards for delete
  to authenticated
  using (true);

-- lists -------------------------------------------------------------------
alter table lists enable row level security;

create policy "lists: authenticated read"
  on lists for select
  to authenticated
  using (true);

create policy "lists: authenticated insert"
  on lists for insert
  to authenticated
  with check (true);

create policy "lists: authenticated update"
  on lists for update
  to authenticated
  using (true)
  with check (true);

create policy "lists: authenticated delete"
  on lists for delete
  to authenticated
  using (true);

-- cards -------------------------------------------------------------------
alter table cards enable row level security;

create policy "cards: authenticated read"
  on cards for select
  to authenticated
  using (true);

create policy "cards: authenticated insert"
  on cards for insert
  to authenticated
  with check (true);

create policy "cards: authenticated update"
  on cards for update
  to authenticated
  using (true)
  with check (true);

create policy "cards: authenticated delete"
  on cards for delete
  to authenticated
  using (true);

-- card_placements ---------------------------------------------------------
alter table card_placements enable row level security;

create policy "card_placements: authenticated read"
  on card_placements for select
  to authenticated
  using (true);

create policy "card_placements: authenticated insert"
  on card_placements for insert
  to authenticated
  with check (true);

create policy "card_placements: authenticated update"
  on card_placements for update
  to authenticated
  using (true)
  with check (true);

create policy "card_placements: authenticated delete"
  on card_placements for delete
  to authenticated
  using (true);

-- labels ------------------------------------------------------------------
alter table labels enable row level security;

create policy "labels: authenticated read"
  on labels for select
  to authenticated
  using (true);

create policy "labels: authenticated insert"
  on labels for insert
  to authenticated
  with check (true);

create policy "labels: authenticated update"
  on labels for update
  to authenticated
  using (true)
  with check (true);

create policy "labels: authenticated delete"
  on labels for delete
  to authenticated
  using (true);

-- card_labels -------------------------------------------------------------
alter table card_labels enable row level security;

create policy "card_labels: authenticated read"
  on card_labels for select
  to authenticated
  using (true);

create policy "card_labels: authenticated insert"
  on card_labels for insert
  to authenticated
  with check (true);

create policy "card_labels: authenticated update"
  on card_labels for update
  to authenticated
  using (true)
  with check (true);

create policy "card_labels: authenticated delete"
  on card_labels for delete
  to authenticated
  using (true);

-- comments ----------------------------------------------------------------
alter table comments enable row level security;

create policy "comments: authenticated read"
  on comments for select
  to authenticated
  using (true);

create policy "comments: authenticated insert"
  on comments for insert
  to authenticated
  with check (true);

create policy "comments: owner can update"
  on comments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "comments: owner can delete"
  on comments for delete
  to authenticated
  using (auth.uid() = user_id);

-- card_assignees ----------------------------------------------------------
alter table card_assignees enable row level security;

create policy "card_assignees: authenticated read"
  on card_assignees for select
  to authenticated
  using (true);

create policy "card_assignees: authenticated insert"
  on card_assignees for insert
  to authenticated
  with check (true);

create policy "card_assignees: authenticated update"
  on card_assignees for update
  to authenticated
  using (true)
  with check (true);

create policy "card_assignees: authenticated delete"
  on card_assignees for delete
  to authenticated
  using (true);

-- ============================================================================
-- Indexes on Foreign Keys
-- ============================================================================

create index idx_boards_created_by       on boards (created_by);
create index idx_lists_board_id          on lists (board_id);
create index idx_lists_position          on lists (board_id, position);
create index idx_cards_created_by        on cards (created_by);
create index idx_card_placements_card_id on card_placements (card_id);
create index idx_card_placements_list_id on card_placements (list_id);
create index idx_card_placements_pos     on card_placements (list_id, position);
create index idx_labels_board_id         on labels (board_id);
create index idx_card_labels_label_id    on card_labels (label_id);
create index idx_comments_card_id        on comments (card_id);
create index idx_comments_user_id        on comments (user_id);
create index idx_card_assignees_user_id  on card_assignees (user_id);

-- ============================================================================
-- Supabase Realtime
-- ============================================================================

alter publication supabase_realtime add table boards;
alter publication supabase_realtime add table lists;
alter publication supabase_realtime add table cards;
alter publication supabase_realtime add table card_placements;
alter publication supabase_realtime add table comments;
