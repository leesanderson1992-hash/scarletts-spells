-- Remove the retired five-step learning-item level system. The writing issue,
-- practice, and evidence records remain active; ADLE proficiency is the sole
-- microskill level authority.

create or replace function public.apply_learning_item_review_state_from_evidence(
  p_learning_item_id uuid,
  p_evidence_type text,
  p_occurred_at timestamptz,
  p_source_context text
) returns void
language plpgsql
as $$
declare
  v_item public.learning_items%rowtype;
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
      v_next_review_due_at := p_occurred_at + interval '3 days';
    elsif p_evidence_type = 'incorrect_use' then
      v_next_review_due_at := least(
        coalesce(v_item.review_due_at, p_occurred_at + interval '1 day'),
        p_occurred_at + interval '1 day'
      );
    end if;
  end if;

  update public.learning_items
  set
    progress_state = v_next_progress_state,
    review_due_at = v_next_review_due_at,
    last_meaningful_success_at = case
      when p_evidence_type = 'controlled_practice_success'
        and p_source_context = 'controlled_practice_attempt'
        then p_occurred_at
      else last_meaningful_success_at
    end,
    last_meaningful_failure_at = case
      when p_evidence_type = 'incorrect_use'
        then p_occurred_at
      else last_meaningful_failure_at
    end,
    updated_at = timezone('utc', now())
  where id = p_learning_item_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."finalise_writing_issue_classification_and_learning_item_pre_context_advisory"("p_writing_issue_id" "uuid", "p_parent_user_id" "uuid", "p_child_id" "uuid", "p_final_classification" "text") RETURNS "jsonb"
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

  if p_final_classification in ('fragile_knowledge', 'concept_gap', 'transfer_failure') then
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


