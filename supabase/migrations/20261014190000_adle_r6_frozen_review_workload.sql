-- Freeze the uncapped per-word Review workload beside each new R6 assignment.
-- The old seven-argument persistence functions remain available for historical
-- compatibility; the current app calls these eight-argument atomic wrappers.
begin;

create table public.adle_review_workloads_r6 (
  daily_assignment_id uuid primary key references public.daily_assignments(id),
  child_id uuid not null references public.children(id),
  assignment_date date not null,
  due_schedule_word_ids uuid[] not null,
  due_count_at_start integer not null check (due_count_at_start > 0),
  session_cap_at_start integer not null check (session_cap_at_start between 1 and 10),
  lesson_allowed_at_start boolean not null,
  authority_version text not null check (authority_version = 'adle_r6_mixed_per_word_due_v1'),
  created_at timestamptz not null default clock_timestamp(),
  constraint adle_review_workload_count_check check (cardinality(due_schedule_word_ids) = due_count_at_start),
  constraint adle_review_workload_decision_check check (lesson_allowed_at_start = (due_count_at_start <= session_cap_at_start))
);
alter table public.adle_review_workloads_r6 enable row level security;
revoke all on public.adle_review_workloads_r6 from public, anon, authenticated;
grant select on public.adle_review_workloads_r6 to service_role;

create or replace function public.prevent_adle_review_workload_mutation_r6()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'review_r6_frozen_workload_immutable';
end;
$$;
create trigger adle_review_workloads_r6_immutable
before update or delete on public.adle_review_workloads_r6
for each row execute function public.prevent_adle_review_workload_mutation_r6();

