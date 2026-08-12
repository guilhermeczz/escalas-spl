create table if not exists public.daily_slack_greeting_log (
  greeting_date date primary key,
  message_index integer not null,
  sent_at timestamptz not null default now()
);
alter table public.daily_slack_greeting_log enable row level security;
drop policy if exists "daily greeting log admin read" on public.daily_slack_greeting_log;
create policy "daily greeting log admin read" on public.daily_slack_greeting_log
for select to authenticated using(public.is_admin());

-- Expediente: turnos regulares 08h–17h e 09h–18h (janela conjunta 08h–18h); plantonista
-- de segunda a sexta, 14h–22h, e sábado, 08h–22h. Retorno e saída
-- permanecem registráveis depois do horário para preservar o horário real.
create or replace function public.record_my_work_event(p_event_type text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_analyst uuid; v_name text; v_slack_user_id text; v_last text;
  v_lunch_at timestamptz; v_now timestamptz:=now(); v_active integer;
  v_today date:=timezone('America/Sao_Paulo',now())::date;
  v_minutes integer; v_weekday integer; v_is_plantonista boolean;
  v_open integer; v_close integer;
begin
  select p.analyst_id,a.name,a.slack_user_id into v_analyst,v_name,v_slack_user_id
  from profiles p join analysts a on a.id=p.analyst_id where p.id=auth.uid();
  if v_analyst is null then raise exception 'ANALYST_NOT_LINKED'; end if;

  v_minutes:=extract(hour from timezone('America/Sao_Paulo',v_now))::integer*60
    +extract(minute from timezone('America/Sao_Paulo',v_now))::integer;
  v_weekday:=extract(isodow from v_today)::integer;
  select exists(
    select 1 from escalas e join escala_analysts ea on ea.escala_id=e.id
    where e.kind='plantao' and e.active and ea.analyst_id=v_analyst
      and v_today between e.start_value::date and e.end_value::date
  ) into v_is_plantonista;

  if p_event_type in ('entry','lunch') then
    if v_weekday=7 or (v_weekday=6 and not v_is_plantonista) then raise exception 'OPERATION_OFF'; end if;
    v_open:=case when v_is_plantonista and v_weekday<=5 then 14*60 else 8*60 end;
    v_close:=case when v_is_plantonista then 22*60 else 18*60 end;
    if v_minutes<v_open or v_minutes>=v_close then raise exception 'OPERATION_OFF'; end if;
  end if;

  select event_type into v_last from workday_events where analyst_id=v_analyst and work_date=v_today order by occurred_at desc limit 1;
  if p_event_type='entry' and v_last is not null then raise exception 'ENTRY_ALREADY_RECORDED';
  elsif p_event_type='lunch' then
    if v_last<>'entry' then raise exception 'INVALID_WORK_EVENT_ORDER'; end if;
    perform pg_advisory_xact_lock(hashtext('workday-lunch-capacity'));
    select count(*) into v_active from workday_events e
      where e.work_date=v_today and e.event_type='lunch'
      and not exists(select 1 from workday_events r where r.analyst_id=e.analyst_id and r.work_date=e.work_date and r.event_type='lunch_return');
    if v_active>=4 then raise exception 'LUNCH_LIMIT'; end if;
  elsif p_event_type='lunch_return' then
    if v_last<>'lunch' then raise exception 'INVALID_WORK_EVENT_ORDER'; end if;
    select occurred_at into v_lunch_at from workday_events where analyst_id=v_analyst and work_date=v_today and event_type='lunch';
    if v_now<v_lunch_at+interval '59 minutes' then raise exception 'RETURN_TOO_EARLY'; end if;
  elsif p_event_type='shift_end' and v_last not in('entry','lunch_return') then raise exception 'INVALID_WORK_EVENT_ORDER';
  elsif p_event_type not in('entry','lunch','lunch_return','shift_end') then raise exception 'INVALID_EVENT_TYPE'; end if;
  insert into workday_events(analyst_id,event_type,occurred_at) values(v_analyst,p_event_type,v_now);
  return jsonb_build_object('analyst_name',v_name,'analyst_slack_user_id',v_slack_user_id,'event_type',p_event_type,'occurred_at',v_now);
end $$;

grant execute on function public.record_my_work_event(text) to authenticated;
