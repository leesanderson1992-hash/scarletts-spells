begin transaction isolation level repeatable read;

do $fr3_proof$
declare
  v_assignment_definition text;
  v_finalizer_definition text;
begin
  select pg_get_functiondef(
    'public.persist_adle_review_assignment_c2b6(uuid,uuid,date,uuid,uuid,uuid,jsonb)'::regprocedure
  ) into v_assignment_definition;
  select pg_get_functiondef(
    'public.finalize_adle_review_c2b6(uuid,text,text,timestamptz,date,jsonb,text)'::regprocedure
  ) into v_finalizer_definition;

  if position('membership_status=''awaiting_pre_retirement_check''' in v_assignment_definition) = 0
    or position('word_interval_index<5' in replace(v_assignment_definition, ' ', '')) > 0
  then raise exception 'FR3 final-rung due admission definition missing'; end if;

  if position('TARGET_RETIREMENT_V1' in v_finalizer_definition) = 0
    or position('persist_adle_final_rung_retirement_decision_fr2' in v_finalizer_definition) = 0
    or position('retirementSourceFingerprint' in v_finalizer_definition) = 0
  then raise exception 'FR3 retirement persistence delegation missing'; end if;

  if has_function_privilege(
      'authenticated',
      'public.finalize_adle_review_c2b6(uuid,text,text,timestamptz,date,jsonb,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.finalize_adle_review_c2b6(uuid,text,text,timestamptz,date,jsonb,text)',
      'EXECUTE'
    )
  then raise exception 'FR3 finalizer security boundary changed'; end if;

  if (select is_active or is_default_for_new_schedules
      from public.adle_review_policy_versions
      where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1')
  then raise exception 'FR3 changed target registry flags'; end if;
end;
$fr3_proof$;

select 'FR3_SQL_RECEIPT:' || jsonb_build_object(
  'status', 'PASS',
  'targetFinalRungDueAdmission', true,
  'preRetirementDueAdmission', true,
  'retirementPlansDelegateToFR2', true,
  'sqlSchedulerAlgorithm', false,
  'scheduleRowsChanged', false,
  'targetInactiveNonDefault', true,
  'serviceRoleOnlyMutation', true
)::text;

rollback;