create or replace function public.persist_adle_review_workload_r6(
  p_assignment_id uuid, p_workload jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_assignment public.daily_assignments%rowtype;
  v_ids uuid[];
  v_expected uuid[];
  v_targets uuid[];
  v_count integer;
  v_cap integer;
  v_policy_cap integer;
begin
  select * into v_assignment from public.daily_assignments
  where id=p_assignment_id for update;
  if not found or v_assignment.compiled_review_snapshot is null
    or v_assignment.status <> 'pending'
    or p_workload->>'authorityVersion' is distinct from 'adle_r6_mixed_per_word_due_v1'
    or jsonb_typeof(p_workload->'dueScheduleWordIds') is distinct from 'array'
    or not exists (select 1 from public.adle_today_session_orchestrations o
      where o.daily_assignment_id=p_assignment_id and o.major_stage='review')
  then raise exception 'review_r6_workload_contract_invalid'; end if;

  select coalesce(array_agg(value::uuid order by ord),array[]::uuid[])
    into v_ids from jsonb_array_elements_text(p_workload->'dueScheduleWordIds') with ordinality as ids(value,ord);
  v_count := (p_workload->>'dueCountAtStart')::integer;
  v_cap := (p_workload->>'sessionCapAtStart')::integer;
  select least(10,session_cap) into v_policy_cap from public.adle_review_policy_versions
  where schedule_policy_version='review_policy_v1_2026-07-04';
  if v_cap is distinct from v_policy_cap or v_count is null or v_count <> cardinality(v_ids)
    or v_count < 1 or (p_workload->>'lessonAllowedAtStart')::boolean is distinct from (v_count<=v_cap)
  then raise exception 'review_r6_workload_count_or_cap_invalid'; end if;

  -- The seven-argument persistence function already holds the child/date
  -- advisory lock. Hold every active schedule row through this validation and
  -- commit so an unselected due word cannot change between count and freeze.
  perform 1 from public.adle_review_schedule_words w
    where w.child_id=v_assignment.child_id and w.row_status='active'
    order by w.id for update;

  with due_words as (
    select w.id,w.canonical_word_id,w.taught_on,
      case
        when w.word_schedule_version='adle_review_per_word_schedule_v1'
          and w.word_schedule_policy_version='review_policy_v1_2026-07-04'
          and w.membership_status='scheduled' then w.word_next_due_on
        when w.word_schedule_version='adle_review_per_word_schedule_v1'
          and w.word_schedule_policy_version='review_policy_v1_2026-07-04'
          and w.membership_status='catch_up' then w.next_retest_due_on
        when w.word_schedule_version='adle_review_per_word_schedule_v1'
          and w.word_schedule_policy_version='review_policy_v1_2026-07-04'
          and w.membership_status='awaiting_pre_retirement_check' then w.pre_retirement_check_due_on
        when w.word_schedule_version='adle_review_per_word_schedule_v2'
          and w.word_schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'
          and w.membership_status in ('scheduled','next_day_recovery') then w.word_next_due_on
        when w.word_schedule_version='adle_review_per_word_schedule_v2'
          and w.word_schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'
          and w.membership_status='awaiting_pre_retirement_check' and w.word_interval_index=5
          then w.pre_retirement_check_due_on
        else null end due_on
    from public.adle_review_schedule_words w
    where w.child_id=v_assignment.child_id and w.row_status='active'
  )
  select coalesce(array_agg(id order by due_on,taught_on,canonical_word_id,id),array[]::uuid[])
    into v_expected from due_words where due_on<=v_assignment.assignment_date;
  if v_ids is distinct from v_expected then
    raise exception 'review_r6_workload_due_cohort_changed'; end if;

  select coalesce(array_agg((target#>>'{schedule,scheduleWordId}')::uuid
    order by (target->>'order')::integer),array[]::uuid[])
    into v_targets from jsonb_array_elements(v_assignment.compiled_review_snapshot->'targets') target;
  if v_targets is distinct from v_ids[1:least(v_count,v_cap)] then
    raise exception 'review_r6_workload_target_prefix_invalid'; end if;

  insert into public.adle_review_workloads_r6(daily_assignment_id,child_id,assignment_date,
    due_schedule_word_ids,due_count_at_start,session_cap_at_start,lesson_allowed_at_start,authority_version)
  values(p_assignment_id,v_assignment.child_id,v_assignment.assignment_date,
    v_ids,v_count,v_cap,v_count<=v_cap,'adle_r6_mixed_per_word_due_v1');
end;
$$;
revoke all on function public.persist_adle_review_workload_r6(uuid,jsonb) from public,anon,authenticated;

create or replace function public.persist_adle_review_assignment_r6(
  p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_assignment_id uuid,
  p_review_item_id uuid,p_review_session_id uuid,p_snapshot jsonb,p_workload jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  v_result := public.persist_adle_review_assignment_r6(p_parent_user_id,p_child_id,p_plan_date,
    p_assignment_id,p_review_item_id,p_review_session_id,p_snapshot);
  if v_result->>'outcome'='created' then
    perform public.persist_adle_review_workload_r6((v_result->>'assignmentId')::uuid,p_workload);
  elsif v_result->>'outcome'='reused_incomplete' and not exists (
    select 1 from public.adle_review_workloads_r6 where daily_assignment_id=(v_result->>'assignmentId')::uuid
  ) then raise exception 'review_r6_open_workload_reconciliation_required'; end if;
  return v_result;
end;
$$;
revoke all on function public.persist_adle_review_assignment_r6(uuid,uuid,date,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_adle_review_assignment_r6(uuid,uuid,date,uuid,uuid,uuid,jsonb,jsonb) to service_role;

create or replace function public.persist_adle_review_assignment_c2b6(
  p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_assignment_id uuid,
  p_review_item_id uuid,p_review_session_id uuid,p_snapshot jsonb,p_workload jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  v_result := public.persist_adle_review_assignment_c2b6(p_parent_user_id,p_child_id,p_plan_date,
    p_assignment_id,p_review_item_id,p_review_session_id,p_snapshot);
  if v_result->>'outcome'='created' then
    perform public.persist_adle_review_workload_r6((v_result->>'assignmentId')::uuid,p_workload);
  elsif v_result->>'outcome'='reused_incomplete' and not exists (
    select 1 from public.adle_review_workloads_r6 where daily_assignment_id=(v_result->>'assignmentId')::uuid
  ) then raise exception 'review_r6_open_workload_reconciliation_required'; end if;
  return v_result;
end;
$$;
revoke all on function public.persist_adle_review_assignment_c2b6(uuid,uuid,date,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_adle_review_assignment_c2b6(uuid,uuid,date,uuid,uuid,uuid,jsonb,jsonb) to service_role;

-- The wrappers call the seven-argument versions as their definer. External
-- service callers must not create a new R6 assignment without its workload.
revoke execute on function public.persist_adle_review_assignment_r6(uuid,uuid,date,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.persist_adle_review_assignment_c2b6(uuid,uuid,date,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- A finalised Review has already advanced its schedule; its start workload
-- cannot be reconstructed from current dates. Require reconciliation before
-- cutting the new reader over if such an R6 assignment is still in flight.
do $$
declare
  v_assignment public.daily_assignments%rowtype;
  v_ids uuid[];
  v_cap integer;
begin
  select least(10,session_cap) into v_cap from public.adle_review_policy_versions
    where schedule_policy_version='review_policy_v1_2026-07-04';
  for v_assignment in select a.* from public.daily_assignments a
    join public.adle_today_session_orchestrations o on o.daily_assignment_id=a.id
    where o.major_stage='review' and exists (select 1 from public.adle_review_sessions s
      where s.daily_assignment_id=a.id and s.completed_at is null)
    order by a.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      v_assignment.child_id::text || ':' || v_assignment.assignment_date::text || ':adle-review-r6',0));
    with due_words as (
      select w.id,w.canonical_word_id,w.taught_on,
        case
          when w.word_schedule_version='adle_review_per_word_schedule_v1'
            and w.word_schedule_policy_version='review_policy_v1_2026-07-04'
            and w.membership_status='scheduled' then w.word_next_due_on
          when w.word_schedule_version='adle_review_per_word_schedule_v1'
            and w.word_schedule_policy_version='review_policy_v1_2026-07-04'
            and w.membership_status='catch_up' then w.next_retest_due_on
          when w.word_schedule_version='adle_review_per_word_schedule_v1'
            and w.word_schedule_policy_version='review_policy_v1_2026-07-04'
            and w.membership_status='awaiting_pre_retirement_check' then w.pre_retirement_check_due_on
          when w.word_schedule_version='adle_review_per_word_schedule_v2'
            and w.word_schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'
            and w.membership_status in ('scheduled','next_day_recovery') then w.word_next_due_on
          when w.word_schedule_version='adle_review_per_word_schedule_v2'
            and w.word_schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'
            and w.membership_status='awaiting_pre_retirement_check' and w.word_interval_index=5
            then w.pre_retirement_check_due_on
          else null end due_on
      from public.adle_review_schedule_words w
      where w.child_id=v_assignment.child_id and w.row_status='active'
    ) select coalesce(array_agg(id order by due_on,taught_on,canonical_word_id,id),array[]::uuid[])
      into v_ids from due_words where due_on<=v_assignment.assignment_date;
    perform public.persist_adle_review_workload_r6(v_assignment.id,jsonb_build_object(
      'authorityVersion','adle_r6_mixed_per_word_due_v1',
      'dueScheduleWordIds',to_jsonb(v_ids),'dueCountAtStart',cardinality(v_ids),
      'sessionCapAtStart',v_cap,'lessonAllowedAtStart',cardinality(v_ids)<=v_cap));
  end loop;
  if exists (select 1 from public.adle_today_session_orchestrations o
    where o.major_stage in ('review','specialist_generation','blocked')
      and exists (select 1 from public.adle_review_sessions s
        where s.daily_assignment_id=o.daily_assignment_id)
      and not exists (select 1 from public.adle_review_workloads_r6 w
        where w.daily_assignment_id=o.daily_assignment_id))
  then raise exception 'review_r6_existing_open_assignment_requires_reconciliation'; end if;
end $$;
commit;
