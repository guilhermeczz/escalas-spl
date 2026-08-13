create table if not exists public.analyst_absences (
  id uuid primary key default gen_random_uuid(),
  analyst_id uuid not null references public.analysts(id) on delete cascade,
  reason text not null check (reason in ('vacation','medical_leave')),
  start_date date not null,
  return_date date not null,
  ended_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint analyst_absences_valid_period check (return_date > start_date)
);

create index if not exists analyst_absences_period on public.analyst_absences(analyst_id,start_date,return_date);
alter table public.analyst_absences enable row level security;
drop policy if exists "absences admin read" on public.analyst_absences;
create policy "absences admin read" on public.analyst_absences for select to authenticated using(public.is_admin());
drop policy if exists "absences admin write" on public.analyst_absences;
create policy "absences admin write" on public.analyst_absences for all to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace function public.active_absent_analyst_ids()
returns table(analyst_id uuid)
language sql stable security definer set search_path=public
as $$
  select distinct a.analyst_id from public.analyst_absences a
  where a.ended_at is null
    and timezone('America/Sao_Paulo',now())::date >= a.start_date
    and timezone('America/Sao_Paulo',now())::date < a.return_date;
$$;
grant execute on function public.active_absent_analyst_ids() to anon, authenticated;
