create or replace function public.active_workday_analyst_ids()
returns table(analyst_id uuid)
language sql
stable
security definer
set search_path=public
as $$
  select distinct e.analyst_id
  from public.workday_events e
  where e.work_date=timezone('America/Sao_Paulo',now())::date
    and e.event_type='entry'
    and not exists (
      select 1
      from public.workday_events ended
      where ended.analyst_id=e.analyst_id
        and ended.work_date=e.work_date
        and ended.event_type='shift_end'
    );
$$;

grant execute on function public.active_workday_analyst_ids() to authenticated;
