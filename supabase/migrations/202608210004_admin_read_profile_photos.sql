drop policy if exists "profile photos read admin" on storage.objects;
create policy "profile photos read admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos' and public.is_admin());
