-- Permit an exact, unsent ADLE Review job to resume after a recorded
-- configuration stop. This adds a replay grant to the existing job; it does
-- not enqueue another job or erase any prior provenance.
create function public.grant_held_adle_review_context_replay(
  p_job_id uuid, p_review_session_id uuid, p_source_hash text, p_stop_id uuid,
  p_approved_by uuid, p_evidence_ref text, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  j public.adle_review_context_jobs%rowtype;
  s public.adle_review_context_sources%rowtype;
  r public.adle_review_sessions%rowtype;
  ctl public.writing_context_advisory_control%rowtype;
  p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype;
  stop public.writing_context_shadow_stops%rowtype;
  v_grant_id uuid;
begin
  select * into j from public.adle_review_context_jobs where id=p_job_id for update;
  select * into s from public.adle_review_context_sources where id=j.source_id;
  select * into r from public.adle_review_sessions where id=s.review_session_id for update;
  select * into ctl from public.writing_context_advisory_control where singleton;
  select * into p from public.writing_context_shadow_policy where singleton;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  select * into stop from public.writing_context_shadow_stops where id=p_stop_id;
  if j.id is null or j.status<>'pending' or j.claim_count<>0 or j.claim_token is not null
    or j.claimed_at is not null or j.completed_at is not null or j.error_code is not null
    or s.id is null or s.capture_mode<>'shadow'
    or s.review_session_id is distinct from p_review_session_id
    or s.child_id is distinct from 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
    or r.id is null or r.stage<>'completed' or r.completed_at is null
    or r.submitted_writing_text is null or r.writing_started_at is null
    or r.writing_submitted_at is null
    or s.child_id is distinct from r.child_id or s.parent_user_id is distinct from r.parent_user_id
    or s.submitted_at is distinct from r.writing_submitted_at
    or s.submitted_text is distinct from r.submitted_writing_text
    or s.source_hash is distinct from p_source_hash
    or p_source_hash is distinct from encode(extensions.digest(convert_to(r.submitted_writing_text,'UTF8'),'sha256'),'hex')
    or p_approved_by is distinct from r.parent_user_id
    or nullif(btrim(p_evidence_ref),'') is null
    or p_expires_at is null or p_expires_at<=clock_timestamp()
    or p_expires_at>clock_timestamp()+interval '24 hours'
    or ctl.singleton is null or ctl.enabled or ctl.ai_mode<>'disabled'
    or stop.id is null or stop.code<>'AI_CONFIGURATION_STOP'
    or stop.created_at<=j.created_at or ctl.updated_at>stop.created_at
    or p.singleton is null or p.execution_policy_kind<>'ADULT_RELEASE'
    or p.dispatch_scope<>'REAL_LEARNER' or p.revision_id is null
    or a.id is null or a.environment<>'production' or a.dispatch_scope<>'REAL_LEARNER'
    or a.approved_at>clock_timestamp() or a.expires_at<=clock_timestamp()
    or exists(select 1 from public.writing_context_approval_revocations v
      where v.provider_approval_id=a.id)
    or public.context_provider_proof_child(s.child_id)
    or not exists(select 1 from public.children ch where ch.id=r.child_id
      and ch.parent_user_id=r.parent_user_id and ch.is_archived=false)
    or not exists(select 1 from public.daily_assignments da where da.id=r.daily_assignment_id
      and da.child_id=r.child_id and da.parent_user_id=r.parent_user_id
      and da.compiled_review_snapshot#>>'{provenance,sourceFingerprint}'=r.snapshot_fingerprint)
    or exists(select 1 from public.adle_review_parent_reviews pr where pr.review_session_id=r.id)
    or exists(select 1 from public.adle_review_context_replay_grants g where g.source_id=s.id)
    or exists(select 1 from public.adle_review_context_dispatches d where d.job_id=j.id)
    or exists(select 1 from public.adle_review_context_attempts t where t.source_id=s.id)
    or exists(select 1 from public.adle_review_context_findings f where f.source_id=s.id)
    or not exists(select 1 from public.writing_context_learner_authorisations l
      where l.child_id=s.child_id and l.parent_user_id=s.parent_user_id
        and l.policy_version=p.learner_policy_version and l.authorisation_kind='ADULT_SUBMISSION'
        and l.approved_by=s.parent_user_id and l.expires_at>clock_timestamp()
        and not exists(select 1 from public.writing_context_approval_revocations v
          where v.learner_authorisation_id=l.id))
    then raise exception 'adle_held_replay_ineligible'; end if;
  insert into public.adle_review_context_replay_grants(source_id,source_hash,grant_kind,
    approved_by,evidence_ref,expires_at)
    values(s.id,p_source_hash,'CURRENT_REVIEW_WORK',p_approved_by,p_evidence_ref,p_expires_at)
    returning id into v_grant_id;
  return v_grant_id;
end $$;

revoke all on function public.grant_held_adle_review_context_replay(
  uuid,uuid,text,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.grant_held_adle_review_context_replay(
  uuid,uuid,text,uuid,uuid,text,timestamptz) to service_role;
