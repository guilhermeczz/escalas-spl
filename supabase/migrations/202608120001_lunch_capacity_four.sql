-- Até quatro analistas podem compartilhar uma faixa de almoço.
create or replace function public.set_my_lunch(p_start text, p_end text) returns void
language plpgsql security definer set search_path = public as $$
declare v_analyst uuid; v_escala uuid; v_overlap integer;
begin
  if p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_end<=p_start then raise exception 'INVALID_LUNCH_TIME'; end if;
  select analyst_id into v_analyst from profiles where id=auth.uid(); if v_analyst is null then raise exception 'ANALYST_NOT_LINKED'; end if;
  select e.id into v_escala from escalas e join escala_analysts ea on ea.escala_id=e.id where e.kind='almoco' and e.active and ea.analyst_id=v_analyst order by e.created_at desc limit 1;
  if v_escala is null then raise exception 'LUNCH_SCHEDULE_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext('lunch-capacity'));
  select count(*) into v_overlap from escala_analysts ea join escalas e on e.id=ea.escala_id where e.kind='almoco' and e.active and ea.analyst_id<>v_analyst and ea.schedule_start is not null and ea.schedule_end is not null and ea.schedule_start<p_end and ea.schedule_end>p_start;
  if v_overlap>=4 then raise exception 'LUNCH_LIMIT'; end if;
  update escala_analysts set schedule_start=p_start,schedule_end=p_end where escala_id=v_escala and analyst_id=v_analyst;
end $$;

create or replace function public.start_my_lunch() returns uuid
language plpgsql security definer set search_path=public as $$
declare v_analyst uuid; v_event uuid; v_active integer;
begin
  select analyst_id into v_analyst from profiles where id=auth.uid(); if v_analyst is null then raise exception 'ANALYST_NOT_LINKED'; end if;
  perform pg_advisory_xact_lock(hashtext('active-lunch-capacity'));
  if exists(select 1 from lunch_events where analyst_id=v_analyst and returned_at is null) then raise exception 'LUNCH_ALREADY_ACTIVE'; end if;
  select count(*) into v_active from lunch_events where returned_at is null;
  if v_active>=4 then raise exception 'LUNCH_LIMIT'; end if;
  insert into lunch_events(analyst_id,expected_return_at) values(v_analyst,now()+interval '1 hour') returning id into v_event;
  return v_event;
end $$;

-- O ponto também respeita o limite de quatro saídas simultâneas. O retorno
-- continua permitido a qualquer momento após 59 minutos e grava o horário real.
create or replace function public.record_my_work_event(p_event_type text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_analyst uuid; v_name text; v_last text; v_lunch_at timestamptz; v_now timestamptz:=now(); v_active integer;
begin
  select p.analyst_id,a.name into v_analyst,v_name from profiles p join analysts a on a.id=p.analyst_id where p.id=auth.uid();
  if v_analyst is null then raise exception 'ANALYST_NOT_LINKED'; end if;
  select event_type into v_last from workday_events where analyst_id=v_analyst and work_date=timezone('America/Sao_Paulo',v_now)::date order by occurred_at desc limit 1;
  if p_event_type='entry' and v_last is not null then raise exception 'ENTRY_ALREADY_RECORDED';
  elsif p_event_type='lunch' then
    if v_last<>'entry' then raise exception 'INVALID_WORK_EVENT_ORDER'; end if;
    perform pg_advisory_xact_lock(hashtext('workday-lunch-capacity'));
    select count(*) into v_active from workday_events e
      where e.work_date=timezone('America/Sao_Paulo',v_now)::date and e.event_type='lunch'
      and not exists(select 1 from workday_events r where r.analyst_id=e.analyst_id and r.work_date=e.work_date and r.event_type='lunch_return');
    if v_active>=4 then raise exception 'LUNCH_LIMIT'; end if;
  elsif p_event_type='lunch_return' then
    if v_last<>'lunch' then raise exception 'INVALID_WORK_EVENT_ORDER'; end if;
    select occurred_at into v_lunch_at from workday_events where analyst_id=v_analyst and work_date=timezone('America/Sao_Paulo',v_now)::date and event_type='lunch';
    if v_now<v_lunch_at+interval '59 minutes' then raise exception 'RETURN_TOO_EARLY'; end if;
  elsif p_event_type='shift_end' and v_last not in('entry','lunch_return') then raise exception 'INVALID_WORK_EVENT_ORDER';
  elsif p_event_type not in('entry','lunch','lunch_return','shift_end') then raise exception 'INVALID_EVENT_TYPE'; end if;
  insert into workday_events(analyst_id,event_type,occurred_at) values(v_analyst,p_event_type,v_now);
  return jsonb_build_object('analyst_name',v_name,'event_type',p_event_type,'occurred_at',v_now);
end $$;

grant execute on function public.set_my_lunch(text,text) to authenticated;
grant execute on function public.start_my_lunch() to authenticated;
grant execute on function public.record_my_work_event(text) to authenticated;
