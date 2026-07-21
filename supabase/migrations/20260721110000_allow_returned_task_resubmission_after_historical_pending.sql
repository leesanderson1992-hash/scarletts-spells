-- A returned latest submission must reopen the task even if historical rows
-- from an earlier workflow cycle remain pending or approved.

create or replace function public.submit_course_task_response_once(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_course_id uuid,
  p_task_id uuid,
  p_submission_request_id uuid,
  p_submission_text text,
  p_submitted_at timestamptz,
  p_completion_date date,
  p_structured_payload_type text default null,
  p_structured_payload jsonb default null,
  p_processing_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task_type text;
  v_existing public.task_submissions%rowtype;
  v_submission public.task_submissions%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_parent_user_id then
    raise exception 'Course task submission authentication failed';
  end if;
  if p_submission_request_id is null
    or nullif(btrim(coalesce(p_submission_text, '')), '') is null
    or p_submitted_at is null
    or p_completion_date is null
    or jsonb_typeof(coalesce(p_processing_payload, '{}'::jsonb)) <> 'object'
  then
    raise exception 'Course task submission envelope validation failed';
  end if;

  select task_type into v_task_type
  from public.course_tasks
  where id = p_task_id
    and course_id = p_course_id
    and parent_user_id = p_parent_user_id
    and task_type in ('lesson', 'test');
  if v_task_type is null then
    raise exception 'Course task submission ownership or task validation failed';
  end if;
  if not exists (
    select 1 from public.children
    where id = p_child_id and parent_user_id = p_parent_user_id
  ) then
    raise exception 'Course task submission child validation failed';
  end if;
  if not exists (
    select 1 from public.courses
    where id = p_course_id
      and child_id = p_child_id
      and parent_user_id = p_parent_user_id
  ) then
    raise exception 'Course task submission course validation failed';
  end if;

  if (p_structured_payload_type is null) <> (p_structured_payload is null)
    or (p_structured_payload_type is not null and p_structured_payload_type <> case
      when v_task_type = 'lesson' then 'structured_lesson_response'
      else 'structured_test_response'
    end)
    or (p_structured_payload is not null and jsonb_typeof(p_structured_payload) <> 'object')
  then
    raise exception 'Course task structured payload validation failed';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_parent_user_id::text || ':' || p_child_id::text || ':' || p_task_id::text, 0)
  );

  select * into v_existing
  from public.task_submissions
  where parent_user_id = p_parent_user_id
    and child_id = p_child_id
    and task_id = p_task_id
    and submission_request_id = p_submission_request_id
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'submissionId', v_existing.id,
      'outcome', 'duplicate',
      'submittedAt', v_existing.submitted_at
    );
  end if;

  -- Only the newest submission defines the current child workflow state.
  -- A historical pending/approved row cannot strand later returned work.
  select * into v_existing
  from public.task_submissions
  where parent_user_id = p_parent_user_id
    and child_id = p_child_id
    and task_id = p_task_id
  order by submitted_at desc, created_at desc
  limit 1;
  if v_existing.id is not null
    and v_existing.parent_review_status in ('pending', 'approved')
  then
    return jsonb_build_object(
      'submissionId', v_existing.id,
      'outcome', 'already_submitted',
      'submittedAt', v_existing.submitted_at
    );
  end if;

  insert into public.task_submissions (
    task_id, course_id, child_id, parent_user_id, submission_request_id,
    submission_text, submitted_at, parent_review_status,
    parent_review_note, parent_reviewed_at
  ) values (
    p_task_id, p_course_id, p_child_id, p_parent_user_id, p_submission_request_id,
    p_submission_text, p_submitted_at, 'pending', null, null
  ) returning * into v_submission;

  if p_structured_payload is not null then
    insert into public.task_submission_payloads (
      submission_id, parent_user_id, course_id, task_id, child_id,
      payload_type, payload_version, payload_json
    ) values (
      v_submission.id, p_parent_user_id, p_course_id, p_task_id, p_child_id,
      p_structured_payload_type, 1, p_structured_payload
    );
  end if;

  insert into public.task_completions (
    task_id, course_id, child_id, parent_user_id,
    completion_date, quantity_completed, completed_at
  ) values (
    p_task_id, p_course_id, p_child_id, p_parent_user_id,
    p_completion_date, 1, p_submitted_at
  )
  on conflict (task_id, child_id, completion_date) do update set
    quantity_completed = 1,
    completed_at = excluded.completed_at,
    updated_at = timezone('utc', now());

  insert into public.task_submission_processing_jobs (
    submission_id, parent_user_id, child_id, task_id, payload
  ) values (
    v_submission.id, p_parent_user_id, p_child_id, p_task_id,
    coalesce(p_processing_payload, '{}'::jsonb)
  );

  return jsonb_build_object(
    'submissionId', v_submission.id,
    'outcome', 'created',
    'submittedAt', v_submission.submitted_at
  );
end;
$$;

revoke all on function public.submit_course_task_response_once(
  uuid, uuid, uuid, uuid, uuid, text, timestamptz, date, text, jsonb, jsonb
) from public;
grant execute on function public.submit_course_task_response_once(
  uuid, uuid, uuid, uuid, uuid, text, timestamptz, date, text, jsonb, jsonb
) to authenticated;
