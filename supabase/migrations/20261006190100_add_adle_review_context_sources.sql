-- ADLE Review context sources are independent of course task submissions.
-- This migration captures final writing atomically; it does not activate a provider.
create table public.adle_review_context_sources (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null unique references public.adle_review_sessions(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  submitted_text text not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  submitted_at timestamptz not null,
  capture_mode text not null check (capture_mode in ('shadow','disabled','replay')),
  capture_policy_revision_id uuid references public.writing_context_shadow_policy_history(id),
  created_at timestamptz not null default clock_timestamp(),
  constraint adle_review_context_source_hash_valid check
    (source_hash = encode(extensions.digest(convert_to(submitted_text,'UTF8'),'sha256'),'hex'))
);
create index adle_review_context_sources_child on public.adle_review_context_sources(child_id,submitted_at);
alter table public.adle_review_context_sources enable row level security;
revoke all on public.adle_review_context_sources from public,anon,authenticated;
grant select on public.adle_review_context_sources to service_role;
create trigger adle_review_context_source_immutable before update or delete
  on public.adle_review_context_sources for each row execute function public.reject_writing_fact_update();

create table public.adle_review_context_replay_grants (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.adle_review_context_sources(id) on delete restrict,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  grant_kind text not null check (grant_kind='CURRENT_REVIEW_WORK'),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default clock_timestamp(),
  evidence_ref text not null,
  expires_at timestamptz not null,
  check (expires_at>approved_at)
);
alter table public.adle_review_context_replay_grants enable row level security;
revoke all on public.adle_review_context_replay_grants from public,anon,authenticated;
grant select,insert on public.adle_review_context_replay_grants to service_role;
create trigger adle_review_context_replay_grant_immutable before update or delete
  on public.adle_review_context_replay_grants for each row execute function public.reject_writing_fact_update();

create table public.adle_review_context_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.adle_review_context_sources(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','processing','deferred','complete','failed')),
  next_eligible_at timestamptz,
  claim_token uuid,
  claimed_at timestamptz,
  claim_count integer not null default 0,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default clock_timestamp()
);
create index adle_review_context_jobs_ready on public.adle_review_context_jobs(status,next_eligible_at,created_at);
alter table public.adle_review_context_jobs enable row level security;
revoke all on public.adle_review_context_jobs from public,anon,authenticated;
grant select on public.adle_review_context_jobs to service_role;

-- This is an AFTER UPDATE trigger on the R3 transaction. A rollback removes
-- both the Review outcome and the immutable context source/job.
create function public.capture_adle_review_context_source() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.writing_context_advisory_control%rowtype;
  p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype;
  v_source_id uuid; v_mode text;
begin
  if old.submitted_writing_text is not null or new.submitted_writing_text is null then return new; end if;
  select * into c from public.writing_context_advisory_control where singleton;
  select * into p from public.writing_context_shadow_policy where singleton;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  v_mode:=case when c.enabled=false and c.ai_mode='shadow'
    and p.dispatch_scope='REAL_LEARNER' and p.execution_policy_kind='ADULT_RELEASE'
    and p.revision_id is not null and not public.context_provider_proof_child(new.child_id)
    and a.id is not null and a.dispatch_scope='REAL_LEARNER'
    and a.runtime_fingerprint='34a747a5843f1aa2d8ddd2251ccd853b1d61bd8c5f175b955b00208421876481'
    and a.retention_mode='STANDARD_API' and not a.zdr_verified and a.data_sharing_disabled
    and a.expires_at>clock_timestamp()
    and not exists(select 1 from public.writing_context_approval_revocations r where r.provider_approval_id=a.id)
    and not exists(select 1 from public.writing_context_approval_revocations r
      join public.writing_context_learner_authorisations l on l.id=r.learner_authorisation_id
      where l.child_id=new.child_id and l.parent_user_id=new.parent_user_id
        and l.policy_version=p.learner_policy_version)
    then 'shadow' else 'disabled' end;
  insert into public.adle_review_context_sources(review_session_id,child_id,parent_user_id,
    submitted_text,source_hash,submitted_at,capture_mode,capture_policy_revision_id)
  values(new.id,new.child_id,new.parent_user_id,new.submitted_writing_text,
    encode(extensions.digest(convert_to(new.submitted_writing_text,'UTF8'),'sha256'),'hex'),
    new.writing_submitted_at,v_mode,case when v_mode='shadow' then p.revision_id else null end)
  returning id into v_source_id;
  if v_mode='shadow' then
    if not exists(select 1 from public.writing_context_learner_authorisations l
      where l.child_id=new.child_id and l.parent_user_id=new.parent_user_id
        and l.policy_version=p.learner_policy_version and l.authorisation_kind='ADULT_SUBMISSION'
        and l.expires_at>clock_timestamp()) then
      insert into public.writing_context_learner_authorisations(child_id,parent_user_id,policy_version,
        evidence_ref,approved_by,approved_at,expires_at,authorisation_kind)
      values(new.child_id,new.parent_user_id,p.learner_policy_version,
        'adult-writing/adle-review-submission-v1',new.parent_user_id,new.writing_submitted_at,
        a.expires_at,'ADULT_SUBMISSION');
    end if;
    insert into public.adle_review_context_jobs(source_id) values(v_source_id);
  end if;
  return new;
end $$;
create trigger zz_capture_adle_review_context_source after update of submitted_writing_text
  on public.adle_review_sessions for each row execute function public.capture_adle_review_context_source();
revoke all on function public.capture_adle_review_context_source() from public,anon,authenticated;

create table public.adle_review_context_dispatches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.adle_review_context_jobs(id) on delete restrict,
  window_fingerprint text not null check (window_fingerprint ~ '^[a-f0-9]{64}$'),
  request_bytes integer not null check (request_bytes between 1 and 16000),
  provider_approval_id uuid not null references public.writing_context_provider_approvals(id),
  learner_authorisation_id uuid not null references public.writing_context_learner_authorisations(id),
  policy_revision_id uuid not null references public.writing_context_shadow_policy_history(id),
  rate_card_version text not null,
  budget_environment text not null,
  budget_day date not null,
  reserved_cost_usd numeric(14,8) not null,
  state text not null default 'reserved' check(state in ('reserved','sent','finished','abandoned','cancelled')),
  reserved_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  finished_at timestamptz,
  unique(job_id,window_fingerprint)
);
create index adle_review_context_dispatches_budget on public.adle_review_context_dispatches(reserved_at,state);
alter table public.adle_review_context_dispatches enable row level security;
revoke all on public.adle_review_context_dispatches from public,anon,authenticated;
grant select on public.adle_review_context_dispatches to service_role;

