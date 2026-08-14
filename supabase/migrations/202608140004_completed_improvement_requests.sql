alter table public.improvement_requests
  drop constraint if exists improvement_requests_status_check;

alter table public.improvement_requests
  add constraint improvement_requests_status_check
  check (status in ('pending', 'accepted', 'rejected', 'completed'));
