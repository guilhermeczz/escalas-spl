-- Limpeza solicitada: preserva os cadastros de analistas e os acessos ADM.
delete from public.lunch_events;
delete from public.ura_template_slots;
delete from public.escala_analysts;
delete from public.escalas;
delete from public.notices;

-- Remove os logins comuns de analistas; o cascade do Auth remove os perfis.
-- Administradores permanecem para que o painel continue acessível.
delete from auth.users
where id in (
  select id from public.profiles where role = 'user'
);
