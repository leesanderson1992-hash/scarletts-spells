begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $phase_e7b_preflight$
declare
  v_expected record;
  v_oid regprocedure;
  v_actual_hash text;
  v_prior_migration_count integer;
begin
  select count(*)::integer
    into v_prior_migration_count
    from supabase_migrations.schema_migrations
   where version <> '20260829133000';

  if v_prior_migration_count <> 109
     or not exists (
       select 1
         from supabase_migrations.schema_migrations
        where version = '20260828160000'
     )
     or exists (
       select 1
         from supabase_migrations.schema_migrations
        where version > '20260828160000'
          and version <> '20260829133000'
     )
  then
    raise exception 'Phase E7B base migration receipt mismatch: expected the 109-migration E7A baseline';
  end if;

  if (select count(*) from public.daily_assignments
       where compiled_lesson_snapshot->>'snapshotSchemaVersion' = '2') <> 0
  then
    raise exception 'Phase E7B refuses cleanup while generic snapshot-v2 rows exist';
  end if;

  if (select count(*) from public.assignment_items
       where prompt_data::text like '%"pilotActivityId": "intro-root"%') <> 0
  then
    raise exception 'Phase E7B refuses cleanup while fixed-un-v1 markers exist';
  end if;

  if (select count(*) from public.assignment_items
       where prompt_data::text like '%closedCompoundActivityId%') <> 0
  then
    raise exception 'Phase E7B refuses cleanup while closed-compound-v1 markers exist';
  end if;

  for v_expected in
    select *
      from (values
        (
          'public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)',
          '79a98937b6664476f857b331a34eabd21d7170f4ec337681c2a54351c9103ff8',
          true, false, false
        ),
        (
          'public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)',
          'afa14e96373e76c15ba2e90f090de3169ac626870fe4093cb6c84ae7f420185e',
          true, false, false
        ),
        (
          'public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)',
          'd6697eddbefc3f9636f9ff6645b74fd2f28670746fa69d66178d65f955af37d7',
          true, false, false
        ),
        (
          'public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)',
          'ac5ab5f28efc192de35be465c2c7e167d7e91a081321b8dbfb3d96ed7557b576',
          true, false, false
        ),
        (
          'public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)',
          '4ee491437a6e6edd287ae187424ea013405a5bbbb9e1f0756f75813511be62c1',
          true, false, false
        ),
        (
          'public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)',
          '8398fd1077d13846d3c02a3ff7b0613ae628e316763f1be1296d689522e48c2b',
          true, true, false
        ),
        (
          'public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)',
          'bf99950e871a45ef1260eff1626d291c09f23b2449cf286a486888c46e2811c0',
          true, true, false
        )
      ) as expected(signature, definition_sha256, service_execute, authenticated_execute, anon_execute)
  loop
    v_oid := to_regprocedure(v_expected.signature);
    if v_oid is null then
      raise exception 'Phase E7B expected function is missing: %', v_expected.signature;
    end if;

    select encode(extensions.digest(pg_get_functiondef(v_oid), 'sha256'), 'hex')
      into v_actual_hash;
    if v_actual_hash <> v_expected.definition_sha256 then
      raise exception 'Phase E7B definition drift for %: expected %, received %',
        v_expected.signature, v_expected.definition_sha256, v_actual_hash;
    end if;

    if has_function_privilege('service_role', v_oid, 'EXECUTE') <> v_expected.service_execute
       or has_function_privilege('authenticated', v_oid, 'EXECUTE') <> v_expected.authenticated_execute
       or has_function_privilege('anon', v_oid, 'EXECUTE') <> v_expected.anon_execute
    then
      raise exception 'Phase E7B grant drift for %', v_expected.signature;
    end if;
  end loop;

  v_oid := to_regprocedure('public.adle_lesson_snapshot_is_structurally_valid(jsonb)');
  if v_oid is null then
    raise exception 'Phase E7B aggregate lesson-snapshot validator is missing';
  end if;
  select encode(extensions.digest(pg_get_functiondef(v_oid), 'sha256'), 'hex')
    into v_actual_hash;
  if v_actual_hash <> '37fe23fa813f0e3746161f691460e1481daf6852476a3ae8a2406629e5689823' then
    raise exception 'Phase E7B aggregate validator drift: received %', v_actual_hash;
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or has_function_privilege('anon', v_oid, 'EXECUTE')
  then
    raise exception 'Phase E7B aggregate validator grant drift';
  end if;

  if not exists (
    select 1
      from pg_constraint constraint_row
      join pg_class relation on relation.oid = constraint_row.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname = 'daily_assignments'
       and constraint_row.conname = 'daily_assignments_compiled_lesson_snapshot_versioned_check'
       and constraint_row.convalidated
       and pg_get_constraintdef(constraint_row.oid, true)
           = 'CHECK (compiled_lesson_snapshot IS NULL OR adle_lesson_snapshot_is_structurally_valid(compiled_lesson_snapshot))'
  ) then
    raise exception 'Phase E7B current lesson-snapshot constraint receipt mismatch';
  end if;
