begin;

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
    when coalesce(p_current_competency, 0) >= 4 then p_current_competency
    when p_is_correct is true and p_current_competency is null and p_felt_weak is true then 1
    when p_is_correct is true and p_current_competency is null then 3
    when p_is_correct is true and p_felt_weak is true then greatest(least(coalesce(p_current_competency, 1), 3), 1)
    when p_is_correct is true then least(coalesce(p_current_competency, 2) + 1, 3)
    when p_current_competency is null then null
    else greatest(p_current_competency - 1, 1)
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

commit;
