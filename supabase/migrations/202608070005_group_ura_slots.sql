create or replace function public.generate_ura_for_plantao(p_plantao_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare v_start date; v_end date; v_day date; v_owner uuid; v_group record; v_escala uuid; v_count integer:=0;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select start_value::date,end_value::date into v_start,v_end from escalas where id=p_plantao_id and kind='plantao';
  select analyst_id into v_owner from escala_analysts where escala_id=p_plantao_id order by analyst_id limit 1;
  if v_start is null or v_end is null or v_owner is null then return 0; end if;
  delete from escalas where generated_from_plantao=p_plantao_id;
  for v_day in select generate_series(v_start,v_end,interval '1 day')::date loop
    for v_group in select start_time,end_time,array_agg(analyst_id order by analyst_id) analyst_ids from ura_template_slots where plantonista_id=v_owner group by start_time,end_time order by start_time loop
      insert into escalas(kind,title,start_value,end_value,schedule_date,generated_from_plantao,active)
      values('horario','URA automática',to_char(v_group.start_time,'HH24:MI'),to_char(v_group.end_time,'HH24:MI'),v_day,p_plantao_id,true) returning id into v_escala;
      insert into escala_analysts(escala_id,analyst_id) select v_escala,unnest(v_group.analyst_ids);
      v_count:=v_count+cardinality(v_group.analyst_ids);
    end loop;
  end loop;
  return v_count;
end $$;
grant execute on function public.generate_ura_for_plantao(uuid) to authenticated;

do $$ declare item record; begin
  for item in select id from public.escalas where kind='plantao' and active loop
    perform public.generate_ura_for_plantao(item.id);
  end loop;
end $$;
