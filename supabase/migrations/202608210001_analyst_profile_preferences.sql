alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists theme_mode text not null default 'light';
alter table public.profiles add column if not exists color_palette text not null default 'blue';

alter table public.profiles drop constraint if exists profiles_birth_date_check;
alter table public.profiles add constraint profiles_birth_date_check
  check (birth_date is null or (birth_date >= date '1900-01-01' and birth_date <= current_date));

alter table public.profiles drop constraint if exists profiles_theme_mode_check;
alter table public.profiles add constraint profiles_theme_mode_check
  check (theme_mode in ('light', 'dark'));

alter table public.profiles drop constraint if exists profiles_color_palette_check;
alter table public.profiles add constraint profiles_color_palette_check
  check (color_palette in ('dark', 'pink', 'blue', 'green'));

create or replace function public.update_my_profile_settings(
  p_birth_date date,
  p_avatar_path text,
  p_theme_mode text,
  p_color_palette text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_birth_date is not null and (p_birth_date < date '1900-01-01' or p_birth_date > current_date) then
    raise exception 'INVALID_BIRTH_DATE';
  end if;
  if p_theme_mode not in ('light', 'dark') then raise exception 'INVALID_THEME'; end if;
  if p_color_palette not in ('dark', 'pink', 'blue', 'green') then raise exception 'INVALID_PALETTE'; end if;
  if p_avatar_path is not null and p_avatar_path !~ ('^' || v_user_id::text || '/[^/]+\.(jpg|jpeg|png)$') then
    raise exception 'INVALID_AVATAR_PATH';
  end if;

  update public.profiles
  set birth_date = p_birth_date,
      avatar_path = p_avatar_path,
      theme_mode = p_theme_mode,
      color_palette = p_color_palette
  where id = v_user_id;

  return jsonb_build_object(
    'birth_date', p_birth_date,
    'avatar_path', p_avatar_path,
    'theme_mode', p_theme_mode,
    'color_palette', p_color_palette
  );
end;
$$;

revoke all on function public.update_my_profile_settings(date,text,text,text) from public;
grant execute on function public.update_my_profile_settings(date,text,text,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/png','image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile photos read own" on storage.objects;
create policy "profile photos read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profile photos insert own" on storage.objects;
create policy "profile photos insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profile photos update own" on storage.objects;
create policy "profile photos update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profile photos delete own" on storage.objects;
create policy "profile photos delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
