-- One authorised retry of the named course writing that failed before dispatch
-- under the former three-window ceiling. The immutable grant and job reset are
-- atomic; no historical model request may be repeated through this function.
create function public.replay_named_15_window_course_scan(
  p_source_hash text, p_approved_by uuid, p_evidence_ref text, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_job public.writing_context_shadow_jobs%rowtype;
  v_source public.writing_source_snapshots%rowtype;
  v_policy public.writing_context_shadow_policy%rowtype;
  v_approval public.writing_context_provider_approvals%rowtype;
  v_control public.writing_context_advisory_control%rowtype;
begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select * into v_job from public.writing_context_shadow_jobs
    where id='c7a32b7e-08c5-4804-b0ee-b732cfbe1728'::uuid for update;
  select * into v_source from public.writing_source_snapshots
    where id='c994580f-0662-4f7c-9365-7ea39e6950b8'::uuid for update;
  select * into v_control from public.writing_context_advisory_control where singleton;
  select * into v_policy from public.writing_context_shadow_policy where singleton;
  select * into v_approval from public.writing_context_provider_approvals
    where id=v_policy.provider_approval_id;
  if v_job.id is null or v_job.snapshot_id is distinct from v_source.id
    or v_job.status<>'failed' or v_job.error_code<>'AI_PASSAGE_TOO_LONG'
    or v_job.claim_count<>1 or v_job.claim_token is null
    or v_job.claimed_at is null or v_job.completed_at is null
    or v_source.id is null
    or v_source.submission_id is distinct from 'eace113f-3521-400c-9c55-c319f0a1bd1f'::uuid
    or v_source.source_purpose<>'REAL_LEARNER'
    or v_source.child_id is distinct from 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
    or v_source.parent_user_id is distinct from p_approved_by
    or v_source.envelope->>'contextAiModeAtCapture'<>'shadow'
    or v_source.envelope->>'contextAiShadowCapture'<>'true'
    or v_source.envelope->>'contextAdvisoryCapture'<>'false'
    or p_source_hash is distinct from encode(extensions.digest(
      convert_to(v_source.envelope::text,'UTF8'),'sha256'),'hex')
    or nullif(btrim(p_evidence_ref),'') is null
    or p_expires_at is null or p_expires_at<=clock_timestamp()
    or p_expires_at>clock_timestamp()+interval '7 days'
    or v_control.singleton is null or v_control.enabled or v_control.ai_mode<>'shadow'
    or v_policy.singleton is null or v_policy.execution_policy_kind<>'ADULT_RELEASE'
    or v_policy.dispatch_scope<>'REAL_LEARNER' or v_policy.revision_id is null
    or v_approval.id is null or v_approval.environment<>'production'
    or v_approval.dispatch_scope<>'REAL_LEARNER'
    or v_approval.model<>'gpt-6-luna' or v_approval.endpoint<>'/v1/responses'
    or v_approval.config_fingerprint<>'c38bce41e1d31c829d0c96be92b142bb28d6999ce4c2f6b8f159c066a89b175d'
    or v_approval.runtime_fingerprint<>'f3af484fcf56f622fba6e7175a0799e309eafa04c7eef11adaec46a89f325217'
    or v_approval.approved_at>clock_timestamp() or v_approval.expires_at<=clock_timestamp()
    or exists(select 1 from public.writing_context_approval_revocations r
      where r.provider_approval_id=v_approval.id)
    or not exists(select 1 from public.children c where c.id=v_source.child_id
      and c.parent_user_id=v_source.parent_user_id and c.is_archived=false)
    or not exists(select 1 from public.task_submissions t
      join public.course_tasks k on k.id=t.task_id
      where t.id=v_source.submission_id and t.parent_user_id=v_source.parent_user_id
        and t.child_id=v_source.child_id and t.parent_review_status='pending'
        and k.task_type='lesson' and k.parent_user_id=v_source.parent_user_id
        and not exists(select 1 from public.task_submissions newer
          where newer.task_id=t.task_id and newer.child_id=t.child_id
            and newer.submitted_at>t.submitted_at))
    or exists(select 1 from public.course_context_replay_grants g
      where g.snapshot_id=v_source.id)
    or exists(select 1 from public.writing_context_shadow_dispatches d
      where d.job_id=v_job.id)
    or exists(select 1 from public.writing_context_ai_attempts a
      where a.snapshot_id=v_source.id)
    or exists(select 1 from public.writing_context_passage_findings f
      where f.snapshot_id=v_source.id)
    or not exists(select 1 from public.writing_context_learner_authorisations l
      where l.child_id=v_source.child_id and l.parent_user_id=v_source.parent_user_id
        and l.policy_version=v_policy.learner_policy_version
        and l.authorisation_kind='ADULT_SUBMISSION'
        and l.approved_by=v_source.parent_user_id and l.expires_at>clock_timestamp()
        and not exists(select 1 from public.writing_context_approval_revocations r
          where r.learner_authorisation_id=l.id))
    then raise exception 'named_15_window_replay_ineligible'; end if;

  insert into public.course_context_replay_grants
    (snapshot_id,source_hash,approved_by,evidence_ref,expires_at)
    values(v_source.id,p_source_hash,p_approved_by,p_evidence_ref,p_expires_at);
  update public.writing_context_shadow_jobs set
    status='pending', run_key='capacity-replay:'||gen_random_uuid()::text,
    error_code=null, claim_token=null, claimed_at=null, claim_count=0,
    completed_at=null, next_eligible_at=null,
    summary='{}'::jsonb
    where id=v_job.id;
  return v_job.id;
end $$;

revoke all on function public.replay_named_15_window_course_scan(text,uuid,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.replay_named_15_window_course_scan(text,uuid,text,timestamptz)
  to service_role;
