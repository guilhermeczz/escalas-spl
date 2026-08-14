alter table public.improvement_requests
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

do $$ begin
  alter table public.improvement_requests add constraint improvement_requests_status_check
    check (status in ('pending', 'accepted', 'rejected'));
exception when duplicate_object then null;
end $$;

drop policy if exists "admins update improvement requests" on public.improvement_requests;
create policy "admins update improvement requests" on public.improvement_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists improvement_requests_status_created_idx
  on public.improvement_requests (status, created_at desc);