create table public.adle_review_context_attempts (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null unique references public.adle_review_context_dispatches(id) on delete restrict,
  source_id uuid not null references public.adle_review_context_sources(id) on delete restrict,
  window_fingerprint text not null,
  result_status text not null check(result_status in ('SCANNED','NOT_ASSESSED')),
  reason_code text not null,
  provider_request_id text,
  provider_response_id text,
  returned_model text,
  input_tokens integer,
  output_tokens integer,
  calculated_cost_usd numeric(14,8),
  response_received_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp()
);
alter table public.adle_review_context_attempts enable row level security;
revoke all on public.adle_review_context_attempts from public,anon,authenticated;
grant select,insert on public.adle_review_context_attempts to service_role;
create trigger adle_review_context_attempt_immutable before update or delete on public.adle_review_context_attempts
  for each row execute function public.reject_writing_fact_update();

create table public.adle_review_context_findings (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.adle_review_context_attempts(id) on delete restrict,
  source_id uuid not null references public.adle_review_context_sources(id) on delete restrict,
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  prefix_text text not null,
  start_utf16 integer not null,
  end_utf16 integer not null,
  observed_text text not null,
  correction text not null,
  created_at timestamptz not null default clock_timestamp(),
  check(start_utf16>=0 and end_utf16>start_utf16),
  unique(source_id,start_utf16,end_utf16,correction)
);
alter table public.adle_review_context_findings enable row level security;
revoke all on public.adle_review_context_findings from public,anon,authenticated;
grant select,insert on public.adle_review_context_findings to service_role;
create trigger adle_review_context_finding_immutable before update or delete on public.adle_review_context_findings
  for each row execute function public.reject_writing_fact_update();

create function public.context_utf16_length(p_text text) returns integer
language plpgsql immutable strict set search_path=public,pg_temp as $$
declare i integer; n integer:=0;
begin
  for i in 1..char_length(p_text) loop
    n:=n+case when ascii(substr(p_text,i,1))>65535 then 2 else 1 end;
  end loop;
  return n;
end $$;
