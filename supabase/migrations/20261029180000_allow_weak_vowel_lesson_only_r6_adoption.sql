-- A Schwa specialist lesson can use the R6 checkpoint state machine without
-- opting its child into R6 Review. Review generation remains rollout-gated.
create or replace function public.adopt_adle_specialist_only_session_r6(
  p_daily_assignment_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.daily_assignments%rowtype;
  v_rollout_state text;
  v_weak_vowel_lesson boolean;
begin
  select * into v_assignment from public.daily_assignments
  where id = p_daily_assignment_id for update;
  if not found then raise exception 'adle_specialist_only_assignment_not_found'; end if;
  select rollout_state into v_rollout_state
  from public.adle_review_r6_child_rollouts
  where child_id = v_assignment.child_id;
  v_weak_vowel_lesson := v_assignment.compiled_lesson_snapshot#>>'{route,routeId}'
    = 'weak_vowel_word_lab'
    and v_assignment.compiled_lesson_snapshot#>>'{route,routeVersion}' = 'v1';
  if v_rollout_state is distinct from 'active' and v_weak_vowel_lesson is not true then
    return jsonb_build_object('ok', true, 'adopted', false, 'reason', 'scope_inactive');
  end if;
  if exists (select 1 from public.adle_review_sessions review
    where review.daily_assignment_id = p_daily_assignment_id)
  then raise exception 'adle_specialist_only_review_conflict'; end if;
  if not ((v_assignment.title = 'ADLE Daily Plan'
      and v_assignment.assignment_generation_source = 'adle_composer_v1')
    or (v_assignment.title = 'ADLE Base-word Family Pilot'
      and v_assignment.assignment_generation_source = 'adle_base_word_family_pilot_v1'))
  then raise exception 'adle_specialist_only_header_unrecognized'; end if;
  insert into public.adle_today_session_orchestrations(
    daily_assignment_id, child_id, parent_user_id, assignment_date,
    major_stage, review_generation_status, specialist_generation_status,
    specialist_started_at, session_completed_at
  ) values (
    v_assignment.id, v_assignment.child_id, v_assignment.parent_user_id,
    v_assignment.assignment_date,
    case when v_assignment.status = 'completed' then 'session_complete'
      else 'specialist_lesson' end,
    'not_required', 'ready',
    case when v_assignment.status <> 'completed' then clock_timestamp() else null end,
    case when v_assignment.status = 'completed' then clock_timestamp() else null end
  ) on conflict (daily_assignment_id) do nothing;
  return jsonb_build_object('ok', true, 'adopted', true,
    'nextMajorStage', case when v_assignment.status = 'completed'
      then 'session_complete' else 'specialist_lesson' end);
end;
$$;
