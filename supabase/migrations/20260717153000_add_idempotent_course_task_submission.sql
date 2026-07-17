-- Make course lesson/test submission one short, duplicate-proof transaction.

alter table public.task_submissions
  add column if not exists submission_request_id uuid;

create unique index if not exists task_submissions_request_idempotency_idx
  on public.task_submissions (
    parent_user_id,
    child_id,
    task_id,
    submission_request_id
  )
  where submission_request_id is not null;

create table if not exists public.task_submission_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz not null default timezone('utc', now()),
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists task_submission_processing_jobs_submission_idx
  on public.task_submission_processing_jobs (submission_id);

create index if not exists task_submission_processing_jobs_recovery_idx
  on public.task_submission_processing_jobs (status, next_retry_at, created_at)
  where status in ('pending', 'processing', 'failed');

alter table public.task_submission_processing_jobs enable row level security;

drop policy if exists task_submission_processing_jobs_parent_select
  on public.task_submission_processing_jobs;
create policy task_submission_processing_jobs_parent_select
  on public.task_submission_processing_jobs
  for select to authenticated
  using (auth.uid() = parent_user_id);

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

  -- Serialise all submission intents for one learner/task. This closes the
  -- different-request-id race as well as ordinary retry duplication.
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

  select * into v_existing
  from public.task_submissions
  where parent_user_id = p_parent_user_id
    and child_id = p_child_id
    and task_id = p_task_id
    and parent_review_status in ('pending', 'approved')
  order by submitted_at desc, created_at desc
  limit 1;
  if v_existing.id is not null then
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

grant select on public.task_submission_processing_jobs to authenticated;
grant all on public.task_submission_processing_jobs to service_role;

-- Operational incident cleanup boundary. The CLI performs the human-readable
-- audit; this function repeats the safety invariants and deletes atomically.
create or replace function public.cleanup_verified_duplicate_task_submissions(
  p_parent_user_id uuid,
  p_canonical_submission_id uuid,
  p_duplicate_submission_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected integer;
  v_canonical public.task_submissions%rowtype;
begin
  v_expected := coalesce(array_length(p_duplicate_submission_ids, 1), 0);
  if v_expected < 1
    or (select count(distinct id) from unnest(p_duplicate_submission_ids) as id) <> v_expected
    or p_canonical_submission_id = any(p_duplicate_submission_ids)
  then
    raise exception 'Duplicate cleanup identifiers are invalid';
  end if;

  select * into v_canonical
  from public.task_submissions
  where id = p_canonical_submission_id and parent_user_id = p_parent_user_id
  for update;
  if v_canonical.id is null then raise exception 'Canonical submission was not found'; end if;

  perform 1 from public.task_submissions
  where id = any(p_duplicate_submission_ids)
  for update;
  if (
    select count(*) from public.task_submissions
    where id = any(p_duplicate_submission_ids)
      and parent_user_id = p_parent_user_id
      and child_id = v_canonical.child_id
      and task_id = v_canonical.task_id
      and course_id = v_canonical.course_id
      and parent_review_status = 'pending'
      and parent_review_note is null
      and parent_reviewed_at is null
  ) <> v_expected then
    raise exception 'Duplicate cleanup scope or review-state validation failed';
  end if;
  if (
    select count(distinct regexp_replace(btrim(submission_text), '\s+', ' ', 'g'))
    from public.task_submissions
    where id = p_canonical_submission_id or id = any(p_duplicate_submission_ids)
  ) <> 1 then
    raise exception 'Duplicate cleanup text validation failed';
  end if;
  if (
    select count(*)
    from public.task_submission_payloads
    where submission_id = p_canonical_submission_id or submission_id = any(p_duplicate_submission_ids)
  ) <> v_expected + 1 or (
    select count(distinct (payload_json - 'draft_saved_at' - 'submitted_at'))
    from public.task_submission_payloads
    where submission_id = p_canonical_submission_id or submission_id = any(p_duplicate_submission_ids)
  ) <> 1 then
    raise exception 'Duplicate cleanup structured payload validation failed';
  end if;

  if exists (select 1 from public.learning_item_evidence where task_submission_id = any(p_duplicate_submission_ids))
    or exists (select 1 from public.parent_verifications where task_submission_id = any(p_duplicate_submission_ids))
    or exists (select 1 from public.parent_verified_spelling_candidate_mappings where task_submission_id = any(p_duplicate_submission_ids))
    or exists (select 1 from public.writing_issue_correction_attempts where task_submission_id = any(p_duplicate_submission_ids))
    or exists (select 1 from public.writing_issue_suggestions where task_submission_id = any(p_duplicate_submission_ids))
    or exists (select 1 from public.writing_issues where task_submission_id = any(p_duplicate_submission_ids))
    or exists (select 1 from public.child_word_treasures where source_submission_id = any(p_duplicate_submission_ids))
    or exists (select 1 from public.spelling_canonical_mapping_recommendations where task_submission_id = any(p_duplicate_submission_ids))
    or exists (select 1 from public.spelling_catalog_review_cases where task_submission_id = any(p_duplicate_submission_ids))
    or exists (
      select 1 from public.child_word_treasure_evidence_candidates
      where task_submission_id = any(p_duplicate_submission_ids)
        and confirmation_status = 'confirmed'
    )
  then
    raise exception 'Duplicate cleanup found protected review, evidence, or reward truth';
  end if;

  delete from public.writing_samples where task_submission_id = any(p_duplicate_submission_ids);
  delete from public.child_word_treasure_evidence_candidates
    where task_submission_id = any(p_duplicate_submission_ids);
  delete from public.task_submissions where id = any(p_duplicate_submission_ids);
  if not found then raise exception 'Duplicate cleanup deleted no submissions'; end if;
  return v_expected;
end;
$$;

revoke all on function public.cleanup_verified_duplicate_task_submissions(uuid, uuid, uuid[]) from public;
grant execute on function public.cleanup_verified_duplicate_task_submissions(uuid, uuid, uuid[]) to service_role;
