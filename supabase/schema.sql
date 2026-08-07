-- ============================================================================
-- ESCALA SUPERGICA — Supabase
-- Execute este script no SQL Editor do seu projeto Supabase
-- (Supabase Dashboard -> SQL Editor -> New query -> Run)
--
-- O que ele faz:
--   1. Cria as tabelas (profiles, analysts, escalas, escala_analysts, notices)
--   2. Cria trigger que cria um perfil automaticamente ao registrar um usuário
--   3. Cria a função is_admin() usada pelas políticas de segurança
--   4. Habilita Row Level Security:
--        - LEITURA pública (anon) para escalas, equipe e mural (visão read-only)
--        - ESCRITA apenas para usuário logado com role = 'admin'
--   5. Insere dados de exemplo (equipe, escalas e um aviso)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------------

-- Perfil dos usuários autenticados (vinculado a auth.users)
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  name       text,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Equipe de analistas
create table if not exists public.analysts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  role       text,
  extension  text,
  slack_user_id text,
  color      text not null default '#13315c',
  created_at timestamptz not null default now()
);

alter table public.analysts add column if not exists extension text;
alter table public.profiles add column if not exists analyst_id uuid unique references public.analysts(id) on delete set null;

-- Escalas: kind = 'horario' (hora X a Y), 'plantao' (dia X a Y), 'almoco' (flexível)
create table if not exists public.escalas (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('horario', 'plantao', 'almoco')),
  title       text not null,
  start_value text, -- horario: "08:00" | plantao: "2026-08-01" | almoco: null
  end_value   text, -- horario: "17:00" | plantao: "2026-08-07" | almoco: null
  note        text, -- descrição flexível (usada na escala de almoço)
  schedule_date date,
  generated_from_plantao uuid references public.escalas(id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Vínculo N:N entre escalas e analistas
create table if not exists public.escala_analysts (
  escala_id  uuid not null references public.escalas (id) on delete cascade,
  analyst_id uuid not null references public.analysts (id) on delete cascade,
  schedule_start text,
  schedule_end text,
  schedule_note text,
  primary key (escala_id, analyst_id)
);

alter table public.escala_analysts add column if not exists schedule_start text;
alter table public.escala_analysts add column if not exists schedule_end text;
alter table public.escala_analysts add column if not exists schedule_note text;

-- Mural de avisos / lembretes
create table if not exists public.notices (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. TRIGGER: cria perfil automaticamente ao criar usuário (Auth)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. FUNÇÃO is_admin()
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.analysts        enable row level security;
alter table public.escalas         enable row level security;
alter table public.escala_analysts enable row level security;
alter table public.notices         enable row level security;

-- profiles: usuário vê o próprio perfil; admin vê todos
drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles
  for update to authenticated
  using (public.is_admin());

-- analysts: leitura pública; escrita somente admin
drop policy if exists "analysts read public" on public.analysts;
create policy "analysts read public" on public.analysts
  for select to anon, authenticated
  using (true);

drop policy if exists "analysts write admin" on public.analysts;
create policy "analysts write admin" on public.analysts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- escalas: leitura pública; escrita somente admin
drop policy if exists "escalas read public" on public.escalas;
create policy "escalas read public" on public.escalas
  for select to anon, authenticated
  using (true);

drop policy if exists "escalas write admin" on public.escalas;
create policy "escalas write admin" on public.escalas
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- escala_analysts: leitura pública; escrita somente admin
drop policy if exists "escala_analysts read public" on public.escala_analysts;
create policy "escala_analysts read public" on public.escala_analysts
  for select to anon, authenticated
  using (true);

drop policy if exists "escala_analysts write admin" on public.escala_analysts;
create policy "escala_analysts write admin" on public.escala_analysts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- notices: leitura pública; escrita somente admin
drop policy if exists "notices read public" on public.notices;
create policy "notices read public" on public.notices
  for select to anon, authenticated
  using (true);

drop policy if exists "notices write admin" on public.notices;
create policy "notices write admin" on public.notices
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. DADOS DE EXEMPLO (só insere se a tabela estiver vazia)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.analysts) then
    insert into public.analysts (name, email, role, color) values
      ('Carlos Menezes', 'carlos@escala.local', 'Analista de URA',   '#13315c'),
      ('Fernanda Lima',  'fernanda@escala.local', 'Analista de URA', '#0d47a1'),
      ('Rafael Souza',   'rafael@escala.local', 'Plantão',           '#1e88e5'),
      ('Juliana Alves',  'juliana@escala.local', 'Plantão',          '#5c9bd1'),
      ('Bruno Ferreira', 'bruno@escala.local', 'Suporte',            '#64b5f6');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from public.escalas) then
    insert into public.escalas (kind, title, start_value, end_value, note) values
      ('horario', 'Escala URA — Semana',
        '08:00', '17:00', null),
      ('plantao', 'Plantão Mensal',
        to_char(now() - interval '7 days', 'YYYY-MM-DD'),
        to_char(now() + interval '7 days', 'YYYY-MM-DD'),
        'Plantonista de referência da semana'),
      ('almoco', 'Escala de Almoço',
        null, null,
        '1ª turma 11:30 · 2ª turma 12:30 · 3ª turma 13:30 — fechar na daily da manhã');

    insert into public.escala_analysts (escala_id, analyst_id)
    select e.id, a.id
    from public.escalas e, public.analysts a
    where e.title = 'Escala URA — Semana'
      and a.name in ('Carlos Menezes', 'Fernanda Lima');

    insert into public.escala_analysts (escala_id, analyst_id)
    select e.id, a.id
    from public.escalas e, public.analysts a
    where e.title = 'Plantão Mensal'
      and a.name in ('Rafael Souza', 'Juliana Alves');

    insert into public.escala_analysts (escala_id, analyst_id)
    select e.id, a.id
    from public.escalas e, public.analysts a
    where e.title = 'Escala de Almoço'
      and a.name in ('Carlos Menezes', 'Rafael Souza', 'Bruno Ferreira');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from public.notices) then
    insert into public.notices (text) values
      ('Reunião diária às 08:30 na sala de controle. Manter relatórios atualizados ao fim de cada turno.');
  end if;
end $$;

-- ============================================================================
-- APÓS EXECUTAR:
--   1. Supabase Dashboard -> Authentication -> Users -> "Add user" -> crie o ADM
--   2. Torne-o administrador (substitua pelo e-mail do ADM):
--        update public.profiles set role = 'admin' where email = 'seu-email@empresa.com';
-- ============================================================================
