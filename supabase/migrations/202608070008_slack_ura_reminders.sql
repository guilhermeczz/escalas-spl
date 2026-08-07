alter table public.analysts add column if not exists slack_user_id text;
alter table public.analysts drop constraint if exists analysts_slack_user_id_format;
alter table public.analysts add constraint analysts_slack_user_id_format check(slack_user_id is null or slack_user_id ~ '^[UW][A-Z0-9]+$');

create table if not exists public.slack_notification_log (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null references public.escalas(id) on delete cascade,
  analyst_id uuid not null references public.analysts(id) on delete cascade,
  schedule_date date not null,
  notification_type text not null check(notification_type in('ura_start','ura_end')),
  sent_at timestamptz not null default now(),
  unique(escala_id,analyst_id,schedule_date,notification_type)
);
alter table public.slack_notification_log enable row level security;
drop policy if exists "slack log admin read" on public.slack_notification_log;
create policy "slack log admin read" on public.slack_notification_log for select to authenticated using(public.is_admin());
