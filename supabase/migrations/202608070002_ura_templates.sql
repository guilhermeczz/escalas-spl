alter table public.escalas add column if not exists schedule_date date;
alter table public.escalas add column if not exists generated_from_plantao uuid references public.escalas(id) on delete cascade;

create table if not exists public.ura_template_slots (
  plantonista_id uuid not null references public.analysts(id) on delete cascade,
  analyst_id uuid not null references public.analysts(id) on delete cascade,
  start_time time not null,
  end_time time not null,
  primary key (plantonista_id, analyst_id),
  check (end_time > start_time)
);
alter table public.ura_template_slots enable row level security;
drop policy if exists "ura templates read" on public.ura_template_slots;
create policy "ura templates read" on public.ura_template_slots for select to authenticated using (true);
drop policy if exists "ura templates admin write" on public.ura_template_slots;
create policy "ura templates admin write" on public.ura_template_slots for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.generate_ura_for_plantao(p_plantao_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare v_start date; v_end date; v_day date; v_owner uuid; v_slot record; v_escala uuid; v_count integer:=0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select start_value::date,end_value::date into v_start,v_end from escalas where id=p_plantao_id and kind='plantao';
  select analyst_id into v_owner from escala_analysts where escala_id=p_plantao_id order by analyst_id limit 1;
  if v_start is null or v_end is null or v_owner is null then return 0; end if;
  delete from escalas where generated_from_plantao=p_plantao_id;
  for v_day in select generate_series(v_start,v_end,interval '1 day')::date loop
    for v_slot in select * from ura_template_slots where plantonista_id=v_owner loop
      insert into escalas(kind,title,start_value,end_value,schedule_date,generated_from_plantao,active) values('horario','URA automática',to_char(v_slot.start_time,'HH24:MI'),to_char(v_slot.end_time,'HH24:MI'),v_day,p_plantao_id,true) returning id into v_escala;
      insert into escala_analysts(escala_id,analyst_id) values(v_escala,v_slot.analyst_id); v_count:=v_count+1;
    end loop;
  end loop;
  return v_count;
end $$;
grant execute on function public.generate_ura_for_plantao(uuid) to authenticated;
