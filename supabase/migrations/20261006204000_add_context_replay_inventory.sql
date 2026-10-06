-- Read-only, current Review Work inventory. This grants no provider access.
create function public.context_replay_dry_run_inventory()
returns table(source_type text,source_id uuid,source_hash text,
  replay_status text,reason text)
language sql stable security definer set search_path=public,pg_temp as $$
  with latest_course as (
    select distinct on (t.task_id,t.child_id) t.id,t.task_id,t.child_id,t.parent_user_id,
      t.parent_review_status,t.submitted_at
    from public.task_submissions t
    join public.course_tasks k on k.id=t.task_id and k.task_type='lesson'
    where t.child_id='e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
    order by t.task_id,t.child_id,t.submitted_at desc,t.id desc
  )
  select 'course_lesson'::text,t.id,
    case when s.id is null then null else
      encode(extensions.digest(convert_to(s.envelope::text,'UTF8'),'sha256'),'hex') end,
    case when s.id is null then 'manual_review'
      when s.source_purpose<>'REAL_LEARNER' then 'manual_review'
      when s.envelope->>'rawCaptureAvailable'<>'true' then 'manual_review'
      else 'verify_authorship' end,
    case when s.id is null then 'SOURCE_NOT_CAPTURED'
      when s.source_purpose<>'REAL_LEARNER' then 'SOURCE_PURPOSE_UNVERIFIED'
      when s.envelope->>'rawCaptureAvailable'<>'true' then 'AUTHORSHIP_UNVERIFIED'
      else 'EXTRACT_AUTHORED_FIELDS' end
  from latest_course t
  left join public.writing_source_snapshots s on s.submission_id=t.id
  where t.parent_review_status='pending'
    and not exists(select 1 from public.writing_context_shadow_jobs j where j.snapshot_id=s.id)
    and not exists(select 1 from public.writing_context_ai_attempts a where a.snapshot_id=s.id)
  union all
  select 'adle_review'::text,r.id,
    encode(extensions.digest(convert_to(r.submitted_writing_text,'UTF8'),'sha256'),'hex'),
    case when r.writing_started_at is null or r.writing_submitted_at is null
      then 'manual_review' else 'eligible' end,
    case when r.writing_started_at is null or r.writing_submitted_at is null
      then 'AUTHORSHIP_UNVERIFIED' else 'FINAL_REVIEW_WRITING' end
  from public.adle_review_sessions r
  left join public.adle_review_context_sources s on s.review_session_id=r.id
  where r.child_id='e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
    and r.completed_at is not null and r.submitted_writing_text is not null
    and not exists(select 1 from public.adle_review_parent_reviews p where p.review_session_id=r.id)
    and not exists(select 1 from public.adle_review_context_jobs j where j.source_id=s.id)
  order by 1,2;
$$;
revoke all on function public.context_replay_dry_run_inventory() from public,anon,authenticated;
grant execute on function public.context_replay_dry_run_inventory() to service_role;
