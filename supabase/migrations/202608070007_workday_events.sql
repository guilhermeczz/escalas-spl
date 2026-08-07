create table if not exists public.workday_events (
  id uuid primary key default gen_random_uuid(),
  analyst_id uuid not null references public.analysts(id) on delete cascade,
  work_date date not null default timezone('America/Sao_Paulo',now())::date,
  event_type text not null check(event_type in('entry','lunch','lunch_return','shift_end')),
  occurred_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(analyst_id,work_date,event_type)
);
create index if not exists workday_events_date_analyst on public.workday_events(work_date,analyst_id);
alter table public.workday_events enable row level security;
drop policy if exists "workday own or admin read" on public.workday_events;
create policy "workday own or admin read" on public.workday_events for select to authenticated
using(public.is_admin() or analyst_id=(select analyst_id from profiles where id=auth.uid()));

create or replace function public.get_my_workday() returns table(event_type text,occurred_at timestamptz)
language sql stable security definer set search_path=public as $$
  select we.event_type,we.occurred_at from profiles p join workday_events we on we.analyst_id=p.analyst_id
  where p.id=auth.uid() and we.work_date=timezone('America/Sao_Paulo',now())::date order by we.occurred_at
$$;

create or replace function public.record_my_work_event(p_event_type text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_analyst uuid; v_name text; v_last text; v_lunch_at timestamptz; v_now timestamptz:=now();
begin
  select p.analyst_id,a.name into v_analyst,v_name from profiles p join analysts a on a.id=p.analyst_id where p.id=auth.uid();
  if v_analyst is null then raise exception 'ANALYST_NOT_LINKED'; end if;
  select event_type into v_last from workday_events where analyst_id=v_analyst and work_date=timezone('America/Sao_Paulo',v_now)::date order by occurred_at desc limit 1;
  if p_event_type='entry' and v_last is not null then raise exception 'ENTRY_ALREADY_RECORDED';
  elsif p_event_type='lunch' and v_last<>'entry' then raise exception 'INVALID_WORK_EVENT_ORDER';
  elsif p_event_type='lunch_return' then
    if v_last<>'lunch' then raise exception 'INVALID_WORK_EVENT_ORDER'; end if;
    select occurred_at into v_lunch_at from workday_events where analyst_id=v_analyst and work_date=timezone('America/Sao_Paulo',v_now)::date and event_type='lunch';
    if v_now<v_lunch_at+interval '59 minutes' then raise exception 'RETURN_TOO_EARLY'; end if;
  elsif p_event_type='shift_end' and v_last not in('entry','lunch_return') then raise exception 'INVALID_WORK_EVENT_ORDER';
  elsif p_event_type not in('entry','lunch','lunch_return','shift_end') then raise exception 'INVALID_EVENT_TYPE'; end if;
  insert into workday_events(analyst_id,event_type,occurred_at) values(v_analyst,p_event_type,v_now);
  return jsonb_build_object('analyst_name',v_name,'event_type',p_event_type,'occurred_at',v_now);
end $$;

create or replace function public.active_lunch_analyst_ids() returns table(analyst_id uuid)
language sql stable security definer set search_path=public as $$
  select distinct e.analyst_id from workday_events e
  where e.work_date=timezone('America/Sao_Paulo',now())::date and e.event_type='lunch'
  and not exists(select 1 from workday_events r where r.analyst_id=e.analyst_id and r.work_date=e.work_date and r.event_type='lunch_return')
$$;
grant execute on function public.get_my_workday() to authenticated;
grant execute on function public.record_my_work_event(text) to authenticated;
