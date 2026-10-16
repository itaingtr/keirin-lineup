-- Shared race-by-race comment board for keirin-lineup.
-- Run once in Supabase SQL Editor after creating the project.

create table if not exists public.race_comments (
  id uuid primary key default gen_random_uuid(),
  race_key text not null,
  body text not null check (char_length(body) between 1 and 2000),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists race_comments_race_created_idx
  on public.race_comments (race_key, created_at, id);

create table if not exists public.race_comment_writers (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.race_comments enable row level security;
alter table public.race_comment_writers enable row level security;

-- The function lets comment policies check the private allowlist without
-- granting visitors direct access to the allowlist table.
create or replace function public.is_race_comment_writer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.race_comment_writers w
    where w.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_race_comment_writer() from public;
grant execute on function public.is_race_comment_writer() to authenticated;

grant select on public.race_comments to anon, authenticated;
grant insert, update, delete on public.race_comments to authenticated;

drop policy if exists "Anyone can read race comments" on public.race_comments;
create policy "Anyone can read race comments"
  on public.race_comments for select
  to anon, authenticated
  using (true);

drop policy if exists "Allowed writer can post comments" on public.race_comments;
create policy "Allowed writer can post comments"
  on public.race_comments for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select public.is_race_comment_writer())
  );

drop policy if exists "Allowed writer can edit own comments" on public.race_comments;
create policy "Allowed writer can edit own comments"
  on public.race_comments for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.is_race_comment_writer())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.is_race_comment_writer())
  );

drop policy if exists "Allowed writer can delete own comments" on public.race_comments;
create policy "Allowed writer can delete own comments"
  on public.race_comments for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.is_race_comment_writer())
  );

-- After signing into the app once, add the owner's UUID to the private
-- allowlist from the SQL Editor, replacing the example UUID below:
-- insert into public.race_comment_writers (user_id)
-- values ('00000000-0000-0000-0000-000000000000');
