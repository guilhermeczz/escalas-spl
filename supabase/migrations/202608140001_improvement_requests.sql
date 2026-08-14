create table if not exists public.improvement_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  category text not null check (category in ('bug', 'new_implementation', 'process_improvement')),
  author_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.improvement_requests enable row level security;
drop policy if exists "team creates improvement requests" on public.improvement_requests;
create policy "team creates improvement requests" on public.improvement_requests for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "admins read improvement requests" on public.improvement_requests;
create policy "admins read improvement requests" on public.improvement_requests for select to authenticated using (public.is_admin());
create index if not exists improvement_requests_created_at_idx on public.improvement_requests (created_at desc);
do $$ begin alter publication supabase_realtime add table public.improvement_requests; exception when duplicate_object then null; end $$;