end
$phase_e7b_preflight$;

create or replace function public.adle_lesson_snapshot_is_structurally_valid(
  p_snapshot jsonb
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case p_snapshot->>'snapshotSchemaVersion'
    when '3' then case p_snapshot#>>'{route,routeId}'
      when 'generic_composer' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
      when 'compound_word_lab' then public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
      when 'dynamic_affix_word_lab' then public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
      when 'dynamic_prefix_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
      when 'base_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
      else false
    end
    else false
  end
$function$;

drop function public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb);
drop function public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb);
drop function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb);
drop function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb);
drop function public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb);
drop function public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text);
drop function public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb);

alter table public.daily_assignments
  validate constraint daily_assignments_compiled_lesson_snapshot_versioned_check;

do $phase_e7b_postflight$
declare
  v_signature text;
  v_definition text;
  v_protected_signature text;
  v_protected_relation text;
begin
  foreach v_signature in array array[
    'public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)',
    'public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)',
    'public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)',
    'public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)',
    'public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)',
    'public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)',
    'public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)'
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      raise exception 'Phase E7B failed to retire %', v_signature;
    end if;
  end loop;

  select pg_get_functiondef(
    'public.adle_lesson_snapshot_is_structurally_valid(jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not like '%when ''3'' then%'
     or v_definition not like '%adle_generic_lesson_snapshot_is_structurally_valid_v3%'
     or v_definition like '%when ''2'' then%'
     or v_definition like '%adle_generic_lesson_snapshot_is_structurally_valid_v2%'
  then
    raise exception 'Phase E7B aggregate validator did not converge to v3-only authority';
  end if;
  if not has_function_privilege(
       'service_role',
       'public.adle_lesson_snapshot_is_structurally_valid(jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.adle_lesson_snapshot_is_structurally_valid(jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.adle_lesson_snapshot_is_structurally_valid(jsonb)',
       'EXECUTE'
     )
  then
    raise exception 'Phase E7B aggregate validator grants were not preserved';
  end if;

  foreach v_protected_signature in array array[
    'public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)',
    'public.persist_adle_specialist_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)',
    'public.adle_generic_lesson_snapshot_is_structurally_valid_v3(jsonb)',
    'public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(jsonb)',
    'public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(jsonb)',
    'public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(jsonb)',
    'public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)',
    'public.complete_adle_base_word_family_pilot_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)',
    'public.complete_adle_release_bound_word_lab_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)',
    'public.adle_lesson_route_metadata_is_valid_v1(jsonb)',
    'public.adle_lesson_route_metadata_is_valid_v2(jsonb)',
    'public.prevent_adle_lesson_route_metadata_update()',
    'public.prevent_adle_compiled_lesson_snapshot_update()',
    'public.materialize_resolved_stage_f_spelling_occurrence_source(uuid,uuid,uuid)',
    'public.adle_authorize_parent_approval_exact_id_handoff(uuid,uuid,uuid,uuid[])',
    'public.adle_reconcile_parent_spelling_decision_r8d(uuid,uuid,uuid,uuid,bigint,text,text,text,uuid,uuid,text,text)',
    'public.materialize_r8e_stage_f_historical_occurrence_source(uuid,uuid,uuid)',
    'public.adle_authorize_governed_source_continuation(uuid,uuid,uuid)',
    'public.finalize_adle_review_r5(uuid,text,text)',
    'public.transition_adle_review_writing_r6(uuid,text,text,text,text,integer,uuid,integer,text)',
    'public.finalize_adle_review_stage_r6(uuid,text,text)',
    'public.persist_adle_review_assignment_r6(uuid,uuid,date,uuid,uuid,uuid,jsonb)'
  ]
  loop
    if to_regprocedure(v_protected_signature) is null then
      raise exception 'Phase E7B protected authority is missing: %', v_protected_signature;
    end if;
  end loop;

  foreach v_protected_relation in array array[
    'public.daily_assignments',
    'public.assignment_items',
    'public.adle_review_schedule_words',
    'public.adle_review_bundles',
    'public.adle_canonical_intake_candidates',
    'public.adle_canonical_intake_reconciliation_queue',
    'public.adle_learning_items',
    'public.adle_taught_word_history',
    'public.adle_authentic_use_events',
    'public.adle_assignment_attempt_events',
    'public.learning_item_evidence',
    'public.adle_review_sessions',
    'public.adle_review_word_encounters',
    'public.adle_review_repair_attempts',
    'public.adle_review_outcome_events',
    'public.adle_review_memory_cue_versions',
    'public.adle_review_completion_receipts',
    'public.child_word_treasures',
    'public.child_word_treasure_events',
    'public.child_word_treasure_evidence_candidates',
    'public.child_gold_coin_ledger_events',
    'public.spelling_reward_events',
    'public.spelling_reward_states'
  ]
  loop
    if to_regclass(v_protected_relation) is null then
      raise exception 'Phase E7B protected relation is missing: %', v_protected_relation;
    end if;
  end loop;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'adle_review_schedule_words'
       and column_name = 'word_schedule_version'
  ) then
    raise exception 'Phase E7B active legacy-bundle/per-word scheduler representation is missing';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.adle_review_schedule_words'::regclass
       and conname = 'adle_review_schedule_words_word_authority_check'
       and pg_get_constraintdef(oid, true) like '%word_schedule_version IS NULL%'
  ) then
    raise exception 'Phase E7B active legacy-bundle schedule compatibility is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'set_child_word_treasures_updated_at'
       and tgrelid = 'public.child_word_treasures'::regclass
       and not tgisinternal
  )
     or not exists (
       select 1 from pg_trigger
        where tgname = 'set_child_word_treasure_evidence_candidates_updated_at'
          and tgrelid = 'public.child_word_treasure_evidence_candidates'::regclass
          and not tgisinternal
     )
  then
    raise exception 'Phase E7B protected Word Treasure/reward authority is missing';
  end if;

  if to_regclass('cron.job') is null
     or not exists (
       select 1 from cron.job
        where jobname = 'adle-canonical-intake-production-safety-sweep-v1'
          and active
     )
  then
    raise exception 'Phase E7B canonical-intake safety-sweep cron is missing';
  end if;

  if not exists (
    select 1
      from pg_constraint constraint_row
      join pg_class relation on relation.oid = constraint_row.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname = 'daily_assignments'
       and constraint_row.conname = 'daily_assignments_compiled_lesson_snapshot_versioned_check'
       and constraint_row.convalidated
  ) then
    raise exception 'Phase E7B lesson-snapshot constraint was not preserved and validated';
  end if;
end
$phase_e7b_postflight$;

commit;
