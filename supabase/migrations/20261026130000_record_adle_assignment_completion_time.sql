-- Record the first successful transition to a completed assignment, regardless
-- of which ADLE route owns the completion RPC or server action.
create or replace function public.record_daily_assignment_completion_time()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'completed' then
    new.session_completed_at := coalesce(new.session_completed_at, clock_timestamp());
  elsif tg_op = 'UPDATE' and new.status = 'completed'
    and old.status is distinct from 'completed' then
    new.session_completed_at := coalesce(new.session_completed_at, clock_timestamp());
  end if;
  return new;
end;
$$;

revoke all on function public.record_daily_assignment_completion_time()
  from public, anon, authenticated;

create trigger daily_assignments_record_completion_time
before insert or update of status on public.daily_assignments
for each row execute function public.record_daily_assignment_completion_time();
