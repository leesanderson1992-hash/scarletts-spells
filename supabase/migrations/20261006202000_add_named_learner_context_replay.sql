-- Exact, immutable grants for current Review Work of the named learner only.
create table public.course_context_replay_grants (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null unique references public.writing_source_snapshots(id) on delete restrict,
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  approved_by uuid not null references auth.users(id),
  evidence_ref text not null,
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check(expires_at>approved_at)
);
alter table public.course_context_replay_grants enable row level security;
revoke all on public.course_context_replay_grants from public,anon,authenticated;
grant select on public.course_context_replay_grants to service_role;
create trigger course_context_replay_grant_immutable before update or delete
  on public.course_context_replay_grants for each row execute function public.reject_writing_fact_update();

create function public.course_context_replay_authorised(p_snapshot_id uuid) returns boolean
language sql volatile security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.course_context_replay_grants g
    join public.writing_source_snapshots s on s.id=g.snapshot_id
    join public.task_submissions t on t.id=s.submission_id
    join public.course_tasks k on k.id=t.task_id
    where s.id=p_snapshot_id and s.child_id='e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
      and g.source_hash=encode(extensions.digest(convert_to(s.envelope::text,'UTF8'),'sha256'),'hex')
      and g.expires_at>clock_timestamp() and s.source_purpose='REAL_LEARNER'
      and t.parent_review_status='pending' and t.child_id=s.child_id
      and t.parent_user_id=s.parent_user_id and k.task_type='lesson'
      and not exists(select 1 from public.task_submissions newer
        where newer.task_id=t.task_id and newer.child_id=t.child_id
          and newer.submitted_at>t.submitted_at));
$$;

create function public.grant_course_context_replay(
  p_snapshot_id uuid,p_source_hash text,p_approved_by uuid,p_evidence_ref text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.writing_source_snapshots%rowtype; v_id uuid;
  p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype;
begin
  select * into s from public.writing_source_snapshots where id=p_snapshot_id for update;
  select * into p from public.writing_context_shadow_policy where singleton;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  if s.id is null or s.child_id<>'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
    or s.source_purpose<>'REAL_LEARNER'
    or p_source_hash<>encode(extensions.digest(convert_to(s.envelope::text,'UTF8'),'sha256'),'hex')
    or p_expires_at<=clock_timestamp() or nullif(btrim(p_evidence_ref),'') is null
    or p.execution_policy_kind<>'ADULT_RELEASE' or p.dispatch_scope<>'REAL_LEARNER'
    or a.id is null or a.expires_at<=clock_timestamp() or a.approved_at>clock_timestamp()
    or not exists(select 1 from public.task_submissions t
      join public.course_tasks k on k.id=t.task_id and k.task_type='lesson'
      where t.id=s.submission_id and t.child_id=s.child_id and t.parent_user_id=s.parent_user_id
        and t.parent_review_status='pending'
        and not exists(select 1 from public.task_submissions newer
          where newer.task_id=t.task_id and newer.child_id=t.child_id
            and newer.submitted_at>t.submitted_at))
    or exists(select 1 from public.writing_context_ai_attempts a where a.snapshot_id=s.id)
    or exists(select 1 from public.writing_context_shadow_jobs j where j.snapshot_id=s.id)
    then raise exception 'course_context_replay_source_ineligible'; end if;
  insert into public.course_context_replay_grants(snapshot_id,source_hash,approved_by,evidence_ref,expires_at)
    values(s.id,p_source_hash,p_approved_by,p_evidence_ref,p_expires_at);
  if not exists(select 1 from public.writing_context_learner_authorisations l
    where l.child_id=s.child_id and l.parent_user_id=s.parent_user_id
      and l.policy_version=p.learner_policy_version and l.authorisation_kind='ADULT_SUBMISSION'
      and l.expires_at>clock_timestamp()) then
    insert into public.writing_context_learner_authorisations(child_id,parent_user_id,
      policy_version,evidence_ref,approved_by,approved_at,expires_at,authorisation_kind)
      values(s.child_id,s.parent_user_id,p.learner_policy_version,
        'adult-writing/current-review-replay-v1',s.parent_user_id,clock_timestamp(),
        a.expires_at,'ADULT_SUBMISSION');
  end if;
  insert into public.writing_context_shadow_jobs(snapshot_id,run_key)
    values(s.id,'replay:'||gen_random_uuid()::text) returning id into v_id;
  return v_id;
end $$;

create function public.grant_adle_review_context_replay(
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
    or r.writing_submitted_at is null or r.completed_at is null
    or p_source_hash<>encode(extensions.digest(convert_to(r.submitted_writing_text,'UTF8'),'sha256'),'hex')
    or p_expires_at<=clock_timestamp() or nullif(btrim(p_evidence_ref),'') is null
    or p.execution_policy_kind<>'ADULT_RELEASE' or p.dispatch_scope<>'REAL_LEARNER'
    or a.id is null or a.expires_at<=clock_timestamp() or a.approved_at>clock_timestamp()
    or exists(select 1 from public.adle_review_parent_reviews p where p.review_session_id=r.id)
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
revoke all on function public.course_context_replay_authorised(uuid),
  public.grant_course_context_replay(uuid,text,uuid,text,timestamptz),
  public.grant_adle_review_context_replay(uuid,text,uuid,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.course_context_replay_authorised(uuid),
  public.grant_course_context_replay(uuid,text,uuid,text,timestamptz),
  public.grant_adle_review_context_replay(uuid,text,uuid,text,timestamptz)
  to service_role;
