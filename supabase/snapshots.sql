-- Private source backups. Separate from race_comments and its retention.
-- Run once in the existing project's SQL Editor.
insert into storage.buckets (id, name, public)
values ('keirin-source-snapshots', 'keirin-source-snapshots', false)
on conflict (id) do nothing;

-- Refuse to silently use an existing bucket that was made public.
do $$
begin
  if exists (select 1 from storage.buckets
             where id = 'keirin-source-snapshots' and public) then
    raise exception 'Snapshot bucket must be private';
  end if;
end $$;

-- Browser reads are allowed only for the existing, approved cat account.
-- Upload/deletion are performed by the server-side Actions credential.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
      and tablename = 'objects' and policyname = 'Cat can read private source snapshots'
  ) then
    create policy "Cat can read private source snapshots"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'keirin-source-snapshots'
      and (select public.is_race_comment_writer())
    );
  end if;
end $$;
