drop policy if exists "admins delete improvement requests" on public.improvement_requests;
create policy "admins delete improvement requests" on public.improvement_requests
  for delete to authenticated using (public.is_admin());
