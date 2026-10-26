-- A parent-authored issue and its accepted suggestion are one review action.
create or replace function public.save_parent_manual_writing_issue_v1(
  p_writing_sample_id uuid,
  p_task_submission_id uuid,
  p_observed_text text,
  p_approved_replacement text,
  p_micro_skill_key text,
  p_note text,
  p_source_field_key text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_id uuid := auth.uid();
  v_sample public.writing_samples%rowtype;
  v_suggestion_id uuid;
  v_issue_id uuid;
  v_observed text := nullif(btrim(p_observed_text), '');
  v_replacement text := nullif(btrim(p_approved_replacement), '');
begin
  if v_parent_id is null or v_observed is null
    or char_length(v_observed) > 500
    or char_length(coalesce(v_replacement, '')) > 500
    or nullif(btrim(p_micro_skill_key), '') is null
  then
    raise exception 'Manual writing issue input is incomplete.';
  end if;
  select * into v_sample from public.writing_samples
  where id = p_writing_sample_id and parent_user_id = v_parent_id
    and task_submission_id is not distinct from p_task_submission_id
  for update;
  if not found then
    raise exception 'The owned writing sample is unavailable.';
  end if;
  if p_task_submission_id is null and v_sample.review_completed_at is not null then
    raise exception 'The manual writing sample review is already complete.';
  end if;

  select issue.id into v_issue_id from public.writing_issues issue
  where issue.parent_user_id = v_parent_id
    and issue.child_id = v_sample.child_id
    and issue.writing_sample_id = v_sample.id
    and issue.task_submission_id is not distinct from p_task_submission_id
    and issue.source_misspelling_instance_id is null
    and issue.observed_text = v_observed
    and issue.approved_replacement is not distinct from v_replacement
  order by issue.created_at desc limit 1;
  if v_issue_id is not null then return v_issue_id; end if;

  insert into public.writing_issue_suggestions(
    child_id, parent_user_id, task_submission_id, writing_sample_id,
    source_type, suggestion_status, observed_text, suggested_replacement,
    source_field_key, suggested_micro_skill_key, notes, resolved_at
  ) values (
    v_sample.child_id, v_parent_id, p_task_submission_id, v_sample.id,
    'parent_manual', 'accepted', v_observed, v_replacement,
    p_source_field_key, p_micro_skill_key, p_note, clock_timestamp()
  ) returning id into v_suggestion_id;

  insert into public.writing_issues(
    child_id, parent_user_id, task_submission_id, writing_sample_id,
    source_suggestion_id, issue_status, final_classification,
    observed_text, suggested_replacement, approved_replacement,
    source_field_key, micro_skill_key, parent_review_note, parent_marked_at
  ) values (
    v_sample.child_id, v_parent_id, p_task_submission_id, v_sample.id,
    v_suggestion_id, 'pending_parent_review', null,
    v_observed, v_replacement, v_replacement,
    p_source_field_key, p_micro_skill_key, p_note, clock_timestamp()
  ) returning id into v_issue_id;
  return v_issue_id;
end;
$$;

revoke all on function public.save_parent_manual_writing_issue_v1(uuid,uuid,text,text,text,text,text)
  from public, anon;
grant execute on function public.save_parent_manual_writing_issue_v1(uuid,uuid,text,text,text,text,text)
  to authenticated;