create or replace function public.finalise_contextual_learning_item(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid,
  p_final_classification text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_issue public.writing_issues%rowtype;
  v_catalog public.micro_skill_catalog%rowtype;
  v_existing public.learning_items%rowtype;
  v_now timestamptz := timezone('utc',now());
  v_learning_item_id uuid;
  v_created boolean := false;
  v_reused boolean := false;
  v_evidence_type text;
  v_issue_evidence_count integer := 0;
  v_attempt_evidence_count integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_parent_user_id then
    raise exception 'contextual_learning_parent_scope_invalid';
  end if;
  if p_final_classification not in ('concept_gap','fragile_knowledge','transfer_failure') then
    raise exception 'contextual_learning_outcome_invalid';
  end if;

  select * into v_issue from public.writing_issues
  where id=p_writing_issue_id and parent_user_id=p_parent_user_id and child_id=p_child_id
  for update;
  if v_issue.id is null or v_issue.metadata->>'source_kind'<>'contextual_advisory_v4'
      or v_issue.issue_status<>'child_responded' or v_issue.final_classification is not null
      or v_issue.source_writing_occurrence_id is null
      or v_issue.source_misspelling_instance_id is not null then
    raise exception 'contextual_learning_item_source_invalid';
  end if;

  select * into v_catalog from public.micro_skill_catalog
  where micro_skill_key=v_issue.micro_skill_key and mastery_domain_key='D4'
    and is_active=true and is_assignable=true
  limit 1;
  if v_catalog.id is null then raise exception 'contextual_micro_skill_not_governed'; end if;

  v_evidence_type:=public.learning_item_evidence_type_for_final_classification(p_final_classification);
  if v_evidence_type is null then
    raise exception 'contextual_learning_outcome_invalid';
  end if;

  update public.writing_issues
  set final_classification=p_final_classification,issue_status='finalised',
    final_classified_at=v_now,
    metadata=metadata||jsonb_build_object(
      'contextual_learning_source','PARENT_CONFIRMED_ORIGINAL_WRITING',
      'retry_evidence_kind','REPAIR_ONLY'
    ),updated_at=v_now
  where id=v_issue.id;

  select * into v_existing from public.learning_items
  where child_id=v_issue.child_id and parent_user_id=v_issue.parent_user_id
    and is_active=true and micro_skill_key=v_issue.micro_skill_key
    and practice_route=v_catalog.practice_route
  order by updated_at desc,created_at desc,id desc limit 1 for update;
  if v_existing.id is not null then
    v_learning_item_id:=v_existing.id;
    v_reused:=true;
    update public.learning_items set updated_at=v_now where id=v_learning_item_id;
    insert into public.learning_item_issue_links(
      learning_item_id,writing_issue_id,child_id,parent_user_id,link_role,metadata,created_at,updated_at
    ) values (
      v_learning_item_id,v_issue.id,v_issue.child_id,v_issue.parent_user_id,'supporting',
      jsonb_build_object('created_from_final_classification',p_final_classification,
        'source_kind','contextual_advisory_v4'),v_now,v_now
    ) on conflict (learning_item_id,writing_issue_id) do nothing;
  else
    insert into public.learning_items(
      child_id,parent_user_id,source_writing_issue_id,micro_skill_key,mastery_domain_key,
      skill_family_key,skill_cluster_key,practice_route,
      theme_key,progress_state,is_active,metadata,created_at,updated_at
    ) values (
      v_issue.child_id,v_issue.parent_user_id,v_issue.id,v_issue.micro_skill_key,
      v_catalog.mastery_domain_key,v_catalog.skill_family_key,v_catalog.skill_cluster_key,
      v_catalog.practice_route,v_issue.theme_key,'golden_nugget',true,
      jsonb_build_object('created_from_final_classification',p_final_classification,
        'source_issue_status_at_creation','finalised','source_kind','contextual_advisory_v4'),v_now,v_now
    ) on conflict (source_writing_issue_id) do nothing returning id into v_learning_item_id;
    if v_learning_item_id is null then
      select id into v_learning_item_id from public.learning_items
      where source_writing_issue_id=v_issue.id and parent_user_id=p_parent_user_id limit 1;
    else
      v_created:=true;
      insert into public.learning_item_issue_links(
        learning_item_id,writing_issue_id,child_id,parent_user_id,link_role,metadata,created_at,updated_at
      ) values (
        v_learning_item_id,v_issue.id,v_issue.child_id,v_issue.parent_user_id,'origin',
        jsonb_build_object('created_from_final_classification',p_final_classification,
          'source_kind','contextual_advisory_v4'),v_now,v_now
      ) on conflict (learning_item_id,writing_issue_id) do nothing;
    end if;
  end if;

  insert into public.learning_item_evidence(
    learning_item_id,child_id,parent_user_id,writing_issue_id,task_submission_id,
    evidence_type,source_context,metadata,created_at,updated_at
  ) values (
    v_learning_item_id,v_issue.child_id,v_issue.parent_user_id,v_issue.id,v_issue.task_submission_id,
    v_evidence_type,'finalised_issue_outcome',
    jsonb_build_object('final_classification',p_final_classification,
      'micro_skill_key',v_issue.micro_skill_key,'linked_learning_item_id',v_learning_item_id,
      'evidence_kind','PARENT_CONFIRMED_CONTEXTUAL_NEED'),v_now,v_now
  );
  get diagnostics v_issue_evidence_count=row_count;
  perform public.apply_learning_item_review_state_from_evidence(
    v_learning_item_id,v_evidence_type,v_now,'finalised_issue_outcome'
  );

  insert into public.learning_item_evidence(
    learning_item_id,child_id,parent_user_id,writing_issue_id,task_submission_id,
    evidence_type,source_context,metadata,created_at,updated_at
  ) select
    v_learning_item_id,v_issue.child_id,v_issue.parent_user_id,attempt.writing_issue_id,
    attempt.task_submission_id,
    public.learning_item_evidence_type_for_correction_attempt(
      coalesce((attempt.metadata->>'marked_fixed')::boolean,false),attempt.reflection,
      attempt.corrected_independently
    ),'child_correction_attempt',
    jsonb_build_object('corrected_independently',attempt.corrected_independently,
      'reflection',attempt.reflection,'marked_fixed',coalesce((attempt.metadata->>'marked_fixed')::boolean,false),
      'reflection_source',attempt.metadata->>'reflection_source','evidence_kind','REPAIR_ONLY')
      ||coalesce(attempt.metadata,'{}'::jsonb),attempt.created_at,v_now
  from public.writing_issue_correction_attempts attempt
  where attempt.writing_issue_id=v_issue.id and attempt.parent_user_id=p_parent_user_id
    and attempt.child_id=p_child_id;
  get diagnostics v_attempt_evidence_count=row_count;

  return jsonb_build_object('created_learning_item',v_created,'reused_learning_item',v_reused,
    'learning_item_id',v_learning_item_id,'issue_evidence_rows_created',v_issue_evidence_count,
    'child_correction_evidence_rows_created',v_attempt_evidence_count);
end $$;
revoke all on function public.finalise_contextual_learning_item(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalise_contextual_learning_item(uuid,uuid,uuid,text) to service_role;

create or replace function public.record_controlled_practice_learning_item_evidence(
  p_learning_item_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid,
  p_daily_assignment_id uuid,
  p_target_word text,
  p_submitted_word text,
  p_is_correct boolean,
  p_felt_weak boolean,
  p_attempt_mode text,
  p_attempted_at timestamptz
) returns jsonb
language plpgsql
as $$
declare
  v_learning_item public.learning_items%rowtype;
  v_evidence_type text;
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
    public.learning_item_evidence_type_for_controlled_practice(p_is_correct);

  insert into public.learning_item_evidence (
    learning_item_id,
    child_id,
    parent_user_id,
    writing_issue_id,
    task_submission_id,
    evidence_type,
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
    p_attempted_at,
    'controlled_practice_attempt'
  );

  return jsonb_build_object(
    'evidence_written', true,
    'evidence_type', v_evidence_type
  );
end;
$$;


-- Remove the obsolete overload and the functions that encoded its 1-5 ladder.
drop function if exists public.apply_learning_item_review_state_from_evidence(
  uuid, text, integer, timestamptz, text
);
drop function if exists public.initial_learning_item_competency_for_final_classification(text);
drop function if exists public.next_learning_item_competency_for_controlled_practice(integer, boolean, boolean);
drop function if exists public.review_interval_for_learning_item_competency(integer);

alter table public.learning_item_evidence
  drop column if exists competency_signal;
alter table public.learning_items
  drop column if exists current_competency_level,
  drop column if exists target_competency_level;

comment on table public.learning_items is
  'Active writing-practice records. Proficiency levels are owned by ADLE child microskill proficiency records.';
comment on table public.learning_item_evidence is
  'Diagnostic and practice evidence for writing items; it does not carry a separate proficiency level.';
