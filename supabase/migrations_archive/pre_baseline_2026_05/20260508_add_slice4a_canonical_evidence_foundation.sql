begin;

create or replace function public.learning_item_evidence_type_for_final_classification(
  p_final_classification text
)
returns text
language sql
immutable
as $$
  select case p_final_classification
    when 'concept_gap' then 'incorrect_use'
    when 'fragile_knowledge' then 'incorrect_use'
    when 'transfer_failure' then 'incorrect_use'
    else null
  end;
$$;

create or replace function public.learning_item_evidence_type_for_correction_attempt(
  p_marked_fixed boolean,
  p_reflection text,
  p_corrected_independently boolean
)
returns text
language sql
immutable
as $$
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

create or replace function public.apply_learning_item_review_state_from_evidence(
  p_learning_item_id uuid,
  p_evidence_type text,
  p_competency_signal integer,
  p_occurred_at timestamptz,
  p_source_context text
)
returns void
language plpgsql
as $$
begin
  update public.learning_items
  set
    current_competency_level = case
      when current_competency_level is null
        and p_competency_signal between 1 and 5
        then p_competency_signal
      else current_competency_level
    end,
    progress_state = case
      when p_source_context = 'finalised_issue_outcome'
        and p_evidence_type = 'incorrect_use'
        and progress_state = 'gold_bar'
        then 'in_machine'
      else progress_state
    end,
    review_due_at = case
      when p_source_context = 'finalised_issue_outcome'
        and p_evidence_type = 'incorrect_use'
        and progress_state <> 'golden_nugget'
        then least(
          coalesce(review_due_at, p_occurred_at + interval '1 day'),
          p_occurred_at + interval '1 day'
        )
      else review_due_at
    end,
    last_meaningful_failure_at = case
      when p_source_context = 'finalised_issue_outcome'
        and p_evidence_type = 'incorrect_use'
        then p_occurred_at
      else last_meaningful_failure_at
    end,
    updated_at = timezone('utc', now())
  where id = p_learning_item_id;
end;
$$;

create or replace function public.finalise_writing_issue_classification_and_learning_item(
  p_writing_issue_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid,
  p_final_classification text
)
returns jsonb
language plpgsql
as $$
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

grant execute on function public.learning_item_evidence_type_for_final_classification(text) to authenticated;
grant execute on function public.learning_item_evidence_type_for_correction_attempt(boolean, text, boolean) to authenticated;
grant execute on function public.apply_learning_item_review_state_from_evidence(uuid, text, integer, timestamptz, text) to authenticated;
grant execute on function public.finalise_writing_issue_classification_and_learning_item(uuid, uuid, uuid, text) to authenticated;

commit;
