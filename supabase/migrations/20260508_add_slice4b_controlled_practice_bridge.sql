begin;

create or replace function public.learning_item_evidence_type_for_controlled_practice(
  p_is_correct boolean
)
returns text
language sql
immutable
as $$
  select case
    when p_is_correct is true then 'controlled_practice_success'
    else 'incorrect_use'
  end;
$$;

create or replace function public.next_learning_item_competency_for_controlled_practice(
  p_current_competency integer,
  p_is_correct boolean,
  p_felt_weak boolean
)
returns integer
language sql
immutable
as $$
  select case
    when p_is_correct is true and p_current_competency is null and p_felt_weak is true then 1
    when p_is_correct is true and p_current_competency is null then 3
    when p_is_correct is true and p_felt_weak is true then greatest(coalesce(p_current_competency, 1), 1)
    when p_is_correct is true then least(p_current_competency + 1, 5)
    when p_current_competency is null then null
    else greatest(p_current_competency - 1, 1)
  end;
$$;

create or replace function public.review_interval_for_learning_item_competency(
  p_competency_level integer
)
returns interval
language sql
immutable
as $$
  select case
    when p_competency_level >= 5 then interval '14 days'
    when p_competency_level = 4 then interval '7 days'
    when p_competency_level = 3 then interval '3 days'
    else interval '1 day'
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
      v_next_progress_state := case
        when coalesce(v_next_competency, v_item.current_competency_level, 1) >= 5
          then 'gold_bar'
        else 'in_machine'
      end;
      v_next_review_due_at :=
        p_occurred_at + public.review_interval_for_learning_item_competency(
          coalesce(v_next_competency, v_item.current_competency_level, 1)
        );
    elsif p_evidence_type = 'incorrect_use' then
      if v_item.progress_state = 'gold_bar' then
        v_next_progress_state := 'in_machine';
      end if;

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
    last_meaningful_success_at = case
      when p_source_context = 'controlled_practice_attempt'
        and p_evidence_type = 'controlled_practice_success'
        then p_occurred_at
      else last_meaningful_success_at
    end,
    last_meaningful_failure_at = case
      when p_evidence_type = 'incorrect_use'
        and p_source_context in ('finalised_issue_outcome', 'controlled_practice_attempt')
        then p_occurred_at
      else last_meaningful_failure_at
    end,
    updated_at = timezone('utc', now())
  where id = p_learning_item_id;
end;
$$;

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
)
returns jsonb
language plpgsql
as $$
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

commit;
