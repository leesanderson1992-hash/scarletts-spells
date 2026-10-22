-- Repair the provider-approval variable/attempt alias collision in the
-- service-role replay grant. Require the current owner and unrevoked learner
-- and provider approvals before creating either immutable fact.
create or replace function public.grant_course_context_replay(
  p_snapshot_id uuid,p_source_hash text,p_approved_by uuid,p_evidence_ref text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_source public.writing_source_snapshots%rowtype;
  v_policy public.writing_context_shadow_policy%rowtype;
  v_approval public.writing_context_provider_approvals%rowtype;
  v_job_id uuid;
begin
  select * into v_source from public.writing_source_snapshots
    where id=p_snapshot_id for update;
  select * into v_policy from public.writing_context_shadow_policy where singleton;
  select * into v_approval from public.writing_context_provider_approvals
    where id=v_policy.provider_approval_id;
  if v_source.id is null
    or v_source.child_id is distinct from 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
    or v_source.source_purpose is distinct from 'REAL_LEARNER'
    or v_source.parent_user_id is distinct from p_approved_by
    or p_source_hash is distinct from encode(extensions.digest(
      convert_to(v_source.envelope::text,'UTF8'),'sha256'),'hex')
    or p_expires_at is null or p_expires_at<=clock_timestamp()
    or p_expires_at>clock_timestamp()+interval '7 days'
    or nullif(btrim(p_evidence_ref),'') is null
    or v_policy.singleton is null
    or v_policy.execution_policy_kind is distinct from 'ADULT_RELEASE'
    or v_policy.dispatch_scope is distinct from 'REAL_LEARNER'
    or v_approval.id is null or v_approval.environment is distinct from 'production'
    or v_approval.dispatch_scope is distinct from 'REAL_LEARNER'
    or v_approval.expires_at<=clock_timestamp()
    or v_approval.approved_at>clock_timestamp()
    or exists(select 1 from public.writing_context_approval_revocations r
      where r.provider_approval_id=v_approval.id)
    or not exists(select 1 from public.children c
      where c.id=v_source.child_id and c.parent_user_id=v_source.parent_user_id
        and c.is_archived=false)
    or not exists(select 1 from public.task_submissions t
      join public.course_tasks k on k.id=t.task_id and k.task_type='lesson'
      where t.id=v_source.submission_id and t.child_id=v_source.child_id
        and t.parent_user_id=v_source.parent_user_id
        and k.parent_user_id=v_source.parent_user_id
        and t.parent_review_status='pending'
        and not exists(select 1 from public.task_submissions newer
          where newer.task_id=t.task_id and newer.child_id=t.child_id
            and newer.submitted_at>t.submitted_at))
    or not exists(select 1 from public.writing_context_learner_authorisations l
      where l.child_id=v_source.child_id and l.parent_user_id=v_source.parent_user_id
        and l.policy_version=v_policy.learner_policy_version
        and l.authorisation_kind='ADULT_SUBMISSION'
        and l.approved_by=v_source.parent_user_id
        and l.expires_at>clock_timestamp()
        and not exists(select 1 from public.writing_context_approval_revocations r
          where r.learner_authorisation_id=l.id))
    or exists(select 1 from public.writing_context_ai_attempts attempt
      where attempt.snapshot_id=v_source.id)
    or exists(select 1 from public.writing_context_shadow_jobs job
      where job.snapshot_id=v_source.id)
    or exists(select 1 from public.course_context_replay_grants grant_record
      where grant_record.snapshot_id=v_source.id)
    then raise exception 'course_context_replay_source_ineligible'; end if;

  insert into public.course_context_replay_grants
    (snapshot_id,source_hash,approved_by,evidence_ref,expires_at)
    values(v_source.id,p_source_hash,p_approved_by,p_evidence_ref,p_expires_at);
  insert into public.writing_context_shadow_jobs(snapshot_id,run_key)
    values(v_source.id,'replay:'||gen_random_uuid()::text)
    returning id into v_job_id;
  return v_job_id;
end $$;

revoke all on function public.grant_course_context_replay(uuid,text,uuid,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.grant_course_context_replay(uuid,text,uuid,text,timestamptz)
  to service_role;
