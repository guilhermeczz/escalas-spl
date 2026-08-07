create or replace function public.finish_my_lunch() returns void
language plpgsql security definer set search_path=public as $$
declare v_analyst uuid; v_started timestamptz;
begin
  select analyst_id into v_analyst from profiles where id=auth.uid();
  select started_at into v_started from lunch_events where analyst_id=v_analyst and returned_at is null order by started_at desc limit 1;
  if v_started is null then raise exception 'NO_ACTIVE_LUNCH'; end if;
  if now() < v_started + interval '59 minutes' then raise exception 'RETURN_TOO_EARLY'; end if;
  update lunch_events set returned_at=now() where analyst_id=v_analyst and returned_at is null;
end $$;
grant execute on function public.finish_my_lunch() to authenticated;
