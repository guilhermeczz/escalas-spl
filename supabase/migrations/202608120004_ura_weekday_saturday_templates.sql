alter table public.ura_template_slots
  add column if not exists day_type text not null default 'weekday';

alter table public.ura_template_slots
  drop constraint if exists ura_template_slots_day_type_check;
alter table public.ura_template_slots
  add constraint ura_template_slots_day_type_check check(day_type in ('weekday','saturday'));

alter table public.ura_template_slots drop constraint if exists ura_template_slots_pkey;
alter table public.ura_template_slots
  add primary key (plantonista_id,analyst_id,day_type);

create or replace function public.generate_ura_for_plantao(p_plantao_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare v_start date; v_end date; v_day date; v_owner uuid; v_group record; v_escala uuid; v_count integer:=0; v_day_type text;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select start_value::date,end_value::date into v_start,v_end from escalas where id=p_plantao_id and kind='plantao';
  select analyst_id into v_owner from escala_analysts where escala_id=p_plantao_id order by analyst_id limit 1;
  if v_start is null or v_end is null or v_owner is null then return 0; end if;
  delete from escalas where generated_from_plantao=p_plantao_id;
  for v_day in select generate_series(v_start,v_end,interval '1 day')::date loop
    v_day_type:=case extract(isodow from v_day)::integer when 6 then 'saturday' when 7 then null else 'weekday' end;
    if v_day_type is null then continue; end if;
    for v_group in
      select start_time,end_time,array_agg(analyst_id order by analyst_id) analyst_ids
      from ura_template_slots where plantonista_id=v_owner and day_type=v_day_type
      group by start_time,end_time order by start_time
    loop
      insert into escalas(kind,title,start_value,end_value,schedule_date,generated_from_plantao,active)
      values('horario','URA automática',to_char(v_group.start_time,'HH24:MI'),to_char(v_group.end_time,'HH24:MI'),v_day,p_plantao_id,true) returning id into v_escala;
      insert into escala_analysts(escala_id,analyst_id) select v_escala,unnest(v_group.analyst_ids);
      v_count:=v_count+cardinality(v_group.analyst_ids);
    end loop;
  end loop;
  return v_count;
end $$;

grant execute on function public.generate_ura_for_plantao(uuid) to authenticated;

delete from public.ura_template_slots;

with config(plantonista_email,analyst_email,start_time,end_time,day_type) as (values
  ('caio.brandao@superlogica.com','gustavo.ferreira@superlogica.com','08:00'::time,'12:00'::time,'weekday'),
  ('caio.brandao@superlogica.com','wesley.farias@superlogica.com','08:00','12:00','weekday'),
  ('caio.brandao@superlogica.com','luis.cruz@superlogica.com','09:00','13:00','weekday'),
  ('caio.brandao@superlogica.com','joao.sousa@superlogica.com','13:00','17:00','weekday'),
  ('caio.brandao@superlogica.com','matheus.texeira@superlogica.com','13:00','17:00','weekday'),
  ('caio.brandao@superlogica.com','anapaula.santana@superlogica.com','14:00','18:00','weekday'),
  ('caio.brandao@superlogica.com','analice.neves@superlogica.com','14:00','18:00','weekday'),
  ('caio.brandao@superlogica.com','caio.brandao@superlogica.com','08:30','13:30','saturday'),

  ('matheus.texeira@superlogica.com','gustavo.ferreira@superlogica.com','08:00','12:00','weekday'),
  ('matheus.texeira@superlogica.com','caio.brandao@superlogica.com','08:00','12:00','weekday'),
  ('matheus.texeira@superlogica.com','luis.cruz@superlogica.com','09:00','13:00','weekday'),
  ('matheus.texeira@superlogica.com','joao.sousa@superlogica.com','13:00','17:00','weekday'),
  ('matheus.texeira@superlogica.com','wesley.farias@superlogica.com','13:00','17:00','weekday'),
  ('matheus.texeira@superlogica.com','anapaula.santana@superlogica.com','14:00','18:00','weekday'),
  ('matheus.texeira@superlogica.com','analice.neves@superlogica.com','14:00','18:00','weekday'),
  ('matheus.texeira@superlogica.com','matheus.texeira@superlogica.com','08:30','13:30','saturday'),

  ('anapaula.santana@superlogica.com','gustavo.ferreira@superlogica.com','08:00','12:00','weekday'),
  ('anapaula.santana@superlogica.com','caio.brandao@superlogica.com','08:00','12:00','weekday'),
  ('anapaula.santana@superlogica.com','luis.cruz@superlogica.com','09:00','13:00','weekday'),
  ('anapaula.santana@superlogica.com','joao.sousa@superlogica.com','13:00','17:00','weekday'),
  ('anapaula.santana@superlogica.com','wesley.farias@superlogica.com','13:00','17:00','weekday'),
  ('anapaula.santana@superlogica.com','matheus.texeira@superlogica.com','14:00','18:00','weekday'),
  ('anapaula.santana@superlogica.com','analice.neves@superlogica.com','14:00','18:00','weekday'),
  ('anapaula.santana@superlogica.com','anapaula.santana@superlogica.com','08:30','13:30','saturday'),

  ('analice.neves@superlogica.com','gustavo.ferreira@superlogica.com','08:00','12:00','weekday'),
  ('analice.neves@superlogica.com','caio.brandao@superlogica.com','08:00','12:00','weekday'),
  ('analice.neves@superlogica.com','luis.cruz@superlogica.com','09:00','13:00','weekday'),
  ('analice.neves@superlogica.com','joao.sousa@superlogica.com','13:00','17:00','weekday'),
  ('analice.neves@superlogica.com','wesley.farias@superlogica.com','13:00','17:00','weekday'),
  ('analice.neves@superlogica.com','matheus.texeira@superlogica.com','14:00','18:00','weekday'),
  ('analice.neves@superlogica.com','anapaula.santana@superlogica.com','14:00','18:00','weekday'),
  ('analice.neves@superlogica.com','analice.neves@superlogica.com','08:30','13:30','saturday')
)
insert into public.ura_template_slots(plantonista_id,analyst_id,start_time,end_time,day_type)
select owner.id,participant.id,c.start_time,c.end_time,c.day_type
from config c
join public.analysts owner on lower(owner.email)=lower(c.plantonista_email)
join public.analysts participant on lower(participant.email)=lower(c.analyst_email);

do $$ declare item record; begin
  for item in select id from public.escalas where kind='plantao' and active loop
    perform public.generate_ura_for_plantao(item.id);
  end loop;
end $$;
