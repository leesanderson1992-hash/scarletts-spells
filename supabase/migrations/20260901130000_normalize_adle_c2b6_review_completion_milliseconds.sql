-- ADLE C2B.7 canary hotfix: issue the governed Review completion instant at
-- the precision shared by JavaScript Date and PostgreSQL canonical JSON.
-- This is an additive function replacement only: no learner row is changed.

create or replace function public.prepare_adle_review_finalization_c2b6(
  p_review_session_id uuid,
  p_snapshot_fingerprint text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.adle_review_sessions%rowtype;
  v_assignment public.daily_assignments%rowtype;
  v_completed_at timestamptz;
  v_completed_on date;
  v_latest timestamptz;
  v_grace integer;
begin
  select * into v_session from public.adle_review_sessions where id=p_review_session_id;
  select * into v_assignment from public.daily_assignments where id=v_session.daily_assignment_id;
  select completion_grace_minutes into v_grace from public.adle_review_policy_versions
    where schedule_policy_version='review_policy_v1_2026-07-04';
  if v_session.id is null or v_assignment.id is null
    or v_session.snapshot_fingerprint<>p_snapshot_fingerprint
    or v_session.stage<>'ready_to_complete' or v_session.completed_at is not null
    or v_grace is null
  then raise exception 'review_c2b6_not_finalizable'; end if;

  -- Canonical authority boundary. PostgreSQL clocks expose microseconds while
  -- JavaScript Date and the C2B fingerprint envelope use milliseconds.
  v_completed_at:=date_trunc('milliseconds',clock_timestamp());

  select greatest(v_session.created_at,v_session.updated_at,v_session.writing_started_at,
    v_session.writing_submitted_at,
    (select max(created_at) from public.adle_review_transition_receipts where review_session_id=p_review_session_id),
    (select max(updated_at) from public.adle_review_word_encounters where review_session_id=p_review_session_id),
    (select max(repair.created_at) from public.adle_review_repair_attempts repair
      join public.adle_review_word_encounters encounter on encounter.id=repair.review_encounter_id
      where encounter.review_session_id=p_review_session_id)) into v_latest;
  if v_latest is null or v_latest>v_completed_at then raise exception 'invalid_review_activity_timeline'; end if;
  v_completed_on:=case
    when v_assignment.assignment_date=(v_completed_at at time zone 'Europe/London')::date
      then (v_completed_at at time zone 'Europe/London')::date
    when v_assignment.assignment_date+1=(v_completed_at at time zone 'Europe/London')::date
      and (v_latest at time zone 'Europe/London')::date=v_assignment.assignment_date
      and v_completed_at-v_latest<=make_interval(mins=>v_grace)
      then v_assignment.assignment_date
    else (v_completed_at at time zone 'Europe/London')::date end;
  return jsonb_build_object('completedAt',v_completed_at,'reviewCompletedOn',v_completed_on);
end;
$$;

comment on function public.prepare_adle_review_finalization_c2b6(uuid,text) is
  'C2B.7 governed Review completion preparation; emits one UTC instant truncated to canonical millisecond precision.';

revoke all on function public.prepare_adle_review_finalization_c2b6(uuid,text)
  from public,anon,authenticated;
grant execute on function public.prepare_adle_review_finalization_c2b6(uuid,text)
  to service_role;
