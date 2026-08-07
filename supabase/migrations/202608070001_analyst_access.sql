alter table public.analysts add column if not exists extension text;
alter table public.profiles add column if not exists analyst_id uuid unique references public.analysts(id) on delete set null;

create or replace function public.get_my_lunch() returns table (schedule_start text, schedule_end text)
language sql stable security definer set search_path = public as $$
  select ea.schedule_start, ea.schedule_end from profiles p join escala_analysts ea on ea.analyst_id=p.analyst_id join escalas e on e.id=ea.escala_id
  where p.id=auth.uid() and e.kind='almoco' and e.active order by e.created_at desc limit 1
$$;

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
  if v_overlap>=2 then raise exception 'LUNCH_LIMIT'; end if;
  update escala_analysts set schedule_start=p_start,schedule_end=p_end where escala_id=v_escala and analyst_id=v_analyst;
end $$;
grant execute on function public.get_my_lunch() to authenticated;
grant execute on function public.set_my_lunch(text,text) to authenticated;
