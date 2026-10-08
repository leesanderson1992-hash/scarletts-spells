-- A release after a safety stop must not claim captures that predate the
-- reactivated control and approval. Existing work needs an exact replay grant.
create or replace function public.claim_writing_context_shadow(p_submission_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.writing_context_shadow_jobs%rowtype;
begin
  update public.writing_context_shadow_jobs set status='failed',
    error_code='AI_CLAIM_RETRIES_EXHAUSTED',completed_at=clock_timestamp()
    where status='processing' and claim_count>=8
      and claimed_at<clock_timestamp()-interval '60 seconds';
  select j.* into v_job from public.writing_context_shadow_jobs j
    join public.writing_source_snapshots s on s.id=j.snapshot_id
    join public.task_submissions t on t.id=s.submission_id
    join public.course_tasks k on k.id=t.task_id
    join public.writing_context_advisory_control ctl on ctl.singleton
    join public.writing_context_shadow_policy p on p.singleton
    join public.writing_context_provider_approvals a on a.id=p.provider_approval_id
    where (p_submission_id is null or s.submission_id=p_submission_id)
      and (j.status='pending' or j.status='deferred' and j.next_eligible_at<=clock_timestamp()
        or j.status='processing' and j.claimed_at<clock_timestamp()-interval '60 seconds')
      and j.claim_count<8 and t.parent_review_status='pending'
      and t.parent_user_id=s.parent_user_id and t.child_id=s.child_id
      and k.task_type='lesson' and k.parent_user_id=s.parent_user_id
      and not exists(select 1 from public.task_submissions newer
        where newer.task_id=t.task_id and newer.child_id=t.child_id
          and newer.submitted_at>t.submitted_at)
      and ((s.occurred_at>=ctl.updated_at and s.occurred_at>=a.approved_at
        and s.envelope->>'contextAiModeAtCapture'='shadow'
        and s.envelope->>'contextAiShadowCapture'='true'
        and s.envelope->>'contextAdvisoryCapture'='false')
        or public.course_context_replay_authorised(s.id))
    order by j.created_at for update of j skip locked limit 1;
  if v_job.id is null then return null; end if;
  update public.writing_context_shadow_jobs set status='processing',claim_token=gen_random_uuid(),
    claimed_at=clock_timestamp(),next_eligible_at=null,
    claim_count=claim_count+case when v_job.status='deferred' then 0 else 1 end
    where id=v_job.id returning * into v_job;
  update public.writing_context_shadow_dispatches set state='abandoned',finished_at=clock_timestamp()
    where job_id=v_job.id and state in ('sent','reserved');
  return to_jsonb(v_job);
end $$;

-- Grant an existing, unsent course job one bounded replay after a recorded
-- configuration stop. The prior grant function only creates a new job.
create function public.grant_held_course_context_replay(
  p_job_id uuid,p_snapshot_id uuid,p_source_hash text,p_stop_id uuid,
  p_approved_by uuid,p_evidence_ref text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.writing_context_shadow_jobs%rowtype;
  s public.writing_source_snapshots%rowtype;
  ctl public.writing_context_advisory_control%rowtype;
  p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype;
  stop public.writing_context_shadow_stops%rowtype;
  v_grant_id uuid;
begin
  select * into j from public.writing_context_shadow_jobs where id=p_job_id for update;
  select * into s from public.writing_source_snapshots where id=j.snapshot_id for update;
  select * into ctl from public.writing_context_advisory_control where singleton;
  select * into p from public.writing_context_shadow_policy where singleton;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  select * into stop from public.writing_context_shadow_stops where id=p_stop_id;
  if j.id is null or j.snapshot_id is distinct from p_snapshot_id
    or j.status<>'pending' or j.claim_count<>0 or j.claim_token is not null
    or j.claimed_at is not null or j.completed_at is not null or j.error_code is not null
    or s.id is null or s.source_purpose<>'REAL_LEARNER'
    or s.child_id is distinct from 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
    or s.parent_user_id is distinct from p_approved_by
    or s.envelope->>'contextAiModeAtCapture'<>'shadow'
    or s.envelope->>'contextAiShadowCapture'<>'true'
    or s.envelope->>'contextAdvisoryCapture'<>'false'
    or p_source_hash is distinct from encode(extensions.digest(convert_to(s.envelope::text,'UTF8'),'sha256'),'hex')
    or nullif(btrim(p_evidence_ref),'') is null
    or p_expires_at is null or p_expires_at<=clock_timestamp()
    or p_expires_at>clock_timestamp()+interval '24 hours'
    or ctl.singleton is null or ctl.enabled or ctl.ai_mode<>'disabled'
    or stop.id is null or stop.code<>'AI_CONFIGURATION_STOP' or stop.created_at<=j.created_at
    or p.singleton is null or p.execution_policy_kind<>'ADULT_RELEASE'
    or p.dispatch_scope<>'REAL_LEARNER' or p.revision_id is null
    or a.id is null or a.environment<>'production' or a.dispatch_scope<>'REAL_LEARNER'
    or a.approved_at>clock_timestamp() or a.expires_at<=clock_timestamp()
    or exists(select 1 from public.writing_context_approval_revocations v
      where v.provider_approval_id=a.id)
    or not exists(select 1 from public.children ch where ch.id=s.child_id
      and ch.parent_user_id=s.parent_user_id and ch.is_archived=false)
    or not exists(select 1 from public.task_submissions t
      join public.course_tasks k on k.id=t.task_id
      where t.id=s.submission_id and t.parent_user_id=s.parent_user_id
        and t.child_id=s.child_id and t.parent_review_status='pending'
        and k.task_type='lesson' and k.parent_user_id=s.parent_user_id
        and not exists(select 1 from public.task_submissions newer
          where newer.task_id=t.task_id and newer.child_id=t.child_id
            and newer.submitted_at>t.submitted_at))
    or exists(select 1 from public.course_context_replay_grants g where g.snapshot_id=s.id)
    or exists(select 1 from public.writing_context_shadow_dispatches d where d.job_id=j.id)
    or exists(select 1 from public.writing_context_ai_attempts t where t.snapshot_id=s.id)
    or not exists(select 1 from public.writing_context_learner_authorisations l
      where l.child_id=s.child_id and l.parent_user_id=s.parent_user_id
        and l.policy_version=p.learner_policy_version and l.authorisation_kind='ADULT_SUBMISSION'
        and l.approved_by=s.parent_user_id and l.expires_at>clock_timestamp()
        and not exists(select 1 from public.writing_context_approval_revocations v
          where v.learner_authorisation_id=l.id))
    then raise exception 'course_held_replay_ineligible'; end if;
  insert into public.course_context_replay_grants(snapshot_id,source_hash,approved_by,evidence_ref,expires_at)
    values(s.id,p_source_hash,p_approved_by,p_evidence_ref,p_expires_at)
    returning id into v_grant_id;
  return v_grant_id;
end $$;

revoke all on function public.grant_held_course_context_replay(
  uuid,uuid,text,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.grant_held_course_context_replay(
  uuid,uuid,text,uuid,uuid,text,timestamptz) to service_role;
