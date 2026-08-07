create table if not exists public.lunch_events (
  id uuid primary key default gen_random_uuid(),
  analyst_id uuid not null references public.analysts(id) on delete cascade,
  lunch_date date not null default (timezone('America/Sao_Paulo', now())::date),
  started_at timestamptz not null default now(),
  expected_return_at timestamptz not null,
  returned_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists lunch_events_one_active_per_analyst on public.lunch_events(analyst_id) where returned_at is null;
create index if not exists lunch_events_date_analyst on public.lunch_events(lunch_date, analyst_id);
alter table public.lunch_events enable row level security;
drop policy if exists "lunch events own or admin read" on public.lunch_events;
create policy "lunch events own or admin read" on public.lunch_events for select to authenticated
using (public.is_admin() or analyst_id=(select analyst_id from public.profiles where id=auth.uid()));

drop function if exists public.get_my_lunch();
create function public.get_my_lunch()
returns table (schedule_start text, schedule_end text, event_id uuid, started_at timestamptz, expected_return_at timestamptz, returned_at timestamptz)
language sql stable security definer set search_path=public as $$
  with me as (select analyst_id from profiles where id=auth.uid()),
  planned as (
    select ea.schedule_start,ea.schedule_end from me join escala_analysts ea using(analyst_id) join escalas e on e.id=ea.escala_id
    where e.kind='almoco' and e.active order by e.created_at desc limit 1
  ), latest as (
    select le.id,le.started_at,le.expected_return_at,le.returned_at from me join lunch_events le using(analyst_id)
    where le.lunch_date=timezone('America/Sao_Paulo',now())::date order by le.started_at desc limit 1
  )
  select p.schedule_start,p.schedule_end,l.id,l.started_at,l.expected_return_at,l.returned_at from planned p full join latest l on true
$$;

create or replace function public.start_my_lunch() returns uuid
language plpgsql security definer set search_path=public as $$
declare v_analyst uuid; v_event uuid; v_active integer;
begin
  select analyst_id into v_analyst from profiles where id=auth.uid(); if v_analyst is null then raise exception 'ANALYST_NOT_LINKED'; end if;
  perform pg_advisory_xact_lock(hashtext('active-lunch-capacity'));
  if exists(select 1 from lunch_events where analyst_id=v_analyst and returned_at is null) then raise exception 'LUNCH_ALREADY_ACTIVE'; end if;
  select count(*) into v_active from lunch_events where returned_at is null;
  if v_active>=2 then raise exception 'LUNCH_LIMIT'; end if;
  insert into lunch_events(analyst_id,expected_return_at) values(v_analyst,now()+interval '1 hour') returning id into v_event;
  return v_event;
end $$;

create or replace function public.finish_my_lunch() returns void
language plpgsql security definer set search_path=public as $$
declare v_analyst uuid;
begin
  select analyst_id into v_analyst from profiles where id=auth.uid();
  update lunch_events set returned_at=now() where analyst_id=v_analyst and returned_at is null;
  if not found then raise exception 'NO_ACTIVE_LUNCH'; end if;
end $$;

create or replace function public.active_lunch_analyst_ids() returns table(analyst_id uuid)
language sql stable security definer set search_path=public as $$ select distinct analyst_id from lunch_events where returned_at is null $$;
grant execute on function public.get_my_lunch() to authenticated;
grant execute on function public.start_my_lunch() to authenticated;
grant execute on function public.finish_my_lunch() to authenticated;
grant execute on function public.active_lunch_analyst_ids() to authenticated;
