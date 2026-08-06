-- Execute uma vez no SQL Editor do Supabase.
-- Adiciona horários individuais aos analistas vinculados a uma escala.
alter table public.escala_analysts
  add column if not exists schedule_start text,
  add column if not exists schedule_end text,
  add column if not exists schedule_note text;
