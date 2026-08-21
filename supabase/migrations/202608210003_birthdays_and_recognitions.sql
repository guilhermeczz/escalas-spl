create table if not exists public.birthday_slack_log (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  birthday_year integer not null,
  sent_at timestamptz not null default now(),
  primary key (profile_id, birthday_year)
);

alter table public.birthday_slack_log enable row level security;
drop policy if exists "admins read birthday slack log" on public.birthday_slack_log;
create policy "admins read birthday slack log" on public.birthday_slack_log
  for select to authenticated using (public.is_admin());

create table if not exists public.recognition_posts (
  id uuid primary key default gen_random_uuid(),
  analyst_id uuid not null references public.analysts(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  title text not null default 'Reconhecimento' check (char_length(trim(title)) between 3 and 80),
  message text not null check (char_length(trim(message)) between 10 and 1200),
  media_path text,
  media_type text check (media_type is null or media_type like 'image/%' or media_type like 'audio/%'),
  created_at timestamptz not null default now(),
  slack_claimed_at timestamptz,
  slack_sent_at timestamptz,
  slack_error text
);

alter table public.recognition_posts enable row level security;
drop policy if exists "admins manage recognition posts" on public.recognition_posts;
create policy "admins manage recognition posts" on public.recognition_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists recognition_posts_created_at_idx on public.recognition_posts(created_at desc);
do $$ begin alter publication supabase_realtime add table public.recognition_posts; exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recognition-media',
  'recognition-media',
  true,
  31457280,
  array['image/png','image/jpeg','image/webp','audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/ogg','audio/webm']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload recognition media" on storage.objects;
create policy "admins upload recognition media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recognition-media' and public.is_admin());

drop policy if exists "admins update recognition media" on storage.objects;
create policy "admins update recognition media" on storage.objects
  for update to authenticated
  using (bucket_id = 'recognition-media' and public.is_admin())
  with check (bucket_id = 'recognition-media' and public.is_admin());

drop policy if exists "admins delete recognition media" on storage.objects;
create policy "admins delete recognition media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recognition-media' and public.is_admin());
