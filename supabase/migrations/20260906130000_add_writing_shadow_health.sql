-- Aggregate-only operations surface. Source text stays in private owner reads.
create view public.writing_shadow_health as
select status,count(*)::bigint run_count,
  count(*) filter(where attempt_count=8 and status<>'completed')::bigint exhausted_count,
  max(attempt_count) max_attempts,
  min(created_at) oldest_created_at,
  max(extract(epoch from now()-created_at)) filter(where status<>'completed') oldest_pending_seconds,
  count(*) filter(where error_code='LEASE_EXPIRED')::bigint expired_lease_count
from public.writing_shadow_runs group by status;
revoke all on public.writing_shadow_health from public,anon,authenticated;
grant select on public.writing_shadow_health to service_role;
