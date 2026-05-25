-- Baseline generated from hosted production public schema on 2026-05-25.
-- Historical duplicate-version migrations are archived under supabase/migrations_archive/pre_baseline_2026_05/.
-- Do not replay archived migrations into hosted production.

CREATE SCHEMA IF NOT EXISTS "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";




COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."apply_learning_item_review_state_from_evidence"("p_learning_item_id" "uuid", "p_evidence_type" "text", "p_competency_signal" integer, "p_occurred_at" timestamp with time zone, "p_source_context" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_item public.learning_items%rowtype;
  v_next_competency integer;
  v_next_progress_state text;
  v_next_review_due_at timestamptz;
begin
  select *
  into v_item
  from public.learning_items
  where id = p_learning_item_id
  for update;

  if not found then
    return;
  end if;

  if p_source_context = 'controlled_practice_attempt'
    and coalesce(v_item.current_competency_level, 0) >= 4 then
    return;
  end if;

  v_next_competency := case
    when p_source_context = 'controlled_practice_attempt'
      and p_competency_signal between 1 and 5
      then p_competency_signal
    when v_item.current_competency_level is null
      and p_competency_signal between 1 and 5
      then p_competency_signal
    else v_item.current_competency_level
  end;
  v_next_progress_state := v_item.progress_state;
  v_next_review_due_at := v_item.review_due_at;

  if p_source_context = 'finalised_issue_outcome'
    and p_evidence_type = 'incorrect_use' then
    if v_item.progress_state = 'gold_bar' then
      v_next_progress_state := 'in_machine';
    end if;

    if v_item.progress_state <> 'golden_nugget' then
      v_next_review_due_at := least(
        coalesce(v_item.review_due_at, p_occurred_at + interval '1 day'),
        p_occurred_at + interval '1 day'
      );
    end if;
  elsif p_source_context = 'controlled_practice_attempt' then
    if p_evidence_type = 'controlled_practice_success' then
      v_next_progress_state := 'in_machine';
      v_next_review_due_at :=
        p_occurred_at + public.review_interval_for_learning_item_competency(
          least(coalesce(v_next_competency, v_item.current_competency_level, 1), 3)
        );
    elsif p_evidence_type = 'incorrect_use' then
      v_next_review_due_at := least(
        coalesce(v_item.review_due_at, p_occurred_at + interval '1 day'),
        p_occurred_at + interval '1 day'
      );
    end if;
  end if;

  update public.learning_items
  set
    current_competency_level = v_next_competency,
    progress_state = v_next_progress_state,
    review_due_at = v_next_review_due_at,
    last_meaningful_success_at = last_meaningful_success_at,
    last_meaningful_failure_at = case
      when p_evidence_type = 'incorrect_use'
        and p_source_context = 'finalised_issue_outcome'
        then p_occurred_at
      else last_meaningful_failure_at
    end,
    updated_at = timezone('utc', now())
  where id = p_learning_item_id;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."create_spelling_canonical_mapping_admin"("p_misspelling_normalized" "text", "p_correct_spelling_normalized" "text", "p_micro_skill_key" "text", "p_admin_user_id" "uuid", "p_admin_email" "text" DEFAULT NULL::"text", "p_source_case_id" "uuid" DEFAULT NULL::"uuid", "p_source_decision_id" "uuid" DEFAULT NULL::"uuid", "p_decision_note" "text" DEFAULT NULL::"text", "p_dialect_code" "text" DEFAULT 'en-GB'::"text", "p_normalization_version" "text" DEFAULT 'spelling_normalize_v1'::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_event_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_mapping_id uuid;
  v_decision_case_id uuid;
  v_note text;
  v_metadata jsonb;
  v_event_metadata jsonb;
begin
  if p_admin_user_id is null then
    raise exception 'Canonical mapping writes require an admin user id.';
  end if;

  if p_source_case_id is not null and not exists (
    select 1
    from public.spelling_catalog_review_cases
    where id = p_source_case_id
  ) then
    raise exception 'Source catalog-review case not found.';
  end if;

  if p_source_decision_id is not null then
    select case_id
    into v_decision_case_id
    from public.spelling_catalog_review_case_decisions
    where id = p_source_decision_id;

    if not found then
      raise exception 'Source catalog-review decision not found.';
    end if;

    if p_source_case_id is not null and v_decision_case_id <> p_source_case_id then
      raise exception 'Source decision must belong to the source catalog-review case.';
    end if;
  end if;

  v_note := nullif(btrim(coalesce(p_decision_note, '')), '');
  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'action_source',
    coalesce(p_metadata->>'action_source', 'admin_canonical_mapping_4e1'),
    'resolver_visible',
    false
  );
  v_event_metadata := coalesce(p_event_metadata, '{}'::jsonb) || jsonb_build_object(
    'action_source',
    coalesce(p_event_metadata->>'action_source', 'admin_canonical_mapping_4e1'),
    'resolver_visible',
    false
  );

  insert into public.spelling_canonical_mappings (
    misspelling_normalized,
    correct_spelling_normalized,
    micro_skill_key,
    mapping_status,
    dialect_code,
    normalization_version,
    source_case_id,
    source_decision_id,
    created_by_admin_user_id,
    created_by_admin_email,
    decision_note,
    metadata
  )
  values (
    p_misspelling_normalized,
    p_correct_spelling_normalized,
    p_micro_skill_key,
    'active',
    p_dialect_code,
    p_normalization_version,
    p_source_case_id,
    p_source_decision_id,
    p_admin_user_id,
    nullif(btrim(coalesce(p_admin_email, '')), ''),
    v_note,
    v_metadata
  )
  returning id into v_mapping_id;

  insert into public.spelling_canonical_mapping_events (
    mapping_id,
    event_type,
    previous_status,
    new_status,
    previous_misspelling_normalized,
    new_misspelling_normalized,
    previous_correct_spelling_normalized,
    new_correct_spelling_normalized,
    previous_micro_skill_key,
    new_micro_skill_key,
    admin_user_id,
    admin_email,
    source_case_id,
    source_decision_id,
    note,
    metadata
  )
  values (
    v_mapping_id,
    'created',
    null,
    'active',
    null,
    btrim(p_misspelling_normalized),
    null,
    btrim(p_correct_spelling_normalized),
    null,
    btrim(p_micro_skill_key),
    p_admin_user_id,
    nullif(btrim(coalesce(p_admin_email, '')), ''),
    p_source_case_id,
    p_source_decision_id,
    v_note,
    v_event_metadata
  );

  return v_mapping_id;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."finalise_writing_issue_classification_and_learning_item"("p_writing_issue_id" "uuid", "p_parent_user_id" "uuid", "p_child_id" "uuid", "p_final_classification" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_issue public.writing_issues%rowtype;
  v_catalog public.micro_skill_catalog%rowtype;
  v_existing_learning_item public.learning_items%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_learning_item_id uuid;
  v_created_learning_item boolean := false;
  v_reused_learning_item boolean := false;
  v_initial_competency_level integer;
  v_learning_item_blocked_reason text := null;
  v_issue_evidence_type text := null;
  v_issue_evidence_rows_created integer := 0;
  v_child_attempt_evidence_rows_created integer := 0;
begin
  if p_final_classification not in (
    'checking_only',
    'fragile_knowledge',
    'concept_gap',
    'transfer_failure',
    'not_an_issue'
  ) then
    raise exception 'Choose a valid final classification before saving.';
  end if;

  select *
  into v_issue
  from public.writing_issues
  where id = p_writing_issue_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
  for update;

  if not found then
    raise exception 'That writing issue no longer exists.';
  end if;

  if v_issue.issue_status = 'finalised' or v_issue.final_classification is not null then
    raise exception 'That writing issue has already been finalised.';
  end if;

  if v_issue.issue_status <> 'child_responded' then
    raise exception 'Only child responses can be final-classified in this slice.';
  end if;

  select *
  into v_catalog
  from public.micro_skill_catalog
  where micro_skill_key = v_issue.micro_skill_key
    and is_active = true
  limit 1;

  v_initial_competency_level :=
    public.initial_learning_item_competency_for_final_classification(
      p_final_classification
    );
  v_issue_evidence_type :=
    public.learning_item_evidence_type_for_final_classification(
      p_final_classification
    );

  update public.writing_issues
  set
    final_classification = p_final_classification,
    issue_status = 'finalised',
    final_classified_at = v_now,
    updated_at = v_now
  where id = v_issue.id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id;

  if v_initial_competency_level is not null then
    if v_catalog.id is null or not v_catalog.is_assignable then
      v_learning_item_blocked_reason := 'uncatalogued_or_non_assignable_micro_skill';
    else
      select *
      into v_existing_learning_item
      from public.learning_items
      where child_id = v_issue.child_id
        and parent_user_id = v_issue.parent_user_id
        and is_active = true
        and micro_skill_key = v_issue.micro_skill_key
        and practice_route = v_catalog.practice_route
      order by updated_at desc, created_at desc, id desc
      limit 1
      for update;

      if found then
        v_learning_item_id := v_existing_learning_item.id;
        v_reused_learning_item := true;

        update public.learning_items
        set
          updated_at = v_now
        where id = v_existing_learning_item.id;

        insert into public.learning_item_issue_links (
          learning_item_id,
          writing_issue_id,
          child_id,
          parent_user_id,
          link_role,
          metadata,
          created_at,
          updated_at
        )
        values (
          v_learning_item_id,
          v_issue.id,
          v_issue.child_id,
          v_issue.parent_user_id,
          'supporting',
          jsonb_build_object(
            'created_from_final_classification', p_final_classification
          ),
          v_now,
          v_now
        )
        on conflict (learning_item_id, writing_issue_id) do nothing;
      else
        insert into public.learning_items (
          child_id,
          parent_user_id,
          source_writing_issue_id,
          micro_skill_key,
          mastery_domain_key,
          skill_family_key,
          skill_cluster_key,
          practice_route,
          current_competency_level,
          theme_key,
          progress_state,
          is_active,
          metadata,
          created_at,
          updated_at
        )
        values (
          v_issue.child_id,
          v_issue.parent_user_id,
          v_issue.id,
          v_issue.micro_skill_key,
          v_catalog.mastery_domain_key,
          v_catalog.skill_family_key,
          v_catalog.skill_cluster_key,
          v_catalog.practice_route,
          v_initial_competency_level,
          v_issue.theme_key,
          'golden_nugget',
          true,
          jsonb_build_object(
            'created_from_final_classification', p_final_classification,
            'source_issue_status_at_creation', 'finalised'
          ),
          v_now,
          v_now
        )
        on conflict (source_writing_issue_id) do nothing
        returning id into v_learning_item_id;

        if v_learning_item_id is not null then
          v_created_learning_item := true;

          insert into public.learning_item_issue_links (
            learning_item_id,
            writing_issue_id,
            child_id,
            parent_user_id,
            link_role,
            metadata,
            created_at,
            updated_at
          )
          values (
            v_learning_item_id,
            v_issue.id,
            v_issue.child_id,
            v_issue.parent_user_id,
            'origin',
            jsonb_build_object(
              'created_from_final_classification', p_final_classification
            ),
            v_now,
            v_now
          )
          on conflict (learning_item_id, writing_issue_id) do nothing;
        else
          select id
          into v_learning_item_id
          from public.learning_items
          where source_writing_issue_id = v_issue.id
            and parent_user_id = p_parent_user_id
          limit 1;
        end if;
      end if;

      if v_learning_item_id is not null and v_issue_evidence_type is not null then
        insert into public.learning_item_evidence (
          learning_item_id,
          child_id,
          parent_user_id,
          writing_issue_id,
          task_submission_id,
          evidence_type,
          competency_signal,
          source_context,
          metadata,
          created_at,
          updated_at
        )
        values (
          v_learning_item_id,
          v_issue.child_id,
          v_issue.parent_user_id,
          v_issue.id,
          v_issue.task_submission_id,
          v_issue_evidence_type,
          v_initial_competency_level,
          'finalised_issue_outcome',
          jsonb_build_object(
            'final_classification', p_final_classification,
            'micro_skill_key', v_issue.micro_skill_key,
            'linked_learning_item_id', v_learning_item_id
          ),
          v_now,
          v_now
        );

        get diagnostics v_issue_evidence_rows_created = row_count;

        perform public.apply_learning_item_review_state_from_evidence(
          v_learning_item_id,
          v_issue_evidence_type,
          v_initial_competency_level,
          v_now,
          'finalised_issue_outcome'
        );

        insert into public.learning_item_evidence (
          learning_item_id,
          child_id,
          parent_user_id,
          writing_issue_id,
          task_submission_id,
          evidence_type,
          competency_signal,
          source_context,
          metadata,
          created_at,
          updated_at
        )
        select
          v_learning_item_id,
          v_issue.child_id,
          v_issue.parent_user_id,
          attempt.writing_issue_id,
          attempt.task_submission_id,
          public.learning_item_evidence_type_for_correction_attempt(
            coalesce((attempt.metadata ->> 'marked_fixed')::boolean, false),
            attempt.reflection,
            attempt.corrected_independently
          ),
          null,
          'child_correction_attempt',
          jsonb_build_object(
            'corrected_independently', attempt.corrected_independently,
            'reflection', attempt.reflection,
            'marked_fixed', coalesce((attempt.metadata ->> 'marked_fixed')::boolean, false),
            'reflection_source', attempt.metadata ->> 'reflection_source'
          ) || coalesce(attempt.metadata, '{}'::jsonb),
          attempt.created_at,
          v_now
        from public.writing_issue_correction_attempts attempt
        where attempt.writing_issue_id = v_issue.id
          and attempt.parent_user_id = p_parent_user_id;

        get diagnostics v_child_attempt_evidence_rows_created = row_count;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'created_learning_item', v_created_learning_item,
    'reused_learning_item', v_reused_learning_item,
    'learning_item_id', v_learning_item_id,
    'learning_item_blocked_reason', v_learning_item_blocked_reason,
    'progress_state', case when v_learning_item_id is not null then (select progress_state from public.learning_items where id = v_learning_item_id) else null end,
    'issue_evidence_rows_created', v_issue_evidence_rows_created,
    'child_correction_evidence_rows_created', v_child_attempt_evidence_rows_created
  );
end;
$$;




CREATE OR REPLACE FUNCTION "public"."initial_learning_item_competency_for_final_classification"("p_final_classification" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_final_classification
    when 'concept_gap' then 1
    when 'fragile_knowledge' then 2
    when 'transfer_failure' then 3
    else null
  end;
$$;




CREATE OR REPLACE FUNCTION "public"."learning_item_evidence_type_for_controlled_practice"("p_is_correct" boolean) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when p_is_correct is true then 'controlled_practice_success'
    else 'incorrect_use'
  end;
$$;




CREATE OR REPLACE FUNCTION "public"."learning_item_evidence_type_for_correction_attempt"("p_marked_fixed" boolean, "p_reflection" "text", "p_corrected_independently" boolean) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when p_marked_fixed is true
      and p_corrected_independently is true
      and p_reflection = 'easy'
      then 'corrected_independently'
    when p_marked_fixed is true
      then 'corrected_after_prompt'
    else 'incorrect_use'
  end;
$$;




CREATE OR REPLACE FUNCTION "public"."learning_item_evidence_type_for_final_classification"("p_final_classification" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_final_classification
    when 'concept_gap' then 'incorrect_use'
    when 'fragile_knowledge' then 'incorrect_use'
    when 'transfer_failure' then 'incorrect_use'
    else null
  end;
$$;




CREATE OR REPLACE FUNCTION "public"."next_learning_item_competency_for_controlled_practice"("p_current_competency" integer, "p_is_correct" boolean, "p_felt_weak" boolean) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when coalesce(p_current_competency, 0) >= 4 then p_current_competency
    when p_is_correct is true and p_current_competency is null and p_felt_weak is true then 1
    when p_is_correct is true and p_current_competency is null then 3
    when p_is_correct is true and p_felt_weak is true then greatest(least(coalesce(p_current_competency, 1), 3), 1)
    when p_is_correct is true then least(coalesce(p_current_competency, 2) + 1, 3)
    when p_current_competency is null then null
    else greatest(p_current_competency - 1, 1)
  end;
$$;




CREATE OR REPLACE FUNCTION "public"."persist_course_task_positions"("p_module_id" "uuid", "p_task_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_module public.course_modules%rowtype;
  v_existing_ids uuid[];
  v_changed jsonb;
begin
  select *
  into v_module
  from public.course_modules
  where id = p_module_id
    and parent_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'We couldn''t find that module.';
  end if;

  with locked as (
    select id
    from public.course_tasks
    where module_id = p_module_id
      and parent_user_id = auth.uid()
    order by position asc, created_at asc, id asc
    for update
  )
  select coalesce(array_agg(id), '{}'::uuid[])
  into v_existing_ids
  from locked;

  if coalesce(cardinality(v_existing_ids), 0) <> coalesce(cardinality(p_task_ids), 0) then
    raise exception 'We couldn''t place that focus block.';
  end if;

  if exists (
    select 1
    from unnest(p_task_ids) as provided_id
    where not (provided_id = any(v_existing_ids))
  ) then
    raise exception 'We couldn''t place that focus block.';
  end if;

  with input as (
    select task_id, ordinality - 1 as next_position
    from unnest(p_task_ids) with ordinality as ordered(task_id, ordinality)
  ),
  updated as (
    update public.course_tasks as tasks
    set position = input.next_position
    from input
    where tasks.id = input.task_id
      and tasks.parent_user_id = auth.uid()
    returning tasks.id, input.next_position
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', updated.id, 'position', updated.next_position)
      order by updated.next_position asc
    ),
    '[]'::jsonb
  )
  into v_changed
  from updated;

  return jsonb_build_object('changed', v_changed);
end;
$$;




CREATE OR REPLACE FUNCTION "public"."record_controlled_practice_learning_item_evidence"("p_learning_item_id" "uuid", "p_parent_user_id" "uuid", "p_child_id" "uuid", "p_daily_assignment_id" "uuid", "p_target_word" "text", "p_submitted_word" "text", "p_is_correct" boolean, "p_felt_weak" boolean, "p_attempt_mode" "text", "p_attempted_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_learning_item public.learning_items%rowtype;
  v_evidence_type text;
  v_competency_signal integer;
begin
  select *
  into v_learning_item
  from public.learning_items
  where id = p_learning_item_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
    and is_active = true
  for update;

  if not found then
    return jsonb_build_object(
      'evidence_written', false,
      'reason', 'learning_item_not_found'
    );
  end if;

  v_evidence_type :=
    public.learning_item_evidence_type_for_controlled_practice(
      p_is_correct
    );
  v_competency_signal :=
    public.next_learning_item_competency_for_controlled_practice(
      v_learning_item.current_competency_level,
      p_is_correct,
      p_felt_weak
    );

  insert into public.learning_item_evidence (
    learning_item_id,
    child_id,
    parent_user_id,
    writing_issue_id,
    task_submission_id,
    evidence_type,
    competency_signal,
    source_context,
    metadata,
    created_at,
    updated_at
  )
  values (
    v_learning_item.id,
    v_learning_item.child_id,
    v_learning_item.parent_user_id,
    null,
    null,
    v_evidence_type,
    v_competency_signal,
    'controlled_practice_attempt',
    jsonb_build_object(
      'daily_assignment_id', p_daily_assignment_id,
      'target_word', p_target_word,
      'submitted_word', p_submitted_word,
      'attempt_mode', p_attempt_mode,
      'felt_weak', p_felt_weak
    ),
    p_attempted_at,
    p_attempted_at
  );

  perform public.apply_learning_item_review_state_from_evidence(
    v_learning_item.id,
    v_evidence_type,
    v_competency_signal,
    p_attempted_at,
    'controlled_practice_attempt'
  );

  return jsonb_build_object(
    'evidence_written', true,
    'evidence_type', v_evidence_type,
    'competency_signal', v_competency_signal
  );
end;
$$;




CREATE OR REPLACE FUNCTION "public"."reorder_course_checkpoint_adjacent"("p_checkpoint_id" "uuid", "p_direction" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_current public.course_checkpoints%rowtype;
  v_target public.course_checkpoints%rowtype;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Choose a valid checkpoint move.';
  end if;

  select *
  into v_current
  from public.course_checkpoints
  where id = p_checkpoint_id
    and parent_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'We couldn''t find that checkpoint.';
  end if;

  with ordered as (
    select
      id,
      row_number() over (
        order by scheduled_date asc nulls last, created_at desc, id asc
      ) as row_num
    from public.course_checkpoints
    where course_id = v_current.course_id
      and parent_user_id = auth.uid()
      and cycle_number is not distinct from v_current.cycle_number
  ),
  current_row as (
    select row_num
    from ordered
    where id = v_current.id
  )
  select checkpoints.*
  into v_target
  from public.course_checkpoints as checkpoints
  join ordered on ordered.id = checkpoints.id
  join current_row on ordered.row_num = current_row.row_num + case when p_direction = 'up' then -1 else 1 end
  where checkpoints.parent_user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('changed', '[]'::jsonb);
  end if;

  if v_target.scheduled_date is not distinct from v_current.scheduled_date then
    raise exception 'Checkpoints on the same day cannot be reordered until one of the dates changes.';
  end if;

  update public.course_checkpoints
  set scheduled_date = v_target.scheduled_date
  where id = v_current.id
    and parent_user_id = auth.uid();

  update public.course_checkpoints
  set scheduled_date = v_current.scheduled_date
  where id = v_target.id
    and parent_user_id = auth.uid();

  return jsonb_build_object(
    'changed',
    jsonb_build_array(
      jsonb_build_object('id', v_current.id, 'scheduledDate', v_target.scheduled_date),
      jsonb_build_object('id', v_target.id, 'scheduledDate', v_current.scheduled_date)
    )
  );
end;
$$;




CREATE OR REPLACE FUNCTION "public"."reorder_course_module_adjacent"("p_module_id" "uuid", "p_direction" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_current public.course_modules%rowtype;
  v_target_id uuid;
  v_target_position integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Choose a valid module move.';
  end if;

  select *
  into v_current
  from public.course_modules
  where id = p_module_id
    and parent_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'We couldn''t find that module.';
  end if;

  with ordered as (
    select
      id,
      position,
      row_number() over (
        order by position asc, created_at asc, id asc
      ) as row_num
    from public.course_modules
    where course_id = v_current.course_id
      and parent_user_id = auth.uid()
      and phase_id is not distinct from v_current.phase_id
  ),
  current_row as (
    select row_num
    from ordered
    where id = v_current.id
  )
  select id
  into v_target_id
  from ordered, current_row
  where ordered.row_num = current_row.row_num + case when p_direction = 'up' then -1 else 1 end;

  if v_target_id is null then
    return jsonb_build_object('changed', '[]'::jsonb);
  end if;

  select position
  into v_target_position
  from public.course_modules
  where id = v_target_id
    and parent_user_id = auth.uid()
  for update;

  update public.course_modules
  set position = v_target_position
  where id = v_current.id
    and parent_user_id = auth.uid();

  update public.course_modules
  set position = v_current.position
  where id = v_target_id
    and parent_user_id = auth.uid();

  return jsonb_build_object(
    'changed',
    jsonb_build_array(
      jsonb_build_object('id', v_current.id, 'position', v_target_position),
      jsonb_build_object('id', v_target_id, 'position', v_current.position)
    )
  );
end;
$$;




CREATE OR REPLACE FUNCTION "public"."reorder_course_task_adjacent"("p_task_id" "uuid", "p_direction" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_current public.course_tasks%rowtype;
  v_target_id uuid;
  v_target_position integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Choose a valid task move.';
  end if;

  select *
  into v_current
  from public.course_tasks
  where id = p_task_id
    and parent_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'We couldn''t find that task.';
  end if;

  with ordered as (
    select
      id,
      position,
      row_number() over (
        order by position asc, created_at asc, id asc
      ) as row_num
    from public.course_tasks
    where module_id = v_current.module_id
      and parent_user_id = auth.uid()
  ),
  current_row as (
    select row_num
    from ordered
    where id = v_current.id
  )
  select id
  into v_target_id
  from ordered, current_row
  where ordered.row_num = current_row.row_num + case when p_direction = 'up' then -1 else 1 end;

  if v_target_id is null then
    return jsonb_build_object('changed', '[]'::jsonb);
  end if;

  select position
  into v_target_position
  from public.course_tasks
  where id = v_target_id
    and parent_user_id = auth.uid()
  for update;

  update public.course_tasks
  set position = v_target_position
  where id = v_current.id
    and parent_user_id = auth.uid();

  update public.course_tasks
  set position = v_current.position
  where id = v_target_id
    and parent_user_id = auth.uid();

  return jsonb_build_object(
    'changed',
    jsonb_build_array(
      jsonb_build_object('id', v_current.id, 'position', v_target_position),
      jsonb_build_object('id', v_target_id, 'position', v_current.position)
    )
  );
end;
$$;




CREATE OR REPLACE FUNCTION "public"."resolve_spelling_catalog_review_case_admin"("p_case_id" "uuid", "p_admin_user_id" "uuid", "p_admin_email" "text", "p_decision_type" "text", "p_decision_note" "text" DEFAULT NULL::"text", "p_linked_micro_skill_key" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_dialect_code" "text" DEFAULT 'en-GB'::"text", "p_normalization_version" "text" DEFAULT 'spelling_normalize_v1'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_case public.spelling_catalog_review_cases%rowtype;
  v_linked_micro_skill public.micro_skill_catalog%rowtype;
  v_decision_id uuid;
  v_canonical_mapping_id uuid;
  v_decision_type text;
  v_note text;
  v_metadata jsonb;
begin
  if p_admin_user_id is null then
    raise exception 'Catalog-review decisions require an admin user id.';
  end if;

  v_decision_type := btrim(coalesce(p_decision_type, ''));

  if v_decision_type not in (
    'linked_existing_skill',
    'new_skill_needed',
    'add_canonical_mapping',
    'needs_new_micro_skill',
    'word_level_only',
    'not_a_learning_issue',
    'reject_no_canonical_update'
  ) then
    raise exception 'Unsupported catalog-review decision type.';
  end if;

  select *
  into v_case
  from public.spelling_catalog_review_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Catalog-review case not found.';
  end if;

  if v_case.case_status <> 'open' then
    raise exception 'Only open catalog-review cases can be resolved.';
  end if;

  if v_decision_type in ('linked_existing_skill', 'add_canonical_mapping') then
    if p_linked_micro_skill_key is null or btrim(p_linked_micro_skill_key) = '' then
      raise exception 'This catalog-review decision requires a micro-skill key.';
    end if;

    select *
    into v_linked_micro_skill
    from public.micro_skill_catalog
    where micro_skill_key = btrim(p_linked_micro_skill_key)
      and mastery_domain_key = 'D4'
      and is_active = true
      and is_assignable = true;

    if not found then
      raise exception 'Micro-skill must be an active assignable D4 micro-skill.';
    end if;
  elsif p_linked_micro_skill_key is not null and btrim(p_linked_micro_skill_key) <> '' then
    raise exception 'Only canonical mapping or legacy linked-skill decisions may include a micro-skill key.';
  end if;

  v_note := nullif(btrim(coalesce(p_decision_note, '')), '');
  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'resolver_visible',
    false
  );

  insert into public.spelling_catalog_review_case_decisions (
    case_id,
    admin_user_id,
    admin_email,
    decision_type,
    previous_status,
    new_status,
    decision_note,
    linked_micro_skill_key,
    canonical_mapping_id,
    merge_target_case_id,
    superseded_by_case_id,
    metadata
  )
  values (
    p_case_id,
    p_admin_user_id,
    nullif(btrim(coalesce(p_admin_email, '')), ''),
    v_decision_type,
    v_case.case_status,
    v_decision_type,
    v_note,
    case
      when v_decision_type in ('linked_existing_skill', 'add_canonical_mapping')
        then btrim(p_linked_micro_skill_key)
      else null
    end,
    null,
    null,
    null,
    v_metadata || jsonb_build_object(
      'canonical_mapping_created',
      false
    )
  )
  returning id into v_decision_id;

  if v_decision_type = 'add_canonical_mapping' then
    v_canonical_mapping_id := public.create_spelling_canonical_mapping_admin(
      v_case.misspelling_normalized,
      v_case.correct_spelling_normalized,
      btrim(p_linked_micro_skill_key),
      p_admin_user_id,
      p_admin_email,
      p_case_id,
      v_decision_id,
      v_note,
      p_dialect_code,
      p_normalization_version,
      v_metadata || jsonb_build_object('action_source', 'admin_catalog_review_4e2'),
      v_metadata || jsonb_build_object('action_source', 'admin_catalog_review_4e2')
    );

    update public.spelling_catalog_review_case_decisions
    set
      canonical_mapping_id = v_canonical_mapping_id,
      metadata = metadata || jsonb_build_object(
        'canonical_mapping_created',
        true
      )
    where id = v_decision_id;
  end if;

  update public.spelling_catalog_review_cases
  set
    case_status = v_decision_type,
    updated_at = timezone('utc', now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'latest_admin_decision', jsonb_build_object(
        'decision_type', v_decision_type,
        'decided_at', timezone('utc', now()),
        'admin_user_id', p_admin_user_id,
        'linked_micro_skill_key',
          case
            when v_decision_type in ('linked_existing_skill', 'add_canonical_mapping')
              then btrim(p_linked_micro_skill_key)
            else null
          end,
        'canonical_mapping_id', v_canonical_mapping_id,
        'resolver_visible', false
      )
    )
  where id = p_case_id;

  return v_decision_id;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."review_interval_for_learning_item_competency"("p_competency_level" integer) RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when p_competency_level >= 5 then interval '14 days'
    when p_competency_level = 4 then interval '7 days'
    when p_competency_level = 3 then interval '3 days'
    else interval '1 day'
  end;
$$;




CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."validate_spelling_canonical_mapping_row"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_micro_skill public.micro_skill_catalog%rowtype;
begin
  new.misspelling_normalized := btrim(new.misspelling_normalized);
  new.correct_spelling_normalized := btrim(new.correct_spelling_normalized);
  new.micro_skill_key := btrim(new.micro_skill_key);
  new.dialect_code := btrim(coalesce(new.dialect_code, 'en-GB'));
  new.normalization_version := btrim(coalesce(new.normalization_version, 'spelling_normalize_v1'));
  new.created_by_admin_email := nullif(btrim(coalesce(new.created_by_admin_email, '')), '');
  new.deactivated_by_admin_email := nullif(btrim(coalesce(new.deactivated_by_admin_email, '')), '');
  new.decision_note := nullif(btrim(coalesce(new.decision_note, '')), '');
  new.deactivation_note := nullif(btrim(coalesce(new.deactivation_note, '')), '');
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, timezone('utc', now()));
  end if;

  if new.mapping_status = 'active' then
    select *
    into v_micro_skill
    from public.micro_skill_catalog
    where micro_skill_key = new.micro_skill_key
      and mastery_domain_key = 'D4'
      and is_active = true
      and is_assignable = true;

    if not found then
      raise exception 'Active canonical mappings require an active assignable D4 micro-skill.';
    end if;
  end if;

  return new;
end;
$$;



SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assignment_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "daily_assignment_id" "uuid",
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "domain_module" "text" NOT NULL,
    "item_type" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_entity_id" "text" NOT NULL,
    "learning_item_id" "uuid",
    "template_key" "text",
    "target_word" "text",
    "prompt_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expected_answer" "jsonb",
    "position" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "assignment_items_domain_module_check" CHECK (("domain_module" = ANY (ARRAY['spelling'::"text", 'punctuation'::"text", 'sentence_boundaries'::"text", 'grammar'::"text", 'vocabulary'::"text", 'proofreading'::"text", 'paragraph_revision'::"text", 'writing_transfer'::"text"]))),
    CONSTRAINT "assignment_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ready'::"text", 'completed'::"text", 'cancelled'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."child_gold_bar_ledger_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "source" "text" NOT NULL,
    "related_entity_type" "text",
    "related_entity_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "child_gold_bar_ledger_events_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "child_gold_bar_ledger_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['earned'::"text", 'converted'::"text", 'adjusted'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."child_gold_coin_ledger_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "source" "text" NOT NULL,
    "related_entity_type" "text",
    "related_entity_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "child_gold_coin_ledger_events_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "child_gold_coin_ledger_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['earned_daily'::"text", 'earned_task'::"text", 'earned_module'::"text", 'earned_focus_block'::"text", 'earned_course'::"text", 'earned_checkpoint'::"text", 'converted_from_bar'::"text", 'reserved_transfer'::"text", 'released_transfer'::"text", 'spent'::"text", 'transferred'::"text", 'adjusted'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."children" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "date_of_birth" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "ingredient_count" integer DEFAULT 0 NOT NULL,
    "reward_vouchers_available" integer DEFAULT 0 NOT NULL,
    "gold_coin_balance" integer DEFAULT 0 NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."course_checkpoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "module_id" "uuid",
    "parent_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "target" "text",
    "scheduled_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cycle_number" integer,
    "gold_coin_reward_amount" integer DEFAULT 0 NOT NULL,
    "coin_reward_trigger" "text" DEFAULT 'on_completion'::"text" NOT NULL,
    "phase_id" "uuid",
    CONSTRAINT "course_checkpoints_coin_reward_trigger_check" CHECK (("coin_reward_trigger" = ANY (ARRAY['none'::"text", 'on_completion'::"text"]))),
    CONSTRAINT "course_checkpoints_gold_coin_reward_amount_check" CHECK ((("gold_coin_reward_amount" >= 0) AND ("gold_coin_reward_amount" <= 500)))
);




CREATE TABLE IF NOT EXISTS "public"."course_goal_task_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."course_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "goal_type" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "target_quantity" integer NOT NULL,
    "progress_source" "text" NOT NULL,
    "time_span" "text" NOT NULL,
    "success_description" "text",
    "stretch_target" integer,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_goals_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['count_goal'::"text", 'completion_goal'::"text", 'skill_goal'::"text", 'submission_goal'::"text"]))),
    CONSTRAINT "course_goals_progress_source_check" CHECK (("progress_source" = ANY (ARRAY['task_completion'::"text", 'task_submission'::"text", 'focus_block_completion'::"text", 'manual_review'::"text", 'spelling_progress'::"text"]))),
    CONSTRAINT "course_goals_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'active'::"text", 'secure'::"text", 'paused'::"text"]))),
    CONSTRAINT "course_goals_stretch_target_check" CHECK ((("stretch_target" IS NULL) OR ("stretch_target" > 0))),
    CONSTRAINT "course_goals_target_quantity_check" CHECK (("target_quantity" > 0)),
    CONSTRAINT "course_goals_time_span_check" CHECK (("time_span" = ANY (ARRAY['monthly'::"text", 'cycle'::"text", 'course_duration'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."course_modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phase_id" "uuid",
    "gold_coin_reward_amount" integer DEFAULT 0 NOT NULL,
    "coin_reward_trigger" "text" DEFAULT 'on_completion'::"text" NOT NULL,
    CONSTRAINT "course_modules_coin_reward_trigger_check" CHECK (("coin_reward_trigger" = ANY (ARRAY['none'::"text", 'on_completion'::"text"]))),
    CONSTRAINT "course_modules_gold_coin_reward_amount_check" CHECK ((("gold_coin_reward_amount" >= 0) AND ("gold_coin_reward_amount" <= 500)))
);




CREATE TABLE IF NOT EXISTS "public"."course_phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "badge_image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_date" "date",
    "end_date" "date"
);




CREATE TABLE IF NOT EXISTS "public"."course_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "task_type" "text" NOT NULL,
    "instructions" "text",
    "writing_prompt" "text",
    "estimated_minutes" integer,
    "weekly_days" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "monthly_goal_total" integer,
    "focus_block_id" "uuid",
    "gold_bar_rule" "text" DEFAULT 'auto'::"text" NOT NULL,
    "choice_options" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "allow_multiple_choices" boolean DEFAULT false NOT NULL,
    "gold_coin_reward_amount" integer DEFAULT 0 NOT NULL,
    "lesson_schema" "jsonb",
    "coin_reward_trigger" "text" DEFAULT 'on_approval'::"text" NOT NULL,
    CONSTRAINT "course_tasks_coin_reward_trigger_check" CHECK (("coin_reward_trigger" = ANY (ARRAY['none'::"text", 'on_completion'::"text", 'on_approval'::"text", 'on_target'::"text"]))),
    CONSTRAINT "course_tasks_gold_bar_rule_check" CHECK (("gold_bar_rule" = ANY (ARRAY['auto'::"text", 'on_completion'::"text", 'on_monthly_target'::"text", 'none'::"text"]))),
    CONSTRAINT "course_tasks_gold_coin_reward_amount_check" CHECK ((("gold_coin_reward_amount" >= 0) AND ("gold_coin_reward_amount" <= 500))),
    CONSTRAINT "course_tasks_task_type_check" CHECK (("task_type" = ANY (ARRAY['checklist'::"text", 'lesson'::"text", 'test'::"text", 'recurring_daily'::"text", 'recurring_weekly'::"text", 'checkpoint'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_date" "date",
    "duration_weeks" integer,
    "cycle_length_weeks" integer DEFAULT 4 NOT NULL,
    "structure_type" "text" DEFAULT 'timed'::"text" NOT NULL,
    "gold_coin_reward_amount" integer DEFAULT 0 NOT NULL,
    "coin_reward_trigger" "text" DEFAULT 'on_completion'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "courses_coin_reward_trigger_check" CHECK (("coin_reward_trigger" = ANY (ARRAY['none'::"text", 'on_completion'::"text"]))),
    CONSTRAINT "courses_gold_coin_reward_amount_check" CHECK ((("gold_coin_reward_amount" >= 0) AND ("gold_coin_reward_amount" <= 500))),
    CONSTRAINT "courses_structure_type_check" CHECK (("structure_type" = ANY (ARRAY['phased'::"text", 'timed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."daily_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "assignment_date" "date" NOT NULL,
    "title" "text",
    "instructions" "text",
    "target_words" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "word_family_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "review_words" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "focus_word" "text",
    "selected_family_slug" "text",
    "session_started_at" timestamp with time zone,
    "session_completed_at" timestamp with time zone,
    "session_completed_words" integer DEFAULT 0 NOT NULL,
    "ingredient_awarded" boolean DEFAULT false NOT NULL,
    "gold_coin_awarded" boolean DEFAULT false NOT NULL,
    "assignment_generation_source" "text" DEFAULT 'legacy_word_progress'::"text" NOT NULL,
    "source_learning_item_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    CONSTRAINT "daily_assignments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'skipped'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."focus_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "module_id" "uuid",
    "parent_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "goal" "text",
    "description" "text",
    "start_date" "date",
    "end_date" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cycle_number" integer,
    "gold_coin_reward_amount" integer DEFAULT 0 NOT NULL,
    "coin_reward_trigger" "text" DEFAULT 'on_completion'::"text" NOT NULL,
    CONSTRAINT "focus_blocks_coin_reward_trigger_check" CHECK (("coin_reward_trigger" = ANY (ARRAY['none'::"text", 'on_completion'::"text"]))),
    CONSTRAINT "focus_blocks_gold_coin_reward_amount_check" CHECK ((("gold_coin_reward_amount" >= 0) AND ("gold_coin_reward_amount" <= 500)))
);




CREATE TABLE IF NOT EXISTS "public"."gold_coin_transfer_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "gold_coin_amount" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "child_note" "text",
    "parent_note" "text",
    "approved_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "fulfilled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gold_coin_transfer_requests_gold_coin_amount_check" CHECK ((("gold_coin_amount" >= 100) AND ("mod"("gold_coin_amount", 100) = 0))),
    CONSTRAINT "gold_coin_transfer_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text", 'cancelled'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."learning_item_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learning_item_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "writing_issue_id" "uuid",
    "task_submission_id" "uuid",
    "evidence_type" "text" NOT NULL,
    "competency_signal" integer,
    "source_context" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "learning_item_evidence_competency_signal_check" CHECK ((("competency_signal" IS NULL) OR (("competency_signal" >= 1) AND ("competency_signal" <= 5)))),
    CONSTRAINT "learning_item_evidence_type_check" CHECK (("evidence_type" = ANY (ARRAY['incorrect_use'::"text", 'corrected_after_prompt'::"text", 'corrected_independently'::"text", 'controlled_practice_success'::"text", 'authentic_correct_use'::"text", 'delayed_authentic_correct_use'::"text", 'repeated_correct_use'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."learning_item_issue_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learning_item_id" "uuid" NOT NULL,
    "writing_issue_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "link_role" "text" DEFAULT 'origin'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "learning_item_issue_links_role_check" CHECK (("link_role" = ANY (ARRAY['origin'::"text", 'supporting'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."learning_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "source_writing_issue_id" "uuid",
    "micro_skill_key" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "theme_key" "text",
    "progress_state" "text" DEFAULT 'golden_nugget'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "mastery_domain_key" "text",
    "skill_family_key" "text",
    "skill_cluster_key" "text",
    "practice_route" "text",
    "current_competency_level" integer,
    "target_competency_level" integer,
    "review_due_at" timestamp with time zone,
    "last_meaningful_success_at" timestamp with time zone,
    "last_meaningful_failure_at" timestamp with time zone,
    CONSTRAINT "learning_items_current_competency_level_check" CHECK ((("current_competency_level" IS NULL) OR (("current_competency_level" >= 1) AND ("current_competency_level" <= 5)))),
    CONSTRAINT "learning_items_practice_route_check" CHECK ((("practice_route" IS NULL) OR ("practice_route" = ANY (ARRAY['word_practice'::"text", 'grouped_set_practice'::"text"])))),
    CONSTRAINT "learning_items_progress_state_check" CHECK (("progress_state" = ANY (ARRAY['golden_nugget'::"text", 'in_machine'::"text", 'gold_bar'::"text"]))),
    CONSTRAINT "learning_items_target_competency_level_check" CHECK ((("target_competency_level" IS NULL) OR (("target_competency_level" >= 1) AND ("target_competency_level" <= 5))))
);




CREATE TABLE IF NOT EXISTS "public"."micro_skill_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mastery_domain_key" "text" NOT NULL,
    "skill_family_key" "text" NOT NULL,
    "skill_cluster_key" "text",
    "micro_skill_key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "practice_route" "text" NOT NULL,
    "is_assignable" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "allowed_template_keys" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "micro_skill_catalog_practice_route_check" CHECK (("practice_route" = ANY (ARRAY['word_practice'::"text", 'grouped_set_practice'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."micro_skill_clusters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mastery_domain_key" "text" NOT NULL,
    "skill_family_key" "text" NOT NULL,
    "skill_cluster_key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "is_assignable" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."micro_skill_families" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mastery_domain_key" "text" NOT NULL,
    "skill_family_key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "is_assignable" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."misspelling_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "writing_sample_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "misspelled_word" "text" NOT NULL,
    "corrected_word" "text" NOT NULL,
    "word_family_id" "uuid",
    "context_text" "text",
    "position_start" integer,
    "position_end" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_type" "text",
    "secondary_error_type" "text",
    "confidence_score" numeric(4,2),
    "suggested_word" "text",
    "is_parent_overridden" boolean DEFAULT false NOT NULL,
    "is_false_positive" boolean DEFAULT false NOT NULL,
    CONSTRAINT "misspelling_instances_error_type_check" CHECK ((("error_type" IS NULL) OR ("error_type" = ANY (ARRAY['Phonic'::"text", 'Pattern/rule'::"text", 'Morphology'::"text", 'Irregular/tricky memory word'::"text", 'Careless performance error'::"text"])))),
    CONSTRAINT "misspelling_instances_secondary_error_type_check" CHECK ((("secondary_error_type" IS NULL) OR ("secondary_error_type" = ANY (ARRAY['Phonic'::"text", 'Pattern/rule'::"text", 'Morphology'::"text", 'Irregular/tricky memory word'::"text", 'Careless performance error'::"text"]))))
);




CREATE TABLE IF NOT EXISTS "public"."parent_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "domain_module" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_entity_id" "text" NOT NULL,
    "task_submission_id" "uuid",
    "writing_sample_id" "uuid",
    "suggested_category_code" "text",
    "suggested_micro_skill_key" "text",
    "suggested_template_key" "text",
    "suggestion_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "decision" "text" NOT NULL,
    "verified_category_code" "text",
    "verified_micro_skill_key" "text",
    "verified_template_key" "text",
    "verification_notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "verified_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "parent_verifications_decision_check" CHECK (("decision" = ANY (ARRAY['accepted'::"text", 'overridden'::"text", 'false_positive'::"text", 'not_a_learning_issue'::"text"]))),
    CONSTRAINT "parent_verifications_domain_module_check" CHECK (("domain_module" = ANY (ARRAY['spelling'::"text", 'punctuation'::"text", 'sentence_boundaries'::"text", 'grammar'::"text", 'vocabulary'::"text", 'proofreading'::"text", 'paragraph_revision'::"text", 'writing_transfer'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."parent_verified_spelling_candidate_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_verification_id" "uuid" NOT NULL,
    "task_submission_id" "uuid",
    "writing_sample_id" "uuid",
    "source_suggestion_id" "uuid",
    "source_misspelling_instance_id" "uuid",
    "source_provenance" "text" NOT NULL,
    "reviewed_event_source_entity_id" "text" NOT NULL,
    "original_child_spelling" "text",
    "original_correct_spelling" "text",
    "misspelling_normalized" "text" NOT NULL,
    "correct_spelling_normalized" "text" NOT NULL,
    "micro_skill_key" "text" NOT NULL,
    "candidate_status" "text" DEFAULT 'pending_parent_promotion'::"text" NOT NULL,
    "promotion_scope" "text" DEFAULT 'parent_local'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "parent_verified_spelling_candidate_mappings_scope_check" CHECK (("promotion_scope" = ANY (ARRAY['child_local'::"text", 'parent_local'::"text", 'global'::"text"]))),
    CONSTRAINT "parent_verified_spelling_candidate_mappings_source_provenance_c" CHECK (("source_provenance" = ANY (ARRAY['lesson_submission_existing_output'::"text", 'lesson_submission_parent_added_missed_word'::"text"]))),
    CONSTRAINT "parent_verified_spelling_candidate_mappings_status_check" CHECK (("candidate_status" = ANY (ARRAY['pending_parent_promotion'::"text", 'parent_local_promoted'::"text", 'admin_review_requested'::"text", 'global_canonical_promoted'::"text", 'rejected'::"text", 'superseded'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."personal_lesson_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "lesson_schema" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "personal_lesson_templates_lesson_schema_object" CHECK (("jsonb_typeof"("lesson_schema") = 'object'::"text")),
    CONSTRAINT "personal_lesson_templates_title_nonempty" CHECK (("char_length"("btrim"("title")) > 0))
);




CREATE TABLE IF NOT EXISTS "public"."practice_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "daily_assignment_id" "uuid",
    "word_progress_id" "uuid",
    "target_word" "text" NOT NULL,
    "submitted_word" "text" NOT NULL,
    "is_correct" boolean NOT NULL,
    "attempt_mode" "text" DEFAULT 'spelling'::"text" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "practice_attempts_attempt_mode_check" CHECK (("attempt_mode" = ANY (ARRAY['spelling'::"text", 'dictation'::"text", 'review'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."spelling_canonical_mapping_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mapping_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "previous_status" "text",
    "new_status" "text",
    "previous_misspelling_normalized" "text",
    "new_misspelling_normalized" "text",
    "previous_correct_spelling_normalized" "text",
    "new_correct_spelling_normalized" "text",
    "previous_micro_skill_key" "text",
    "new_micro_skill_key" "text",
    "admin_user_id" "uuid" NOT NULL,
    "admin_email" "text",
    "source_case_id" "uuid",
    "source_decision_id" "uuid",
    "note" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "spelling_canonical_mapping_events_status_check" CHECK (((("previous_status" IS NULL) OR ("previous_status" = ANY (ARRAY['active'::"text", 'disabled'::"text", 'deprecated'::"text", 'superseded'::"text"]))) AND (("new_status" IS NULL) OR ("new_status" = ANY (ARRAY['active'::"text", 'disabled'::"text", 'deprecated'::"text", 'superseded'::"text"]))))),
    CONSTRAINT "spelling_canonical_mapping_events_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'disabled'::"text", 'deprecated'::"text", 'superseded'::"text", 'metadata_updated'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."spelling_canonical_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "misspelling_normalized" "text" NOT NULL,
    "correct_spelling_normalized" "text" NOT NULL,
    "micro_skill_key" "text" NOT NULL,
    "mapping_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "dialect_code" "text" DEFAULT 'en-GB'::"text" NOT NULL,
    "normalization_version" "text" DEFAULT 'spelling_normalize_v1'::"text" NOT NULL,
    "source_case_id" "uuid",
    "source_decision_id" "uuid",
    "created_by_admin_user_id" "uuid" NOT NULL,
    "created_by_admin_email" "text",
    "decision_note" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "replacement_mapping_id" "uuid",
    "deactivated_at" timestamp with time zone,
    "deactivated_by_admin_user_id" "uuid",
    "deactivated_by_admin_email" "text",
    "deactivation_note" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "spelling_canonical_mappings_dialect_code_check" CHECK (("btrim"("dialect_code") <> ''::"text")),
    CONSTRAINT "spelling_canonical_mappings_normalization_version_check" CHECK (("btrim"("normalization_version") <> ''::"text")),
    CONSTRAINT "spelling_canonical_mappings_normalized_words_check" CHECK ((("btrim"("misspelling_normalized") <> ''::"text") AND ("btrim"("correct_spelling_normalized") <> ''::"text") AND ("btrim"("misspelling_normalized") <> "btrim"("correct_spelling_normalized")))),
    CONSTRAINT "spelling_canonical_mappings_status_check" CHECK (("mapping_status" = ANY (ARRAY['active'::"text", 'disabled'::"text", 'deprecated'::"text", 'superseded'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."spelling_catalog_review_case_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "admin_email" "text",
    "decision_type" "text" NOT NULL,
    "previous_status" "text" NOT NULL,
    "new_status" "text" NOT NULL,
    "decision_note" "text",
    "linked_micro_skill_key" "text",
    "canonical_mapping_id" "uuid",
    "merge_target_case_id" "uuid",
    "superseded_by_case_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "spelling_catalog_review_case_decisions_linked_skill_check" CHECK (((("decision_type" = 'linked_existing_skill'::"text") AND ("linked_micro_skill_key" IS NOT NULL) AND ("canonical_mapping_id" IS NULL)) OR (("decision_type" = 'add_canonical_mapping'::"text") AND ("linked_micro_skill_key" IS NOT NULL)) OR (("decision_type" <> ALL (ARRAY['linked_existing_skill'::"text", 'add_canonical_mapping'::"text"])) AND ("linked_micro_skill_key" IS NULL) AND ("canonical_mapping_id" IS NULL)))),
    CONSTRAINT "spelling_catalog_review_case_decisions_status_check" CHECK ((("previous_status" = ANY (ARRAY['open'::"text", 'linked_existing_skill'::"text", 'new_skill_needed'::"text", 'add_canonical_mapping'::"text", 'needs_new_micro_skill'::"text", 'word_level_only'::"text", 'not_a_learning_issue'::"text", 'reject_no_canonical_update'::"text", 'closed_duplicate'::"text", 'superseded'::"text"])) AND ("new_status" = ANY (ARRAY['open'::"text", 'linked_existing_skill'::"text", 'new_skill_needed'::"text", 'add_canonical_mapping'::"text", 'needs_new_micro_skill'::"text", 'word_level_only'::"text", 'not_a_learning_issue'::"text", 'reject_no_canonical_update'::"text", 'closed_duplicate'::"text", 'superseded'::"text"])))),
    CONSTRAINT "spelling_catalog_review_case_decisions_type_check" CHECK (("decision_type" = ANY (ARRAY['linked_existing_skill'::"text", 'new_skill_needed'::"text", 'add_canonical_mapping'::"text", 'needs_new_micro_skill'::"text", 'word_level_only'::"text", 'not_a_learning_issue'::"text", 'reject_no_canonical_update'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."spelling_catalog_review_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "task_submission_id" "uuid" NOT NULL,
    "writing_sample_id" "uuid",
    "source_suggestion_id" "uuid",
    "source_misspelling_instance_id" "uuid" NOT NULL,
    "source_provenance" "text" NOT NULL,
    "reviewed_event_source_entity_id" "text" NOT NULL,
    "original_child_spelling" "text",
    "original_correct_spelling" "text",
    "misspelling_normalized" "text" NOT NULL,
    "correct_spelling_normalized" "text" NOT NULL,
    "case_status" "text" DEFAULT 'open'::"text" NOT NULL,
    "parent_note" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "spelling_catalog_review_cases_source_provenance_check" CHECK (("source_provenance" = ANY (ARRAY['lesson_submission_existing_output'::"text", 'lesson_submission_parent_added_missed_word'::"text"]))),
    CONSTRAINT "spelling_catalog_review_cases_status_check" CHECK (("case_status" = ANY (ARRAY['open'::"text", 'linked_existing_skill'::"text", 'new_skill_needed'::"text", 'add_canonical_mapping'::"text", 'needs_new_micro_skill'::"text", 'word_level_only'::"text", 'not_a_learning_issue'::"text", 'reject_no_canonical_update'::"text", 'closed_duplicate'::"text", 'superseded'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."spelling_reward_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "target_word" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    CONSTRAINT "spelling_reward_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['golden_nugget_discovered'::"text", 'moved_to_warm_workshop'::"text", 'gold_bar_earned'::"text", 'gold_bar_regressed'::"text", 'gold_bar_restored'::"text", 'gold_bar_converted'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."spelling_reward_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "target_word" "text" NOT NULL,
    "reward_state" "text" DEFAULT 'none'::"text" NOT NULL,
    "golden_nugget_at" timestamp with time zone,
    "warm_workshop_at" timestamp with time zone,
    "gold_bar_earned_at" timestamp with time zone,
    "gold_bar_converted_at" timestamp with time zone,
    "has_converted_gold_bar" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "spelling_reward_states_reward_state_check" CHECK (("reward_state" = ANY (ARRAY['none'::"text", 'golden_nugget'::"text", 'warm_workshop'::"text", 'gold_bar_earned'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."task_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "completion_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quantity_completed" integer DEFAULT 1 NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."task_day_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "planned_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."task_submission_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "draft_text" "text" DEFAULT ''::"text" NOT NULL,
    "draft_review_summary" "text",
    "draft_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."task_submission_payloads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "payload_type" "text" NOT NULL,
    "payload_version" integer DEFAULT 1 NOT NULL,
    "payload_json" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "task_submission_payloads_payload_type_check" CHECK (("payload_type" = ANY (ARRAY['structured_lesson_response'::"text", 'structured_test_response'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."task_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "submission_text" "text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_review_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "parent_review_note" "text",
    "parent_reviewed_at" timestamp with time zone,
    CONSTRAINT "task_submissions_parent_review_status_check" CHECK (("parent_review_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'returned'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."task_week_selections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."word_families" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_user_id" "uuid",
    "family_name" "text" NOT NULL,
    "description" "text",
    "examples" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text" NOT NULL,
    "category" "text" NOT NULL,
    "priority" integer NOT NULL,
    "teaching_note" "text" NOT NULL,
    CONSTRAINT "word_families_category_check" CHECK (("category" = ANY (ARRAY['pattern_rule'::"text", 'morphology'::"text", 'irregular_tricky'::"text", 'phonic'::"text", 'homophone'::"text"]))),
    CONSTRAINT "word_families_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 5)))
);




CREATE TABLE IF NOT EXISTS "public"."word_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "target_word" "text" NOT NULL,
    "word_family_id" "uuid",
    "mastery_level" integer DEFAULT 0 NOT NULL,
    "times_assigned" integer DEFAULT 0 NOT NULL,
    "times_practised" integer DEFAULT 0 NOT NULL,
    "correct_attempts" integer DEFAULT 0 NOT NULL,
    "incorrect_attempts" integer DEFAULT 0 NOT NULL,
    "last_assigned_at" timestamp with time zone,
    "last_practised_at" timestamp with time zone,
    "mastered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "has_ever_mastered" boolean DEFAULT false NOT NULL,
    CONSTRAINT "word_progress_correct_attempts_check" CHECK (("correct_attempts" >= 0)),
    CONSTRAINT "word_progress_incorrect_attempts_check" CHECK (("incorrect_attempts" >= 0)),
    CONSTRAINT "word_progress_mastery_level_check" CHECK ((("mastery_level" >= 0) AND ("mastery_level" <= 5))),
    CONSTRAINT "word_progress_times_assigned_check" CHECK (("times_assigned" >= 0)),
    CONSTRAINT "word_progress_times_practised_check" CHECK (("times_practised" >= 0))
);




CREATE TABLE IF NOT EXISTS "public"."writing_false_positive_suppressions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "misspelled_word" "text" NOT NULL,
    "corrected_word" "text" NOT NULL,
    "source_writing_issue_suggestion_id" "uuid",
    "source_misspelling_instance_id" "uuid",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."writing_issue_correction_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "writing_issue_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "task_submission_id" "uuid",
    "attempted_correction" "text",
    "attempt_notes" "text",
    "corrected_independently" boolean DEFAULT false NOT NULL,
    "reflection" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "writing_issue_correction_attempts_reflection_check" CHECK (("reflection" = ANY (ARRAY['easy'::"text", 'medium'::"text", 'hard'::"text", 'needed_help'::"text", 'could_not_fix'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."writing_issue_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "task_submission_id" "uuid",
    "writing_sample_id" "uuid",
    "misspelling_instance_id" "uuid",
    "source_type" "text" DEFAULT 'misspelling_instance'::"text" NOT NULL,
    "suggestion_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "observed_text" "text",
    "suggested_replacement" "text",
    "context_text" "text",
    "source_field_key" "text",
    "position_start" integer,
    "position_end" integer,
    "suggested_micro_skill_key" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "suggested_theme_key" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rejected_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "writing_issue_suggestions_position_check" CHECK (((("position_start" IS NULL) AND ("position_end" IS NULL)) OR (("position_start" IS NOT NULL) AND ("position_end" IS NOT NULL) AND ("position_start" >= 0) AND ("position_end" > "position_start")))),
    CONSTRAINT "writing_issue_suggestions_source_type_check" CHECK (("source_type" = ANY (ARRAY['misspelling_instance'::"text", 'parent_manual'::"text", 'historic_mistake'::"text", 'micro_skill_watchlist'::"text", 'transfer_failure_watchlist'::"text", 'other'::"text"]))),
    CONSTRAINT "writing_issue_suggestions_status_check" CHECK (("suggestion_status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'superseded'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."writing_issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "task_submission_id" "uuid",
    "writing_sample_id" "uuid",
    "source_suggestion_id" "uuid",
    "source_misspelling_instance_id" "uuid",
    "linked_word_progress_id" "uuid",
    "reactivates_writing_issue_id" "uuid",
    "issue_status" "text" DEFAULT 'pending_parent_review'::"text" NOT NULL,
    "final_classification" "text",
    "observed_text" "text",
    "suggested_replacement" "text",
    "approved_replacement" "text",
    "context_text" "text",
    "source_field_key" "text",
    "position_start" integer,
    "position_end" integer,
    "micro_skill_key" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "theme_key" "text",
    "parent_review_note" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "parent_marked_at" timestamp with time zone,
    "sent_back_at" timestamp with time zone,
    "child_responded_at" timestamp with time zone,
    "final_classified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "writing_issues_final_classification_check" CHECK ((("final_classification" IS NULL) OR ("final_classification" = ANY (ARRAY['checking_only'::"text", 'fragile_knowledge'::"text", 'concept_gap'::"text", 'transfer_failure'::"text", 'not_an_issue'::"text"])))),
    CONSTRAINT "writing_issues_finalised_requires_timestamp_check" CHECK ((("issue_status" <> 'finalised'::"text") OR ("final_classified_at" IS NOT NULL))),
    CONSTRAINT "writing_issues_position_check" CHECK (((("position_start" IS NULL) AND ("position_end" IS NULL)) OR (("position_start" IS NOT NULL) AND ("position_end" IS NOT NULL) AND ("position_start" >= 0) AND ("position_end" > "position_start")))),
    CONSTRAINT "writing_issues_status_check" CHECK (("issue_status" = ANY (ARRAY['pending_parent_review'::"text", 'sent_back_to_child'::"text", 'child_responded'::"text", 'finalised'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."writing_samples" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_user_id" "uuid" NOT NULL,
    "title" "text",
    "sample_text" "text" NOT NULL,
    "written_at" "date",
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "task_submission_id" "uuid",
    "review_completed_at" timestamp with time zone,
    "review_completed_by" "uuid"
);




ALTER TABLE ONLY "public"."assignment_items"
    ADD CONSTRAINT "assignment_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."child_gold_bar_ledger_events"
    ADD CONSTRAINT "child_gold_bar_ledger_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."child_gold_coin_ledger_events"
    ADD CONSTRAINT "child_gold_coin_ledger_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."children"
    ADD CONSTRAINT "children_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_checkpoints"
    ADD CONSTRAINT "course_checkpoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_goal_task_sources"
    ADD CONSTRAINT "course_goal_task_sources_goal_id_task_id_key" UNIQUE ("goal_id", "task_id");



ALTER TABLE ONLY "public"."course_goal_task_sources"
    ADD CONSTRAINT "course_goal_task_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_goals"
    ADD CONSTRAINT "course_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_modules"
    ADD CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_phases"
    ADD CONSTRAINT "course_phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_tasks"
    ADD CONSTRAINT "course_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_child_id_assignment_date_title_key" UNIQUE ("child_id", "assignment_date", "title");



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."focus_blocks"
    ADD CONSTRAINT "focus_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gold_coin_transfer_requests"
    ADD CONSTRAINT "gold_coin_transfer_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_item_evidence"
    ADD CONSTRAINT "learning_item_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_item_issue_links"
    ADD CONSTRAINT "learning_item_issue_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_items"
    ADD CONSTRAINT "learning_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."micro_skill_catalog"
    ADD CONSTRAINT "micro_skill_catalog_micro_skill_key_key" UNIQUE ("micro_skill_key");



ALTER TABLE ONLY "public"."micro_skill_catalog"
    ADD CONSTRAINT "micro_skill_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."micro_skill_clusters"
    ADD CONSTRAINT "micro_skill_clusters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."micro_skill_clusters"
    ADD CONSTRAINT "micro_skill_clusters_skill_cluster_key_key" UNIQUE ("skill_cluster_key");



ALTER TABLE ONLY "public"."micro_skill_families"
    ADD CONSTRAINT "micro_skill_families_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."micro_skill_families"
    ADD CONSTRAINT "micro_skill_families_skill_family_key_key" UNIQUE ("skill_family_key");



ALTER TABLE ONLY "public"."misspelling_instances"
    ADD CONSTRAINT "misspelling_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_verifications"
    ADD CONSTRAINT "parent_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_candidate_m_parent_verification_id_key" UNIQUE ("parent_verification_id");



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_candidate_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_lesson_templates"
    ADD CONSTRAINT "personal_lesson_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."practice_attempts"
    ADD CONSTRAINT "practice_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spelling_canonical_mapping_events"
    ADD CONSTRAINT "spelling_canonical_mapping_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spelling_canonical_mappings"
    ADD CONSTRAINT "spelling_canonical_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spelling_catalog_review_case_decisions"
    ADD CONSTRAINT "spelling_catalog_review_case_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spelling_catalog_review_cases"
    ADD CONSTRAINT "spelling_catalog_review_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spelling_reward_events"
    ADD CONSTRAINT "spelling_reward_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spelling_reward_states"
    ADD CONSTRAINT "spelling_reward_states_child_id_target_word_key" UNIQUE ("child_id", "target_word");



ALTER TABLE ONLY "public"."spelling_reward_states"
    ADD CONSTRAINT "spelling_reward_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_day_plans"
    ADD CONSTRAINT "task_day_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_submission_drafts"
    ADD CONSTRAINT "task_submission_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_submission_payloads"
    ADD CONSTRAINT "task_submission_payloads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_week_selections"
    ADD CONSTRAINT "task_week_selections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."word_families"
    ADD CONSTRAINT "word_families_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."word_families"
    ADD CONSTRAINT "word_families_slug_unique_per_parent" UNIQUE ("parent_user_id", "slug");



ALTER TABLE ONLY "public"."word_progress"
    ADD CONSTRAINT "word_progress_child_id_target_word_key" UNIQUE ("child_id", "target_word");



ALTER TABLE ONLY "public"."word_progress"
    ADD CONSTRAINT "word_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."writing_false_positive_suppressions"
    ADD CONSTRAINT "writing_false_positive_suppressions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."writing_issue_correction_attempts"
    ADD CONSTRAINT "writing_issue_correction_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."writing_issue_suggestions"
    ADD CONSTRAINT "writing_issue_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."writing_issues"
    ADD CONSTRAINT "writing_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."writing_samples"
    ADD CONSTRAINT "writing_samples_pkey" PRIMARY KEY ("id");



CREATE INDEX "assignment_items_child_idx" ON "public"."assignment_items" USING "btree" ("child_id", "domain_module", "created_at" DESC);



CREATE INDEX "assignment_items_daily_assignment_idx" ON "public"."assignment_items" USING "btree" ("daily_assignment_id", "position");



CREATE INDEX "child_gold_bar_ledger_events_child_created_idx" ON "public"."child_gold_bar_ledger_events" USING "btree" ("child_id", "created_at" DESC);



CREATE INDEX "child_gold_coin_ledger_events_child_created_idx" ON "public"."child_gold_coin_ledger_events" USING "btree" ("child_id", "created_at" DESC);



CREATE INDEX "children_parent_user_archived_idx" ON "public"."children" USING "btree" ("parent_user_id", "is_archived");



CREATE INDEX "children_parent_user_id_idx" ON "public"."children" USING "btree" ("parent_user_id");



CREATE INDEX "course_checkpoints_course_idx" ON "public"."course_checkpoints" USING "btree" ("course_id", "scheduled_date", "created_at" DESC);



CREATE INDEX "course_checkpoints_phase_idx" ON "public"."course_checkpoints" USING "btree" ("phase_id");



CREATE INDEX "course_goal_task_sources_course_idx" ON "public"."course_goal_task_sources" USING "btree" ("course_id", "created_at");



CREATE INDEX "course_goal_task_sources_goal_idx" ON "public"."course_goal_task_sources" USING "btree" ("goal_id", "created_at");



CREATE INDEX "course_goal_task_sources_task_idx" ON "public"."course_goal_task_sources" USING "btree" ("task_id", "created_at");



CREATE INDEX "course_goals_course_idx" ON "public"."course_goals" USING "btree" ("course_id", "created_at" DESC);



CREATE INDEX "course_modules_course_idx" ON "public"."course_modules" USING "btree" ("course_id", "position");



CREATE INDEX "course_modules_phase_idx" ON "public"."course_modules" USING "btree" ("phase_id", "position");



CREATE INDEX "course_phases_course_idx" ON "public"."course_phases" USING "btree" ("course_id", "position");



CREATE INDEX "course_tasks_focus_block_id_idx" ON "public"."course_tasks" USING "btree" ("focus_block_id");



CREATE INDEX "course_tasks_module_idx" ON "public"."course_tasks" USING "btree" ("module_id", "position");



CREATE INDEX "courses_parent_child_active_idx" ON "public"."courses" USING "btree" ("parent_user_id", "child_id", "is_active", "created_at" DESC);



CREATE INDEX "courses_parent_child_idx" ON "public"."courses" USING "btree" ("parent_user_id", "child_id");



CREATE INDEX "daily_assignments_child_id_assignment_date_idx" ON "public"."daily_assignments" USING "btree" ("child_id", "assignment_date");



CREATE INDEX "daily_assignments_parent_user_id_idx" ON "public"."daily_assignments" USING "btree" ("parent_user_id");



CREATE INDEX "daily_assignments_selected_family_slug_idx" ON "public"."daily_assignments" USING "btree" ("selected_family_slug");



CREATE INDEX "focus_blocks_course_idx" ON "public"."focus_blocks" USING "btree" ("course_id", "is_active", "created_at" DESC);



CREATE INDEX "gold_coin_transfer_requests_child_created_idx" ON "public"."gold_coin_transfer_requests" USING "btree" ("child_id", "created_at" DESC);



CREATE INDEX "learning_item_evidence_child_idx" ON "public"."learning_item_evidence" USING "btree" ("child_id", "created_at" DESC);



CREATE INDEX "learning_item_evidence_issue_idx" ON "public"."learning_item_evidence" USING "btree" ("writing_issue_id", "created_at" DESC) WHERE ("writing_issue_id" IS NOT NULL);



CREATE INDEX "learning_item_evidence_learning_item_idx" ON "public"."learning_item_evidence" USING "btree" ("learning_item_id", "created_at" DESC);



CREATE INDEX "learning_item_issue_links_child_idx" ON "public"."learning_item_issue_links" USING "btree" ("child_id", "created_at" DESC);



CREATE INDEX "learning_item_issue_links_issue_idx" ON "public"."learning_item_issue_links" USING "btree" ("writing_issue_id", "created_at" DESC);



CREATE UNIQUE INDEX "learning_item_issue_links_unique_idx" ON "public"."learning_item_issue_links" USING "btree" ("learning_item_id", "writing_issue_id");



CREATE INDEX "learning_items_child_active_idx" ON "public"."learning_items" USING "btree" ("child_id", "is_active", "updated_at" DESC);



CREATE INDEX "learning_items_child_review_due_idx" ON "public"."learning_items" USING "btree" ("child_id", "is_active", "review_due_at", "updated_at" DESC);



CREATE INDEX "learning_items_micro_skill_idx" ON "public"."learning_items" USING "btree" ("child_id", "micro_skill_key", "updated_at" DESC);



CREATE UNIQUE INDEX "learning_items_source_issue_idx" ON "public"."learning_items" USING "btree" ("source_writing_issue_id");



CREATE INDEX "micro_skill_catalog_assignable_idx" ON "public"."micro_skill_catalog" USING "btree" ("is_assignable", "mastery_domain_key", "skill_family_key", "display_name");



CREATE INDEX "micro_skill_catalog_key_idx" ON "public"."micro_skill_catalog" USING "btree" ("micro_skill_key");



CREATE INDEX "micro_skill_clusters_family_assignable_idx" ON "public"."micro_skill_clusters" USING "btree" ("skill_family_key", "is_assignable", "display_name");



CREATE INDEX "micro_skill_families_domain_assignable_idx" ON "public"."micro_skill_families" USING "btree" ("mastery_domain_key", "is_assignable", "display_name");



CREATE INDEX "misspelling_instances_child_id_idx" ON "public"."misspelling_instances" USING "btree" ("child_id");



CREATE INDEX "misspelling_instances_corrected_word_idx" ON "public"."misspelling_instances" USING "btree" ("corrected_word");



CREATE INDEX "misspelling_instances_parent_false_positive_idx" ON "public"."misspelling_instances" USING "btree" ("parent_user_id", "is_false_positive");



CREATE INDEX "misspelling_instances_parent_user_id_idx" ON "public"."misspelling_instances" USING "btree" ("parent_user_id");



CREATE INDEX "misspelling_instances_writing_sample_id_idx" ON "public"."misspelling_instances" USING "btree" ("writing_sample_id");



CREATE INDEX "parent_verifications_child_idx" ON "public"."parent_verifications" USING "btree" ("child_id", "domain_module", "verified_at" DESC);



CREATE INDEX "parent_verifications_source_idx" ON "public"."parent_verifications" USING "btree" ("source_type", "source_entity_id", "verified_at" DESC);



CREATE INDEX "parent_verified_spelling_candidate_mappings_lookup_idx" ON "public"."parent_verified_spelling_candidate_mappings" USING "btree" ("misspelling_normalized", "correct_spelling_normalized", "micro_skill_key", "candidate_status");



CREATE INDEX "parent_verified_spelling_candidate_mappings_parent_child_idx" ON "public"."parent_verified_spelling_candidate_mappings" USING "btree" ("parent_user_id", "child_id", "created_at" DESC);



CREATE INDEX "personal_lesson_templates_parent_updated_idx" ON "public"."personal_lesson_templates" USING "btree" ("parent_user_id", "updated_at" DESC);



CREATE INDEX "practice_attempts_child_id_attempted_at_idx" ON "public"."practice_attempts" USING "btree" ("child_id", "attempted_at" DESC);



CREATE INDEX "practice_attempts_daily_assignment_id_idx" ON "public"."practice_attempts" USING "btree" ("daily_assignment_id");



CREATE INDEX "practice_attempts_parent_user_id_idx" ON "public"."practice_attempts" USING "btree" ("parent_user_id");



CREATE INDEX "spelling_canonical_mapping_events_mapping_idx" ON "public"."spelling_canonical_mapping_events" USING "btree" ("mapping_id", "created_at" DESC);



CREATE INDEX "spelling_canonical_mapping_events_source_case_idx" ON "public"."spelling_canonical_mapping_events" USING "btree" ("source_case_id", "created_at" DESC);



CREATE UNIQUE INDEX "spelling_canonical_mappings_active_exact_pair_idx" ON "public"."spelling_canonical_mappings" USING "btree" ("misspelling_normalized", "correct_spelling_normalized", "dialect_code") WHERE ("mapping_status" = 'active'::"text");



CREATE INDEX "spelling_canonical_mappings_micro_skill_idx" ON "public"."spelling_canonical_mappings" USING "btree" ("micro_skill_key", "mapping_status", "created_at" DESC);



CREATE INDEX "spelling_canonical_mappings_source_case_idx" ON "public"."spelling_canonical_mappings" USING "btree" ("source_case_id", "created_at" DESC);



CREATE INDEX "spelling_catalog_review_case_decisions_admin_idx" ON "public"."spelling_catalog_review_case_decisions" USING "btree" ("admin_user_id", "created_at" DESC);



CREATE INDEX "spelling_catalog_review_case_decisions_case_idx" ON "public"."spelling_catalog_review_case_decisions" USING "btree" ("case_id", "created_at" DESC);



CREATE UNIQUE INDEX "spelling_catalog_review_cases_open_source_event_idx" ON "public"."spelling_catalog_review_cases" USING "btree" ("parent_user_id", "child_id", "source_misspelling_instance_id") WHERE ("case_status" = 'open'::"text");



CREATE INDEX "spelling_catalog_review_cases_parent_child_idx" ON "public"."spelling_catalog_review_cases" USING "btree" ("parent_user_id", "child_id", "created_at" DESC);



CREATE INDEX "spelling_catalog_review_cases_task_submission_idx" ON "public"."spelling_catalog_review_cases" USING "btree" ("task_submission_id", "created_at" DESC);



CREATE INDEX "spelling_reward_events_child_created_idx" ON "public"."spelling_reward_events" USING "btree" ("child_id", "created_at" DESC);



CREATE INDEX "spelling_reward_states_child_state_idx" ON "public"."spelling_reward_states" USING "btree" ("child_id", "reward_state", "updated_at" DESC);



CREATE INDEX "task_completions_course_child_idx" ON "public"."task_completions" USING "btree" ("course_id", "child_id", "completed_at" DESC);



CREATE UNIQUE INDEX "task_completions_task_child_date_key" ON "public"."task_completions" USING "btree" ("task_id", "child_id", "completion_date");



CREATE INDEX "task_day_plans_child_week_idx" ON "public"."task_day_plans" USING "btree" ("child_id", "parent_user_id", "week_start_date", "planned_date");



CREATE UNIQUE INDEX "task_day_plans_task_child_week_key" ON "public"."task_day_plans" USING "btree" ("task_id", "child_id", "week_start_date");



CREATE INDEX "task_submission_drafts_child_updated_idx" ON "public"."task_submission_drafts" USING "btree" ("child_id", "updated_at" DESC);



CREATE UNIQUE INDEX "task_submission_drafts_task_child_idx" ON "public"."task_submission_drafts" USING "btree" ("task_id", "child_id");



CREATE INDEX "task_submission_payloads_parent_child_task_created_idx" ON "public"."task_submission_payloads" USING "btree" ("parent_user_id", "child_id", "task_id", "created_at" DESC);



CREATE UNIQUE INDEX "task_submission_payloads_submission_type_idx" ON "public"."task_submission_payloads" USING "btree" ("submission_id", "payload_type");



CREATE INDEX "task_submission_payloads_task_child_created_idx" ON "public"."task_submission_payloads" USING "btree" ("task_id", "child_id", "created_at" DESC);



CREATE INDEX "task_submissions_review_status_idx" ON "public"."task_submissions" USING "btree" ("child_id", "parent_review_status", "submitted_at" DESC);



CREATE INDEX "task_submissions_task_child_idx" ON "public"."task_submissions" USING "btree" ("task_id", "child_id", "submitted_at" DESC);



CREATE INDEX "task_week_selections_child_week_idx" ON "public"."task_week_selections" USING "btree" ("child_id", "week_start_date");



CREATE UNIQUE INDEX "task_week_selections_unique_key" ON "public"."task_week_selections" USING "btree" ("task_id", "child_id", "week_start_date");



CREATE INDEX "word_families_category_idx" ON "public"."word_families" USING "btree" ("category");



CREATE INDEX "word_families_parent_user_id_idx" ON "public"."word_families" USING "btree" ("parent_user_id");



CREATE INDEX "word_families_parent_user_idx" ON "public"."word_families" USING "btree" ("parent_user_id");



CREATE INDEX "word_families_priority_idx" ON "public"."word_families" USING "btree" ("priority");



CREATE INDEX "word_families_slug_idx" ON "public"."word_families" USING "btree" ("slug");



CREATE UNIQUE INDEX "word_families_slug_key" ON "public"."word_families" USING "btree" ("slug");



CREATE INDEX "word_progress_child_id_idx" ON "public"."word_progress" USING "btree" ("child_id");



CREATE INDEX "word_progress_parent_user_id_idx" ON "public"."word_progress" USING "btree" ("parent_user_id");



CREATE INDEX "word_progress_word_family_id_idx" ON "public"."word_progress" USING "btree" ("word_family_id");



CREATE INDEX "writing_false_positive_suppressions_child_idx" ON "public"."writing_false_positive_suppressions" USING "btree" ("child_id", "created_at" DESC);



CREATE UNIQUE INDEX "writing_false_positive_suppressions_exact_pair_idx" ON "public"."writing_false_positive_suppressions" USING "btree" ("child_id", "parent_user_id", "misspelled_word", "corrected_word");



CREATE INDEX "writing_issue_correction_attempts_child_idx" ON "public"."writing_issue_correction_attempts" USING "btree" ("child_id", "created_at" DESC);



CREATE INDEX "writing_issue_correction_attempts_issue_idx" ON "public"."writing_issue_correction_attempts" USING "btree" ("writing_issue_id", "created_at" DESC);



CREATE INDEX "writing_issue_correction_attempts_submission_idx" ON "public"."writing_issue_correction_attempts" USING "btree" ("task_submission_id", "created_at" DESC) WHERE ("task_submission_id" IS NOT NULL);



CREATE INDEX "writing_issue_suggestions_child_status_idx" ON "public"."writing_issue_suggestions" USING "btree" ("child_id", "suggestion_status", "created_at" DESC);



CREATE INDEX "writing_issue_suggestions_misspelling_idx" ON "public"."writing_issue_suggestions" USING "btree" ("misspelling_instance_id", "created_at" DESC) WHERE ("misspelling_instance_id" IS NOT NULL);



CREATE INDEX "writing_issue_suggestions_task_submission_idx" ON "public"."writing_issue_suggestions" USING "btree" ("task_submission_id", "created_at" DESC) WHERE ("task_submission_id" IS NOT NULL);



CREATE INDEX "writing_issue_suggestions_writing_sample_idx" ON "public"."writing_issue_suggestions" USING "btree" ("writing_sample_id", "created_at" DESC) WHERE ("writing_sample_id" IS NOT NULL);



CREATE INDEX "writing_issues_child_status_idx" ON "public"."writing_issues" USING "btree" ("child_id", "issue_status", "updated_at" DESC);



CREATE INDEX "writing_issues_reactivates_issue_idx" ON "public"."writing_issues" USING "btree" ("reactivates_writing_issue_id") WHERE ("reactivates_writing_issue_id" IS NOT NULL);



CREATE INDEX "writing_issues_source_suggestion_idx" ON "public"."writing_issues" USING "btree" ("source_suggestion_id") WHERE ("source_suggestion_id" IS NOT NULL);



CREATE INDEX "writing_issues_task_submission_idx" ON "public"."writing_issues" USING "btree" ("task_submission_id", "created_at" DESC) WHERE ("task_submission_id" IS NOT NULL);



CREATE INDEX "writing_issues_word_progress_idx" ON "public"."writing_issues" USING "btree" ("linked_word_progress_id") WHERE ("linked_word_progress_id" IS NOT NULL);



CREATE INDEX "writing_issues_writing_sample_idx" ON "public"."writing_issues" USING "btree" ("writing_sample_id", "created_at" DESC) WHERE ("writing_sample_id" IS NOT NULL);



CREATE INDEX "writing_samples_child_id_idx" ON "public"."writing_samples" USING "btree" ("child_id");



CREATE INDEX "writing_samples_manual_review_completion_idx" ON "public"."writing_samples" USING "btree" ("parent_user_id", "review_completed_at" DESC) WHERE ("task_submission_id" IS NULL);



CREATE INDEX "writing_samples_parent_user_id_idx" ON "public"."writing_samples" USING "btree" ("parent_user_id");



CREATE UNIQUE INDEX "writing_samples_task_submission_id_key" ON "public"."writing_samples" USING "btree" ("task_submission_id") WHERE ("task_submission_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "set_children_updated_at" BEFORE UPDATE ON "public"."children" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_daily_assignments_updated_at" BEFORE UPDATE ON "public"."daily_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_misspelling_instances_updated_at" BEFORE UPDATE ON "public"."misspelling_instances" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_word_families_updated_at" BEFORE UPDATE ON "public"."word_families" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_word_progress_updated_at" BEFORE UPDATE ON "public"."word_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_writing_samples_updated_at" BEFORE UPDATE ON "public"."writing_samples" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "spelling_canonical_mappings_validate_row" BEFORE INSERT OR UPDATE ON "public"."spelling_canonical_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_spelling_canonical_mapping_row"();



ALTER TABLE ONLY "public"."assignment_items"
    ADD CONSTRAINT "assignment_items_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_items"
    ADD CONSTRAINT "assignment_items_daily_assignment_id_fkey" FOREIGN KEY ("daily_assignment_id") REFERENCES "public"."daily_assignments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignment_items"
    ADD CONSTRAINT "assignment_items_learning_item_id_fkey" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignment_items"
    ADD CONSTRAINT "assignment_items_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."child_gold_bar_ledger_events"
    ADD CONSTRAINT "child_gold_bar_ledger_events_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."child_gold_coin_ledger_events"
    ADD CONSTRAINT "child_gold_coin_ledger_events_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."children"
    ADD CONSTRAINT "children_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_checkpoints"
    ADD CONSTRAINT "course_checkpoints_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_checkpoints"
    ADD CONSTRAINT "course_checkpoints_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."course_modules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."course_checkpoints"
    ADD CONSTRAINT "course_checkpoints_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."course_phases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."course_goal_task_sources"
    ADD CONSTRAINT "course_goal_task_sources_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_goal_task_sources"
    ADD CONSTRAINT "course_goal_task_sources_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."course_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_goal_task_sources"
    ADD CONSTRAINT "course_goal_task_sources_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."course_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_goals"
    ADD CONSTRAINT "course_goals_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_modules"
    ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_modules"
    ADD CONSTRAINT "course_modules_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."course_phases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."course_phases"
    ADD CONSTRAINT "course_phases_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_tasks"
    ADD CONSTRAINT "course_tasks_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_tasks"
    ADD CONSTRAINT "course_tasks_focus_block_id_fkey" FOREIGN KEY ("focus_block_id") REFERENCES "public"."focus_blocks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."course_tasks"
    ADD CONSTRAINT "course_tasks_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."course_modules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_word_family_id_fkey" FOREIGN KEY ("word_family_id") REFERENCES "public"."word_families"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."focus_blocks"
    ADD CONSTRAINT "focus_blocks_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."focus_blocks"
    ADD CONSTRAINT "focus_blocks_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."course_modules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gold_coin_transfer_requests"
    ADD CONSTRAINT "gold_coin_transfer_requests_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_item_evidence"
    ADD CONSTRAINT "learning_item_evidence_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_item_evidence"
    ADD CONSTRAINT "learning_item_evidence_learning_item_id_fkey" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_item_evidence"
    ADD CONSTRAINT "learning_item_evidence_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_item_evidence"
    ADD CONSTRAINT "learning_item_evidence_task_submission_id_fkey" FOREIGN KEY ("task_submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_item_evidence"
    ADD CONSTRAINT "learning_item_evidence_writing_issue_id_fkey" FOREIGN KEY ("writing_issue_id") REFERENCES "public"."writing_issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_item_issue_links"
    ADD CONSTRAINT "learning_item_issue_links_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_item_issue_links"
    ADD CONSTRAINT "learning_item_issue_links_learning_item_id_fkey" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_item_issue_links"
    ADD CONSTRAINT "learning_item_issue_links_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_item_issue_links"
    ADD CONSTRAINT "learning_item_issue_links_writing_issue_id_fkey" FOREIGN KEY ("writing_issue_id") REFERENCES "public"."writing_issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_items"
    ADD CONSTRAINT "learning_items_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_items"
    ADD CONSTRAINT "learning_items_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_items"
    ADD CONSTRAINT "learning_items_source_writing_issue_id_fkey" FOREIGN KEY ("source_writing_issue_id") REFERENCES "public"."writing_issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."misspelling_instances"
    ADD CONSTRAINT "misspelling_instances_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."misspelling_instances"
    ADD CONSTRAINT "misspelling_instances_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."misspelling_instances"
    ADD CONSTRAINT "misspelling_instances_word_family_id_fkey" FOREIGN KEY ("word_family_id") REFERENCES "public"."word_families"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."misspelling_instances"
    ADD CONSTRAINT "misspelling_instances_writing_sample_id_fkey" FOREIGN KEY ("writing_sample_id") REFERENCES "public"."writing_samples"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_verifications"
    ADD CONSTRAINT "parent_verifications_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_verifications"
    ADD CONSTRAINT "parent_verifications_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_verifications"
    ADD CONSTRAINT "parent_verifications_task_submission_id_fkey" FOREIGN KEY ("task_submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_verifications"
    ADD CONSTRAINT "parent_verifications_writing_sample_id_fkey" FOREIGN KEY ("writing_sample_id") REFERENCES "public"."writing_samples"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_cand_source_misspelling_instance__fkey" FOREIGN KEY ("source_misspelling_instance_id") REFERENCES "public"."misspelling_instances"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_candidate__parent_verification_id_fkey" FOREIGN KEY ("parent_verification_id") REFERENCES "public"."parent_verifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_candidate_ma_source_suggestion_id_fkey" FOREIGN KEY ("source_suggestion_id") REFERENCES "public"."writing_issue_suggestions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_candidate_mapp_task_submission_id_fkey" FOREIGN KEY ("task_submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_candidate_mappi_writing_sample_id_fkey" FOREIGN KEY ("writing_sample_id") REFERENCES "public"."writing_samples"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_candidate_mapping_micro_skill_key_fkey" FOREIGN KEY ("micro_skill_key") REFERENCES "public"."micro_skill_catalog"("micro_skill_key") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_candidate_mappings_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_verified_spelling_candidate_mappings"
    ADD CONSTRAINT "parent_verified_spelling_candidate_mappings_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_lesson_templates"
    ADD CONSTRAINT "personal_lesson_templates_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_attempts"
    ADD CONSTRAINT "practice_attempts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_attempts"
    ADD CONSTRAINT "practice_attempts_daily_assignment_id_fkey" FOREIGN KEY ("daily_assignment_id") REFERENCES "public"."daily_assignments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."practice_attempts"
    ADD CONSTRAINT "practice_attempts_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_attempts"
    ADD CONSTRAINT "practice_attempts_word_progress_id_fkey" FOREIGN KEY ("word_progress_id") REFERENCES "public"."word_progress"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_canonical_mapping_events"
    ADD CONSTRAINT "spelling_canonical_mapping_events_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES "public"."spelling_canonical_mappings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spelling_canonical_mapping_events"
    ADD CONSTRAINT "spelling_canonical_mapping_events_source_case_id_fkey" FOREIGN KEY ("source_case_id") REFERENCES "public"."spelling_catalog_review_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_canonical_mapping_events"
    ADD CONSTRAINT "spelling_canonical_mapping_events_source_decision_id_fkey" FOREIGN KEY ("source_decision_id") REFERENCES "public"."spelling_catalog_review_case_decisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_canonical_mappings"
    ADD CONSTRAINT "spelling_canonical_mappings_micro_skill_key_fkey" FOREIGN KEY ("micro_skill_key") REFERENCES "public"."micro_skill_catalog"("micro_skill_key") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."spelling_canonical_mappings"
    ADD CONSTRAINT "spelling_canonical_mappings_replacement_mapping_id_fkey" FOREIGN KEY ("replacement_mapping_id") REFERENCES "public"."spelling_canonical_mappings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_canonical_mappings"
    ADD CONSTRAINT "spelling_canonical_mappings_source_case_id_fkey" FOREIGN KEY ("source_case_id") REFERENCES "public"."spelling_catalog_review_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_canonical_mappings"
    ADD CONSTRAINT "spelling_canonical_mappings_source_decision_id_fkey" FOREIGN KEY ("source_decision_id") REFERENCES "public"."spelling_catalog_review_case_decisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_catalog_review_case_decisions"
    ADD CONSTRAINT "spelling_catalog_review_case_decisi_linked_micro_skill_key_fkey" FOREIGN KEY ("linked_micro_skill_key") REFERENCES "public"."micro_skill_catalog"("micro_skill_key") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."spelling_catalog_review_case_decisions"
    ADD CONSTRAINT "spelling_catalog_review_case_decisio_superseded_by_case_id_fkey" FOREIGN KEY ("superseded_by_case_id") REFERENCES "public"."spelling_catalog_review_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_catalog_review_case_decisions"
    ADD CONSTRAINT "spelling_catalog_review_case_decision_merge_target_case_id_fkey" FOREIGN KEY ("merge_target_case_id") REFERENCES "public"."spelling_catalog_review_cases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_catalog_review_case_decisions"
    ADD CONSTRAINT "spelling_catalog_review_case_decisions_canonical_mapping_fk" FOREIGN KEY ("canonical_mapping_id") REFERENCES "public"."spelling_canonical_mappings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_catalog_review_case_decisions"
    ADD CONSTRAINT "spelling_catalog_review_case_decisions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."spelling_catalog_review_cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spelling_catalog_review_cases"
    ADD CONSTRAINT "spelling_catalog_review_cases_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spelling_catalog_review_cases"
    ADD CONSTRAINT "spelling_catalog_review_cases_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spelling_catalog_review_cases"
    ADD CONSTRAINT "spelling_catalog_review_cases_source_misspelling_instance__fkey" FOREIGN KEY ("source_misspelling_instance_id") REFERENCES "public"."misspelling_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spelling_catalog_review_cases"
    ADD CONSTRAINT "spelling_catalog_review_cases_source_suggestion_id_fkey" FOREIGN KEY ("source_suggestion_id") REFERENCES "public"."writing_issue_suggestions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_catalog_review_cases"
    ADD CONSTRAINT "spelling_catalog_review_cases_task_submission_id_fkey" FOREIGN KEY ("task_submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spelling_catalog_review_cases"
    ADD CONSTRAINT "spelling_catalog_review_cases_writing_sample_id_fkey" FOREIGN KEY ("writing_sample_id") REFERENCES "public"."writing_samples"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spelling_reward_events"
    ADD CONSTRAINT "spelling_reward_events_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spelling_reward_states"
    ADD CONSTRAINT "spelling_reward_states_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."course_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_day_plans"
    ADD CONSTRAINT "task_day_plans_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_day_plans"
    ADD CONSTRAINT "task_day_plans_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_day_plans"
    ADD CONSTRAINT "task_day_plans_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."course_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submission_drafts"
    ADD CONSTRAINT "task_submission_drafts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submission_drafts"
    ADD CONSTRAINT "task_submission_drafts_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submission_drafts"
    ADD CONSTRAINT "task_submission_drafts_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submission_drafts"
    ADD CONSTRAINT "task_submission_drafts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."course_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submission_payloads"
    ADD CONSTRAINT "task_submission_payloads_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submission_payloads"
    ADD CONSTRAINT "task_submission_payloads_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submission_payloads"
    ADD CONSTRAINT "task_submission_payloads_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submission_payloads"
    ADD CONSTRAINT "task_submission_payloads_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submission_payloads"
    ADD CONSTRAINT "task_submission_payloads_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."course_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."course_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_week_selections"
    ADD CONSTRAINT "task_week_selections_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_week_selections"
    ADD CONSTRAINT "task_week_selections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_week_selections"
    ADD CONSTRAINT "task_week_selections_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."course_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."word_families"
    ADD CONSTRAINT "word_families_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."word_progress"
    ADD CONSTRAINT "word_progress_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."word_progress"
    ADD CONSTRAINT "word_progress_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."word_progress"
    ADD CONSTRAINT "word_progress_word_family_id_fkey" FOREIGN KEY ("word_family_id") REFERENCES "public"."word_families"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_false_positive_suppressions"
    ADD CONSTRAINT "writing_false_positive_suppre_source_misspelling_instance__fkey" FOREIGN KEY ("source_misspelling_instance_id") REFERENCES "public"."misspelling_instances"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_false_positive_suppressions"
    ADD CONSTRAINT "writing_false_positive_suppre_source_writing_issue_suggest_fkey" FOREIGN KEY ("source_writing_issue_suggestion_id") REFERENCES "public"."writing_issue_suggestions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_false_positive_suppressions"
    ADD CONSTRAINT "writing_false_positive_suppressions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_false_positive_suppressions"
    ADD CONSTRAINT "writing_false_positive_suppressions_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_issue_correction_attempts"
    ADD CONSTRAINT "writing_issue_correction_attempts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_issue_correction_attempts"
    ADD CONSTRAINT "writing_issue_correction_attempts_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_issue_correction_attempts"
    ADD CONSTRAINT "writing_issue_correction_attempts_task_submission_id_fkey" FOREIGN KEY ("task_submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_issue_correction_attempts"
    ADD CONSTRAINT "writing_issue_correction_attempts_writing_issue_id_fkey" FOREIGN KEY ("writing_issue_id") REFERENCES "public"."writing_issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_issue_suggestions"
    ADD CONSTRAINT "writing_issue_suggestions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_issue_suggestions"
    ADD CONSTRAINT "writing_issue_suggestions_misspelling_instance_id_fkey" FOREIGN KEY ("misspelling_instance_id") REFERENCES "public"."misspelling_instances"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_issue_suggestions"
    ADD CONSTRAINT "writing_issue_suggestions_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_issue_suggestions"
    ADD CONSTRAINT "writing_issue_suggestions_task_submission_id_fkey" FOREIGN KEY ("task_submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_issue_suggestions"
    ADD CONSTRAINT "writing_issue_suggestions_writing_sample_id_fkey" FOREIGN KEY ("writing_sample_id") REFERENCES "public"."writing_samples"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_issues"
    ADD CONSTRAINT "writing_issues_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_issues"
    ADD CONSTRAINT "writing_issues_linked_word_progress_id_fkey" FOREIGN KEY ("linked_word_progress_id") REFERENCES "public"."word_progress"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_issues"
    ADD CONSTRAINT "writing_issues_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_issues"
    ADD CONSTRAINT "writing_issues_reactivates_writing_issue_id_fkey" FOREIGN KEY ("reactivates_writing_issue_id") REFERENCES "public"."writing_issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_issues"
    ADD CONSTRAINT "writing_issues_source_misspelling_instance_id_fkey" FOREIGN KEY ("source_misspelling_instance_id") REFERENCES "public"."misspelling_instances"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_issues"
    ADD CONSTRAINT "writing_issues_source_suggestion_id_fkey" FOREIGN KEY ("source_suggestion_id") REFERENCES "public"."writing_issue_suggestions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_issues"
    ADD CONSTRAINT "writing_issues_task_submission_id_fkey" FOREIGN KEY ("task_submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_issues"
    ADD CONSTRAINT "writing_issues_writing_sample_id_fkey" FOREIGN KEY ("writing_sample_id") REFERENCES "public"."writing_samples"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_samples"
    ADD CONSTRAINT "writing_samples_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_samples"
    ADD CONSTRAINT "writing_samples_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."writing_samples"
    ADD CONSTRAINT "writing_samples_review_completed_by_fkey" FOREIGN KEY ("review_completed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."writing_samples"
    ADD CONSTRAINT "writing_samples_task_submission_id_fkey" FOREIGN KEY ("task_submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE SET NULL;



ALTER TABLE "public"."assignment_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignment_items_parent_access" ON "public"."assignment_items" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."child_gold_bar_ledger_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "child_gold_bar_ledger_events_parent_access" ON "public"."child_gold_bar_ledger_events" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."child_gold_coin_ledger_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "child_gold_coin_ledger_events_parent_access" ON "public"."child_gold_coin_ledger_events" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."children" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "children_delete_own" ON "public"."children" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "children_insert_own" ON "public"."children" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "children_select_own" ON "public"."children" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "children_update_own" ON "public"."children" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."course_checkpoints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_checkpoints_parent_access" ON "public"."course_checkpoints" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."course_goal_task_sources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_goal_task_sources_parent_access" ON "public"."course_goal_task_sources" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."course_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_goals_parent_access" ON "public"."course_goals" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."course_modules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_modules_parent_access" ON "public"."course_modules" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."course_phases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_phases_parent_access" ON "public"."course_phases" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."course_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_tasks_parent_access" ON "public"."course_tasks" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "courses_parent_access" ON "public"."courses" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."daily_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_assignments_delete_own" ON "public"."daily_assignments" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "daily_assignments_insert_own" ON "public"."daily_assignments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "daily_assignments_select_own" ON "public"."daily_assignments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "daily_assignments_update_own" ON "public"."daily_assignments" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."focus_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "focus_blocks_parent_access" ON "public"."focus_blocks" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."gold_coin_transfer_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gold_coin_transfer_requests_parent_access" ON "public"."gold_coin_transfer_requests" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."learning_item_evidence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_item_evidence_parent_access" ON "public"."learning_item_evidence" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."learning_item_issue_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_item_issue_links_parent_access" ON "public"."learning_item_issue_links" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."learning_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_items_parent_access" ON "public"."learning_items" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."micro_skill_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "micro_skill_catalog_authenticated_read" ON "public"."micro_skill_catalog" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."micro_skill_clusters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "micro_skill_clusters_authenticated_read" ON "public"."micro_skill_clusters" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."micro_skill_families" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "micro_skill_families_authenticated_read" ON "public"."micro_skill_families" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."misspelling_instances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "misspelling_instances_delete_own" ON "public"."misspelling_instances" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "misspelling_instances_insert_own" ON "public"."misspelling_instances" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "misspelling_instances_select_own" ON "public"."misspelling_instances" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "misspelling_instances_update_own" ON "public"."misspelling_instances" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."parent_verifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parent_verifications_parent_access" ON "public"."parent_verifications" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."parent_verified_spelling_candidate_mappings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parent_verified_spelling_candidate_mappings_parent_access" ON "public"."parent_verified_spelling_candidate_mappings" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."personal_lesson_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_lesson_templates_parent_access" ON "public"."personal_lesson_templates" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."practice_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "practice_attempts_delete_own" ON "public"."practice_attempts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "practice_attempts_insert_own" ON "public"."practice_attempts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "practice_attempts_select_own" ON "public"."practice_attempts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "practice_attempts_update_own" ON "public"."practice_attempts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."spelling_canonical_mapping_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spelling_canonical_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spelling_catalog_review_case_decisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spelling_catalog_review_cases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "spelling_catalog_review_cases_parent_access" ON "public"."spelling_catalog_review_cases" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."spelling_reward_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "spelling_reward_events_parent_access" ON "public"."spelling_reward_events" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."spelling_reward_states" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "spelling_reward_states_parent_access" ON "public"."spelling_reward_states" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."task_completions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_completions_parent_access" ON "public"."task_completions" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."task_day_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_day_plans_parent_access" ON "public"."task_day_plans" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."task_submission_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_submission_drafts_parent_access" ON "public"."task_submission_drafts" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."task_submission_payloads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_submission_payloads_parent_access" ON "public"."task_submission_payloads" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "task_submission_payloads_parent_select" ON "public"."task_submission_payloads" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."task_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_submissions_parent_access" ON "public"."task_submissions" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."task_week_selections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_week_selections_parent_access" ON "public"."task_week_selections" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."word_families" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "word_families_delete_own" ON "public"."word_families" FOR DELETE TO "authenticated" USING ((("parent_user_id" IS NULL) OR ("auth"."uid"() = "parent_user_id")));



CREATE POLICY "word_families_insert_own" ON "public"."word_families" FOR INSERT TO "authenticated" WITH CHECK ((("parent_user_id" IS NULL) OR ("auth"."uid"() = "parent_user_id")));



CREATE POLICY "word_families_select_own" ON "public"."word_families" FOR SELECT TO "authenticated" USING ((("parent_user_id" IS NULL) OR ("auth"."uid"() = "parent_user_id")));



CREATE POLICY "word_families_update_own" ON "public"."word_families" FOR UPDATE TO "authenticated" USING ((("parent_user_id" IS NULL) OR ("auth"."uid"() = "parent_user_id"))) WITH CHECK ((("parent_user_id" IS NULL) OR ("auth"."uid"() = "parent_user_id")));



ALTER TABLE "public"."word_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "word_progress_delete_own" ON "public"."word_progress" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "word_progress_insert_own" ON "public"."word_progress" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "word_progress_select_own" ON "public"."word_progress" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "word_progress_update_own" ON "public"."word_progress" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."writing_false_positive_suppressions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "writing_false_positive_suppressions_parent_access" ON "public"."writing_false_positive_suppressions" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."writing_issue_correction_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "writing_issue_correction_attempts_parent_access" ON "public"."writing_issue_correction_attempts" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."writing_issue_suggestions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "writing_issue_suggestions_parent_access" ON "public"."writing_issue_suggestions" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."writing_issues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "writing_issues_parent_access" ON "public"."writing_issues" TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



ALTER TABLE "public"."writing_samples" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "writing_samples_delete_own" ON "public"."writing_samples" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "writing_samples_insert_own" ON "public"."writing_samples" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "writing_samples_select_own" ON "public"."writing_samples" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "parent_user_id"));



CREATE POLICY "writing_samples_update_own" ON "public"."writing_samples" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "parent_user_id")) WITH CHECK (("auth"."uid"() = "parent_user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_learning_item_review_state_from_evidence"("p_learning_item_id" "uuid", "p_evidence_type" "text", "p_competency_signal" integer, "p_occurred_at" timestamp with time zone, "p_source_context" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_learning_item_review_state_from_evidence"("p_learning_item_id" "uuid", "p_evidence_type" "text", "p_competency_signal" integer, "p_occurred_at" timestamp with time zone, "p_source_context" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_learning_item_review_state_from_evidence"("p_learning_item_id" "uuid", "p_evidence_type" "text", "p_competency_signal" integer, "p_occurred_at" timestamp with time zone, "p_source_context" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_spelling_canonical_mapping_admin"("p_misspelling_normalized" "text", "p_correct_spelling_normalized" "text", "p_micro_skill_key" "text", "p_admin_user_id" "uuid", "p_admin_email" "text", "p_source_case_id" "uuid", "p_source_decision_id" "uuid", "p_decision_note" "text", "p_dialect_code" "text", "p_normalization_version" "text", "p_metadata" "jsonb", "p_event_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_spelling_canonical_mapping_admin"("p_misspelling_normalized" "text", "p_correct_spelling_normalized" "text", "p_micro_skill_key" "text", "p_admin_user_id" "uuid", "p_admin_email" "text", "p_source_case_id" "uuid", "p_source_decision_id" "uuid", "p_decision_note" "text", "p_dialect_code" "text", "p_normalization_version" "text", "p_metadata" "jsonb", "p_event_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalise_writing_issue_classification_and_learning_item"("p_writing_issue_id" "uuid", "p_parent_user_id" "uuid", "p_child_id" "uuid", "p_final_classification" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."finalise_writing_issue_classification_and_learning_item"("p_writing_issue_id" "uuid", "p_parent_user_id" "uuid", "p_child_id" "uuid", "p_final_classification" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalise_writing_issue_classification_and_learning_item"("p_writing_issue_id" "uuid", "p_parent_user_id" "uuid", "p_child_id" "uuid", "p_final_classification" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."initial_learning_item_competency_for_final_classification"("p_final_classification" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."initial_learning_item_competency_for_final_classification"("p_final_classification" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initial_learning_item_competency_for_final_classification"("p_final_classification" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."learning_item_evidence_type_for_controlled_practice"("p_is_correct" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."learning_item_evidence_type_for_controlled_practice"("p_is_correct" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_item_evidence_type_for_controlled_practice"("p_is_correct" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."learning_item_evidence_type_for_correction_attempt"("p_marked_fixed" boolean, "p_reflection" "text", "p_corrected_independently" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."learning_item_evidence_type_for_correction_attempt"("p_marked_fixed" boolean, "p_reflection" "text", "p_corrected_independently" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_item_evidence_type_for_correction_attempt"("p_marked_fixed" boolean, "p_reflection" "text", "p_corrected_independently" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."learning_item_evidence_type_for_final_classification"("p_final_classification" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."learning_item_evidence_type_for_final_classification"("p_final_classification" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."learning_item_evidence_type_for_final_classification"("p_final_classification" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."next_learning_item_competency_for_controlled_practice"("p_current_competency" integer, "p_is_correct" boolean, "p_felt_weak" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."next_learning_item_competency_for_controlled_practice"("p_current_competency" integer, "p_is_correct" boolean, "p_felt_weak" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_learning_item_competency_for_controlled_practice"("p_current_competency" integer, "p_is_correct" boolean, "p_felt_weak" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."persist_course_task_positions"("p_module_id" "uuid", "p_task_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."persist_course_task_positions"("p_module_id" "uuid", "p_task_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."persist_course_task_positions"("p_module_id" "uuid", "p_task_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_controlled_practice_learning_item_evidence"("p_learning_item_id" "uuid", "p_parent_user_id" "uuid", "p_child_id" "uuid", "p_daily_assignment_id" "uuid", "p_target_word" "text", "p_submitted_word" "text", "p_is_correct" boolean, "p_felt_weak" boolean, "p_attempt_mode" "text", "p_attempted_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."record_controlled_practice_learning_item_evidence"("p_learning_item_id" "uuid", "p_parent_user_id" "uuid", "p_child_id" "uuid", "p_daily_assignment_id" "uuid", "p_target_word" "text", "p_submitted_word" "text", "p_is_correct" boolean, "p_felt_weak" boolean, "p_attempt_mode" "text", "p_attempted_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_controlled_practice_learning_item_evidence"("p_learning_item_id" "uuid", "p_parent_user_id" "uuid", "p_child_id" "uuid", "p_daily_assignment_id" "uuid", "p_target_word" "text", "p_submitted_word" "text", "p_is_correct" boolean, "p_felt_weak" boolean, "p_attempt_mode" "text", "p_attempted_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_course_checkpoint_adjacent"("p_checkpoint_id" "uuid", "p_direction" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_course_checkpoint_adjacent"("p_checkpoint_id" "uuid", "p_direction" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_course_checkpoint_adjacent"("p_checkpoint_id" "uuid", "p_direction" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_course_module_adjacent"("p_module_id" "uuid", "p_direction" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_course_module_adjacent"("p_module_id" "uuid", "p_direction" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_course_module_adjacent"("p_module_id" "uuid", "p_direction" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_course_task_adjacent"("p_task_id" "uuid", "p_direction" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_course_task_adjacent"("p_task_id" "uuid", "p_direction" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_course_task_adjacent"("p_task_id" "uuid", "p_direction" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_spelling_catalog_review_case_admin"("p_case_id" "uuid", "p_admin_user_id" "uuid", "p_admin_email" "text", "p_decision_type" "text", "p_decision_note" "text", "p_linked_micro_skill_key" "text", "p_metadata" "jsonb", "p_dialect_code" "text", "p_normalization_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_spelling_catalog_review_case_admin"("p_case_id" "uuid", "p_admin_user_id" "uuid", "p_admin_email" "text", "p_decision_type" "text", "p_decision_note" "text", "p_linked_micro_skill_key" "text", "p_metadata" "jsonb", "p_dialect_code" "text", "p_normalization_version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."review_interval_for_learning_item_competency"("p_competency_level" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."review_interval_for_learning_item_competency"("p_competency_level" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_interval_for_learning_item_competency"("p_competency_level" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_spelling_canonical_mapping_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_spelling_canonical_mapping_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_spelling_canonical_mapping_row"() TO "service_role";



GRANT ALL ON TABLE "public"."assignment_items" TO "anon";
GRANT ALL ON TABLE "public"."assignment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_items" TO "service_role";



GRANT ALL ON TABLE "public"."child_gold_bar_ledger_events" TO "anon";
GRANT ALL ON TABLE "public"."child_gold_bar_ledger_events" TO "authenticated";
GRANT ALL ON TABLE "public"."child_gold_bar_ledger_events" TO "service_role";



GRANT ALL ON TABLE "public"."child_gold_coin_ledger_events" TO "anon";
GRANT ALL ON TABLE "public"."child_gold_coin_ledger_events" TO "authenticated";
GRANT ALL ON TABLE "public"."child_gold_coin_ledger_events" TO "service_role";



GRANT ALL ON TABLE "public"."children" TO "anon";
GRANT ALL ON TABLE "public"."children" TO "authenticated";
GRANT ALL ON TABLE "public"."children" TO "service_role";



GRANT ALL ON TABLE "public"."course_checkpoints" TO "anon";
GRANT ALL ON TABLE "public"."course_checkpoints" TO "authenticated";
GRANT ALL ON TABLE "public"."course_checkpoints" TO "service_role";



GRANT ALL ON TABLE "public"."course_goal_task_sources" TO "anon";
GRANT ALL ON TABLE "public"."course_goal_task_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."course_goal_task_sources" TO "service_role";



GRANT ALL ON TABLE "public"."course_goals" TO "anon";
GRANT ALL ON TABLE "public"."course_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."course_goals" TO "service_role";



GRANT ALL ON TABLE "public"."course_modules" TO "anon";
GRANT ALL ON TABLE "public"."course_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."course_modules" TO "service_role";



GRANT ALL ON TABLE "public"."course_phases" TO "anon";
GRANT ALL ON TABLE "public"."course_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."course_phases" TO "service_role";



GRANT ALL ON TABLE "public"."course_tasks" TO "anon";
GRANT ALL ON TABLE "public"."course_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."course_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."daily_assignments" TO "anon";
GRANT ALL ON TABLE "public"."daily_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."focus_blocks" TO "anon";
GRANT ALL ON TABLE "public"."focus_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."focus_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."gold_coin_transfer_requests" TO "anon";
GRANT ALL ON TABLE "public"."gold_coin_transfer_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."gold_coin_transfer_requests" TO "service_role";



GRANT ALL ON TABLE "public"."learning_item_evidence" TO "anon";
GRANT ALL ON TABLE "public"."learning_item_evidence" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_item_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."learning_item_issue_links" TO "anon";
GRANT ALL ON TABLE "public"."learning_item_issue_links" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_item_issue_links" TO "service_role";



GRANT ALL ON TABLE "public"."learning_items" TO "anon";
GRANT ALL ON TABLE "public"."learning_items" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_items" TO "service_role";



GRANT ALL ON TABLE "public"."micro_skill_catalog" TO "anon";
GRANT ALL ON TABLE "public"."micro_skill_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."micro_skill_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."micro_skill_clusters" TO "anon";
GRANT ALL ON TABLE "public"."micro_skill_clusters" TO "authenticated";
GRANT ALL ON TABLE "public"."micro_skill_clusters" TO "service_role";



GRANT ALL ON TABLE "public"."micro_skill_families" TO "anon";
GRANT ALL ON TABLE "public"."micro_skill_families" TO "authenticated";
GRANT ALL ON TABLE "public"."micro_skill_families" TO "service_role";



GRANT ALL ON TABLE "public"."misspelling_instances" TO "anon";
GRANT ALL ON TABLE "public"."misspelling_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."misspelling_instances" TO "service_role";



GRANT ALL ON TABLE "public"."parent_verifications" TO "anon";
GRANT ALL ON TABLE "public"."parent_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."parent_verified_spelling_candidate_mappings" TO "anon";
GRANT ALL ON TABLE "public"."parent_verified_spelling_candidate_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_verified_spelling_candidate_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."personal_lesson_templates" TO "anon";
GRANT ALL ON TABLE "public"."personal_lesson_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_lesson_templates" TO "service_role";



GRANT ALL ON TABLE "public"."practice_attempts" TO "anon";
GRANT ALL ON TABLE "public"."practice_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."spelling_canonical_mapping_events" TO "service_role";



GRANT ALL ON TABLE "public"."spelling_canonical_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."spelling_catalog_review_case_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."spelling_catalog_review_cases" TO "anon";
GRANT ALL ON TABLE "public"."spelling_catalog_review_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."spelling_catalog_review_cases" TO "service_role";



GRANT ALL ON TABLE "public"."spelling_reward_events" TO "anon";
GRANT ALL ON TABLE "public"."spelling_reward_events" TO "authenticated";
GRANT ALL ON TABLE "public"."spelling_reward_events" TO "service_role";



GRANT ALL ON TABLE "public"."spelling_reward_states" TO "anon";
GRANT ALL ON TABLE "public"."spelling_reward_states" TO "authenticated";
GRANT ALL ON TABLE "public"."spelling_reward_states" TO "service_role";



GRANT ALL ON TABLE "public"."task_completions" TO "anon";
GRANT ALL ON TABLE "public"."task_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."task_completions" TO "service_role";



GRANT ALL ON TABLE "public"."task_day_plans" TO "anon";
GRANT ALL ON TABLE "public"."task_day_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."task_day_plans" TO "service_role";



GRANT ALL ON TABLE "public"."task_submission_drafts" TO "anon";
GRANT ALL ON TABLE "public"."task_submission_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."task_submission_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."task_submission_payloads" TO "anon";
GRANT ALL ON TABLE "public"."task_submission_payloads" TO "authenticated";
GRANT ALL ON TABLE "public"."task_submission_payloads" TO "service_role";



GRANT ALL ON TABLE "public"."task_submissions" TO "anon";
GRANT ALL ON TABLE "public"."task_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."task_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."task_week_selections" TO "anon";
GRANT ALL ON TABLE "public"."task_week_selections" TO "authenticated";
GRANT ALL ON TABLE "public"."task_week_selections" TO "service_role";



GRANT ALL ON TABLE "public"."word_families" TO "anon";
GRANT ALL ON TABLE "public"."word_families" TO "authenticated";
GRANT ALL ON TABLE "public"."word_families" TO "service_role";



GRANT ALL ON TABLE "public"."word_progress" TO "anon";
GRANT ALL ON TABLE "public"."word_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."word_progress" TO "service_role";



GRANT ALL ON TABLE "public"."writing_false_positive_suppressions" TO "anon";
GRANT ALL ON TABLE "public"."writing_false_positive_suppressions" TO "authenticated";
GRANT ALL ON TABLE "public"."writing_false_positive_suppressions" TO "service_role";



GRANT ALL ON TABLE "public"."writing_issue_correction_attempts" TO "anon";
GRANT ALL ON TABLE "public"."writing_issue_correction_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."writing_issue_correction_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."writing_issue_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."writing_issue_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."writing_issue_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."writing_issues" TO "anon";
GRANT ALL ON TABLE "public"."writing_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."writing_issues" TO "service_role";



GRANT ALL ON TABLE "public"."writing_samples" TO "anon";
GRANT ALL ON TABLE "public"."writing_samples" TO "authenticated";
GRANT ALL ON TABLE "public"."writing_samples" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
