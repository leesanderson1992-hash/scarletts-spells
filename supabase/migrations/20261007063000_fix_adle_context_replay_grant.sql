-- Repair PL/pgSQL policy variable shadowing and verify current Review Work ownership.
create or replace function public.grant_adle_review_context_replay(
  p_review_session_id uuid,p_source_hash text,p_approved_by uuid,p_evidence_ref text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.adle_review_sessions%rowtype; s public.adle_review_context_sources%rowtype;
  p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype;
  v_id uuid;
begin
  select * into r from public.adle_review_sessions where id=p_review_session_id for update;
  select * into p from public.writing_context_shadow_policy where singleton;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  if r.id is null or r.child_id<>'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
    or r.submitted_writing_text is null or r.writing_started_at is null
    or r.writing_submitted_at is null or r.completed_at is null or r.stage<>'completed'
    or not exists(select 1 from public.children ch where ch.id=r.child_id
      and ch.parent_user_id=r.parent_user_id and ch.is_archived=false)
    or not exists(select 1 from public.daily_assignments da where da.id=r.daily_assignment_id
      and da.child_id=r.child_id and da.parent_user_id=r.parent_user_id
      and da.compiled_review_snapshot#>>'{provenance,sourceFingerprint}'=r.snapshot_fingerprint)
    or p_source_hash<>encode(extensions.digest(convert_to(r.submitted_writing_text,'UTF8'),'sha256'),'hex')
    or p_expires_at<=clock_timestamp() or nullif(btrim(p_evidence_ref),'') is null
    or p.execution_policy_kind<>'ADULT_RELEASE' or p.dispatch_scope<>'REAL_LEARNER'
    or a.id is null or a.expires_at<=clock_timestamp() or a.approved_at>clock_timestamp()
    or exists(select 1 from public.adle_review_parent_reviews pr where pr.review_session_id=r.id)
    then raise exception 'adle_context_replay_source_ineligible'; end if;
  select * into s from public.adle_review_context_sources where review_session_id=r.id;
  if s.id is null then
    insert into public.adle_review_context_sources(review_session_id,child_id,parent_user_id,
      submitted_text,source_hash,submitted_at,capture_mode)
      values(r.id,r.child_id,r.parent_user_id,r.submitted_writing_text,p_source_hash,
        r.writing_submitted_at,'replay') returning * into s;
  end if;
  if s.source_hash<>p_source_hash or s.child_id<>r.child_id or s.parent_user_id<>r.parent_user_id
    or exists(select 1 from public.adle_review_context_jobs j where j.source_id=s.id)
    then raise exception 'adle_context_replay_already_scanned'; end if;
  insert into public.adle_review_context_replay_grants(source_id,source_hash,grant_kind,
    approved_by,evidence_ref,expires_at)
    values(s.id,p_source_hash,'CURRENT_REVIEW_WORK',p_approved_by,p_evidence_ref,p_expires_at);
  if not exists(select 1 from public.writing_context_learner_authorisations l
    where l.child_id=r.child_id and l.parent_user_id=r.parent_user_id
      and l.policy_version=p.learner_policy_version and l.authorisation_kind='ADULT_SUBMISSION'
      and l.expires_at>clock_timestamp()) then
    insert into public.writing_context_learner_authorisations(child_id,parent_user_id,
      policy_version,evidence_ref,approved_by,approved_at,expires_at,authorisation_kind)
      values(r.child_id,r.parent_user_id,p.learner_policy_version,
        'adult-writing/current-review-replay-v1',r.parent_user_id,clock_timestamp(),
        a.expires_at,'ADULT_SUBMISSION');
  end if;
  insert into public.adle_review_context_jobs(source_id) values(s.id) returning id into v_id;
  return v_id;
end $$;
