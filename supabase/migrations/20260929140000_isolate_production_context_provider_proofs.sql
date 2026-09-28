-- Production-only disposable provider proofs. No fixture, approval, pricing or activation seed.
begin;
create table public.writing_context_provider_proof_learners (
  child_id uuid primary key references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null unique references public.course_tasks(id) on delete restrict,
  purpose text not null default 'DISPOSABLE_PROVIDER_PROOF' check(purpose='DISPOSABLE_PROVIDER_PROOF'),
  approved_by uuid not null references auth.users(id),
  evidence_ref text not null check(evidence_ref ~ '^[A-Za-z0-9_./:-]{1,200}$'),
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check(expires_at>approved_at),
  check(approved_by=parent_user_id)
);
-- Classification survives expiry/revocation. It disappears only with the disposable learner.
alter table public.writing_context_provider_proof_learners enable row level security;
revoke all on public.writing_context_provider_proof_learners from public,anon,authenticated;
grant select,insert on public.writing_context_provider_proof_learners to service_role;
create trigger context_proof_registration_immutable before update on public.writing_context_provider_proof_learners
  for each row execute function public.reject_writing_fact_update();
create function public.assert_context_proof_registration() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare t record; used boolean; begin
  -- Serialize registration against normal source/submission creation. Never relabel existing writing.
  perform 1 from public.children where id=new.child_id for update;
  if not exists(select 1 from public.children where id=new.child_id and parent_user_id=new.parent_user_id)
    or not exists(select 1 from public.course_tasks where id=new.task_id and parent_user_id=new.parent_user_id and task_type in ('lesson','test'))
    or exists(select 1 from public.task_submissions where child_id=new.child_id or task_id=new.task_id)
    or new.approved_at>clock_timestamp()
    then raise exception 'AI_PROOF_REGISTRATION_INVALID'; end if;
  for t in select c.relname,a.attname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and not a.attisdropped and a.attname in ('child_id','learner_id')
    where n.nspname='public' and exists(select 1 from pg_trigger g where g.tgrelid=c.oid and g.tgname='context_proof_educational_guard') loop
    execute format('select exists(select 1 from public.%I where %I=$1)',t.relname,t.attname) into used using new.child_id;
    if used then raise exception 'AI_PROOF_EXISTING_EDUCATION_DENIED'; end if;
  end loop;
  return new;
end $$;
create trigger context_proof_registration before insert on public.writing_context_provider_proof_learners
  for each row execute function public.assert_context_proof_registration();
alter table public.writing_source_snapshots add column source_purpose text not null default 'REAL_LEARNER'
  check(source_purpose in ('REAL_LEARNER','DISPOSABLE_PROVIDER_PROOF'));
create trigger context_source_purpose_immutable before update of source_purpose on public.writing_source_snapshots
  for each row execute function public.reject_writing_fact_update();
alter table public.writing_context_learner_authorisations add column authorisation_kind text not null default 'GUARDIAN'
  check(authorisation_kind in ('GUARDIAN','OPERATOR_PROOF'));
alter table public.writing_context_provider_approvals add column dispatch_scope text not null default 'DENY'
  check(dispatch_scope in ('DENY','REAL_LEARNER','DISPOSABLE_PROVIDER_PROOF'));
alter table public.writing_context_shadow_policy add column dispatch_scope text not null default 'DENY'
  check(dispatch_scope in ('DENY','REAL_LEARNER','DISPOSABLE_PROVIDER_PROOF'));

create function public.context_provider_proof_child(p_child uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.writing_context_provider_proof_learners where child_id=p_child);
$$;
create function public.stamp_context_source_purpose() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  perform 1 from public.children where id=new.child_id for update;
  new.source_purpose:=case when public.context_provider_proof_child(new.child_id)
    then 'DISPOSABLE_PROVIDER_PROOF' else 'REAL_LEARNER' end;
  -- During proof-only activation ordinary sources cannot acquire AI capture flags.
  if not exists(select 1 from public.writing_context_shadow_policy p
      where p.singleton and p.dispatch_scope=new.source_purpose and p.dispatch_scope<>'DENY') then
    new.envelope:=new.envelope || jsonb_build_object('contextAiShadowCapture',false,'contextAiModeAtCapture','disabled');
  end if;
  return new;
end $$;
create trigger context_source_purpose before insert on public.writing_source_snapshots
  for each row execute function public.stamp_context_source_purpose();
-- Lock child registration boundary for ordinary submission inserts as well.
create function public.lock_context_submission_child() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  perform 1 from public.children where id=new.child_id for update;
  if exists(select 1 from public.writing_context_provider_proof_learners f
    where f.task_id=new.task_id and (f.child_id<>new.child_id or f.parent_user_id<>new.parent_user_id)) then
    raise exception 'AI_PROOF_TASK_OWNERSHIP_DENIED'; end if;
  return new;
end $$;
create trigger context_submission_child before insert or update of child_id,task_id,parent_user_id on public.task_submissions
  for each row execute function public.lock_context_submission_child();

create function public.context_shadow_source_in_scope(p_snapshot uuid,p_scope text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.writing_source_snapshots s
    where s.id=p_snapshot and s.source_purpose=p_scope and p_scope in ('REAL_LEARNER','DISPOSABLE_PROVIDER_PROOF'));
$$;
create function public.context_shadow_scope_authorised(p_snapshot uuid,p_authorisation uuid default null) returns boolean
language sql volatile security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.writing_source_snapshots s
    join public.writing_context_shadow_policy p on p.singleton and p.dispatch_scope=s.source_purpose
    join public.writing_context_provider_approvals a on a.id=p.provider_approval_id
      and a.environment='production' and a.dispatch_scope=p.dispatch_scope
    join public.writing_context_learner_authorisations l on l.child_id=s.child_id and l.parent_user_id=s.parent_user_id
      and l.policy_version=p.learner_policy_version and l.approved_at<=s.occurred_at and l.expires_at>clock_timestamp()
      and (p_authorisation is null or l.id=p_authorisation)
    where s.id=p_snapshot and p.dispatch_scope<>'DENY'
      and not exists(select 1 from public.writing_context_approval_revocations r where r.learner_authorisation_id=l.id)
      and ((s.source_purpose='REAL_LEARNER' and l.authorisation_kind='GUARDIAN'
          and not public.context_provider_proof_child(s.child_id))
        or (s.source_purpose='DISPOSABLE_PROVIDER_PROOF' and l.authorisation_kind='OPERATOR_PROOF'
          and l.approved_by=s.parent_user_id and exists(select 1 from public.writing_context_provider_proof_learners f
            where f.child_id=s.child_id and f.parent_user_id=s.parent_user_id and f.task_id=s.task_id
              and f.approved_at<=s.occurred_at and f.expires_at>clock_timestamp()))));
$$;

-- Reject writes at canonical educational authorities, independently of application entry points.
create function public.reject_context_proof_educational_write() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb:=to_jsonb(new); v_child uuid; v_occurrence text; begin
  v_child:=coalesce((r->>'child_id')::uuid,(r->>'learner_id')::uuid);
  v_occurrence:=coalesce(r->>'occurrence_id',r->>'source_writing_occurrence_id');
  if v_child is null and v_occurrence is not null then
    select s.child_id into v_child from public.writing_occurrences o
      join public.writing_source_snapshots s on s.id=o.snapshot_id where o.id=v_occurrence;
  end if;
  if v_child is null and r->>'snapshot_id' is not null then
    select child_id into v_child from public.writing_source_snapshots where id=(r->>'snapshot_id')::uuid;
  end if;
  if v_child is null and r->>'learning_item_id' is not null then
    select child_id into v_child from public.learning_items where id=(r->>'learning_item_id')::uuid;
  end if;
  -- Registration and educational writes must not race past each other.
  perform 1 from public.children where id=v_child for update;
  if public.context_provider_proof_child(v_child) then raise exception 'AI_PROOF_EDUCATIONAL_WRITE_DENIED'; end if;
  return new;
end $$;
do $$ declare t record; begin
  -- Resolve the repository's existing authorities; the hosted verifier checks installed coverage.
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and
      (c.relname like 'adle_%' or c.relname like 'learning_item%' or c.relname like 'child_word_treasure%'
       or c.relname in ('writing_issues','writing_samples','misspelling_instances','word_progress',
         'child_gold_coin_ledger_events','spelling_reward_events','spelling_reward_states',
         'writing_context_advisory_observations','writing_context_parent_decisions','writing_context_parent_added_cases',
         'writing_context_learning_handoffs','writing_shadow_projection_batches','writing_shadow_skill_evidence_projections'))
      and exists(select 1 from pg_attribute at where at.attrelid=c.oid and not at.attisdropped
        and at.attname in ('child_id','learner_id','occurrence_id','snapshot_id','learning_item_id')) loop
    execute format('create trigger context_proof_educational_guard before insert or update on public.%I for each row execute function public.reject_context_proof_educational_write()',t.relname);
  end loop;
end $$;
-- Proof feedback/parent decisions and diagnostic promotions are never generated; research is additionally denied.
create function public.reject_context_proof_research() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_occurrence text; begin
  select occurrence_id into v_occurrence from public.writing_context_parent_decisions where id=new.parent_decision_id;
  if v_occurrence is null then select occurrence_id into v_occurrence from public.writing_context_parent_added_cases where id=new.parent_added_case_id; end if;
  if exists(select 1 from public.writing_occurrences o join public.writing_source_snapshots s on s.id=o.snapshot_id
    where o.id=v_occurrence and s.source_purpose='DISPOSABLE_PROVIDER_PROOF') then
    raise exception 'AI_PROOF_RESEARCH_DENIED'; end if;
  return new;
end $$;
create trigger context_proof_research before insert or update on public.writing_context_research_candidates
  for each row execute function public.reject_context_proof_research();


create or replace function public.enqueue_writing_context_shadow(p_submission_id uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; begin
  insert into public.writing_context_shadow_jobs(snapshot_id,run_key)
  select s.id,j.id::text from public.writing_source_snapshots s
  join public.task_submission_processing_jobs j on j.submission_id=s.submission_id
  join public.task_submissions t on t.id=s.submission_id
  join public.writing_context_advisory_control c on c.singleton
  where s.submission_id=p_submission_id and c.enabled=false and c.ai_mode='shadow'
    and s.occurred_at>=c.updated_at and t.parent_review_status='pending'
    and s.envelope->>'contextAiModeAtCapture'='shadow'
    and s.envelope->>'contextAiShadowCapture'='true'
    and s.envelope->>'contextAdvisoryCapture'='false'
    and public.context_shadow_scope_authorised(s.id)
    and s.parent_user_id=t.parent_user_id and s.child_id=t.child_id
  on conflict(snapshot_id) do nothing returning id into v_id;
  return v_id;
end $$;

create or replace function public.context_shadow_job_eligible(p_job_id uuid,p_claim_token uuid,p_environment text,p_project_ref text,
  p_deployment_sha text,p_config_fingerprint text,p_runtime_fingerprint text,p_rate_card_fingerprint text)
returns boolean language sql security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.writing_context_shadow_jobs j
    join public.writing_source_snapshots s on s.id=j.snapshot_id
    join public.task_submissions t on t.id=s.submission_id join public.course_tasks k on k.id=t.task_id
    join public.children ch on ch.id=s.child_id and ch.parent_user_id=s.parent_user_id
    join public.writing_context_advisory_control ctl on ctl.singleton
    join public.writing_context_shadow_policy p on p.singleton
    join public.writing_context_provider_approvals a on a.id=p.provider_approval_id
    join public.writing_context_ai_rate_cards c on c.version=p.rate_card_version
    where j.id=p_job_id and j.claim_token=p_claim_token and j.status='processing'
      and public.context_shadow_scope_authorised(s.id)
      and not ctl.enabled and ctl.ai_mode='shadow' and s.occurred_at>=ctl.updated_at and s.occurred_at>=a.approved_at
      and s.envelope->>'contextAiModeAtCapture'='shadow' and s.envelope->>'contextAiShadowCapture'='true'
      and s.envelope->>'contextAdvisoryCapture'='false' and t.parent_review_status='pending'
      and t.parent_user_id=s.parent_user_id and t.child_id=s.child_id and k.parent_user_id=s.parent_user_id and k.task_type in ('lesson','test')
      and not exists(select 1 from public.task_submissions newer where newer.task_id=t.task_id and newer.child_id=t.child_id and newer.submitted_at>t.submitted_at)
      and a.environment=p_environment and a.project_ref=p_project_ref and a.deployment_sha=p_deployment_sha
      and a.config_fingerprint=p_config_fingerprint and a.runtime_fingerprint=p_runtime_fingerprint
      and a.expires_at>clock_timestamp() and c.fingerprint=p_rate_card_fingerprint and c.effective_at<=clock_timestamp()
      and not exists(select 1 from public.writing_context_approval_revocations r where r.provider_approval_id=a.id)
      and exists(select 1 from public.writing_context_learner_authorisations l where l.child_id=s.child_id and l.parent_user_id=s.parent_user_id
        and l.policy_version=p.learner_policy_version and l.approved_at<=s.occurred_at and l.expires_at>clock_timestamp()
        and not exists(select 1 from public.writing_context_approval_revocations r where r.learner_authorisation_id=l.id)));
$$;

create or replace function public.reserve_writing_context_shadow(p_job_id uuid,p_claim_token uuid,p_occurrence_id text,
  p_detector_run_id uuid,p_window_fingerprint text,p_request_bytes integer,p_environment text,p_project_ref text,
  p_deployment_sha text,p_config_fingerprint text,p_runtime_fingerprint text,p_rate_card_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ctl public.writing_context_advisory_control%rowtype; p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype; s public.writing_source_snapshots%rowtype;
  j public.writing_context_shadow_jobs%rowtype; l uuid; v_id uuid; v_count bigint; v_cost numeric; v_day date; begin
  select * into ctl from public.writing_context_advisory_control where singleton for update;
  if ctl.singleton is null or ctl.enabled or ctl.ai_mode<>'shadow' then return jsonb_build_object('reason','AI_CONTROL_DISABLED'); end if;
  v_day:=(clock_timestamp() at time zone 'UTC')::date;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.provider_approval_id is null or p.rate_card_version is null or p.learner_policy_version is null or p.revision_id is null
    or p.max_requests_per_day is null or p.max_usd_per_day is null or p.max_usd_per_request is null
    or p.evidence_ref is null or p.approved_by is null
    or not (p.thresholds ?& array['window_seconds','minimum_calls','error_rate','timeout_rate','malformed_rate','gate_failure_rate','p95_ms','max_queue_age_seconds'])
    then return jsonb_build_object('reason','AI_POLICY_UNAPPROVED'); end if;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  if a.id is null or a.approved_at>clock_timestamp() or a.expires_at<=clock_timestamp()
    or exists(select 1 from public.writing_context_approval_revocations where provider_approval_id=a.id)
    or a.environment<>p_environment or a.project_ref<>p_project_ref or a.deployment_sha<>p_deployment_sha
    or a.config_fingerprint<>p_config_fingerprint or a.runtime_fingerprint<>p_runtime_fingerprint
    then return jsonb_build_object('reason','AI_PROVIDER_APPROVAL_UNAVAILABLE'); end if;
  if not exists(select 1 from public.writing_context_ai_rate_cards where version=p.rate_card_version
    and fingerprint=p_rate_card_fingerprint and effective_at<=clock_timestamp())
    then return jsonb_build_object('reason','AI_RATE_CARD_MISMATCH'); end if;
  select * into j from public.writing_context_shadow_jobs where id=p_job_id and claim_token=p_claim_token
    and status='processing' and claimed_at>clock_timestamp()-interval '60 seconds' for update;
  select * into s from public.writing_source_snapshots where id=j.snapshot_id;
  if j.id is null or s.id is null or s.occurred_at<ctl.updated_at or s.occurred_at<a.approved_at
    or s.envelope->>'contextAiModeAtCapture' is distinct from 'shadow'
    or s.envelope->>'contextAiShadowCapture' is distinct from 'true'
    or s.envelope->>'contextAdvisoryCapture' is distinct from 'false'
    or not exists(select 1 from public.task_submissions t join public.course_tasks k on k.id=t.task_id
      where t.id=s.submission_id and t.parent_user_id=s.parent_user_id and t.child_id=s.child_id
      and t.parent_review_status='pending' and k.task_type in ('lesson','test') and k.parent_user_id=s.parent_user_id
      and not exists(select 1 from public.task_submissions newer where newer.task_id=t.task_id
        and newer.child_id=t.child_id and newer.submitted_at>t.submitted_at))
    then return jsonb_build_object('reason','AI_SOURCE_INELIGIBLE'); end if;
  select x.id into l from public.writing_context_learner_authorisations x
    join public.children ch on ch.id=x.child_id and ch.parent_user_id=x.parent_user_id
    where x.child_id=s.child_id and x.parent_user_id=s.parent_user_id and x.policy_version=p.learner_policy_version
    and x.approved_at<=s.occurred_at and x.expires_at>clock_timestamp()
    and not exists(select 1 from public.writing_context_approval_revocations r where r.learner_authorisation_id=x.id)
    order by x.approved_at desc limit 1;
  if not public.context_shadow_scope_authorised(s.id,l) then return jsonb_build_object('reason','AI_PROOF_SCOPE_DENIED'); end if;
  if l is null then return jsonb_build_object('reason','AI_LEARNER_NOT_AUTHORISED'); end if;
  if not exists(select 1 from public.writing_occurrences o join public.writing_context_detector_members m on m.occurrence_id=o.id
    join public.writing_context_detector_runs r on r.id=m.run_id where o.id=p_occurrence_id and o.snapshot_id=s.id
    and o.provenance='learner_response' and m.run_id=p_detector_run_id and r.snapshot_id=s.id and r.run_key=j.run_key
    and r.detector_version='CONTEXT_ROUTING_FOUR_FAMILY_V1' and r.registry_version='CONTEXT_FOUR_FAMILY_V1'
    and r.run_status='COMPLETE') then return jsonb_build_object('reason','AI_OCCURRENCE_INELIGIBLE'); end if;
  if exists(select 1 from public.writing_context_shadow_dispatches where job_id=j.id and occurrence_id=p_occurrence_id)
    then return jsonb_build_object('reason','AI_ALREADY_RESERVED'); end if;
  if exists(select 1 from public.writing_context_ai_rate_cards c where c.version=p.rate_card_version
    and (p_request_bytes*c.input_rate+2048*c.output_rate)/c.unit_tokens>p.max_usd_per_request)
    then return jsonb_build_object('reason','AI_REQUEST_COST_CAP_TOO_SMALL'); end if;
  select coalesce(sum(requests_reserved),0),coalesce(sum(reserved_usd),0) into v_count,v_cost
    from public.writing_context_shadow_consumption where environment=a.environment and budget_day=v_day;
  if v_count>=p.max_requests_per_day or v_cost+p.max_usd_per_request>p.max_usd_per_day then
    perform public.disable_writing_context_advisory(p.approved_by);
    return jsonb_build_object('reason','AI_GLOBAL_BUDGET_STOP'); end if;
  if (select count(*) from public.writing_context_shadow_dispatches where job_id=j.id)>=32
    then return jsonb_build_object('reason','AI_SUBMISSION_LIMIT'); end if;
  if exists(select 1 from public.writing_context_shadow_dispatches where state in ('reserved','sent')
    and reserved_at>clock_timestamp()-interval '60 seconds') then return jsonb_build_object('reason','AI_GLOBAL_CONCURRENCY_LIMIT'); end if;
  insert into public.writing_context_shadow_consumption(environment,budget_day,policy_revision_id,requests_reserved,reserved_usd,sequence)
    values(a.environment,v_day,p.revision_id,1,p.max_usd_per_request,1)
    on conflict(environment,budget_day,policy_revision_id) do update
    set requests_reserved=writing_context_shadow_consumption.requests_reserved+1,
      reserved_usd=writing_context_shadow_consumption.reserved_usd+excluded.reserved_usd,
      sequence=writing_context_shadow_consumption.sequence+1;
  insert into public.writing_context_shadow_dispatches(job_id,occurrence_id,detector_run_id,provider_approval_id,
    learner_authorisation_id,rate_card_version,window_fingerprint,request_bytes,reserved_cost_usd,policy_revision_id,budget_environment,budget_day)
    values(j.id,p_occurrence_id,p_detector_run_id,a.id,l,p.rate_card_version,p_window_fingerprint,p_request_bytes,p.max_usd_per_request,p.revision_id,a.environment,v_day)
    returning id into v_id;
  return jsonb_build_object('id',v_id,'reason',null);
end $$;

create or replace function public.begin_writing_context_shadow_dispatch(p_dispatch_id uuid,p_claim_token uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare ctl public.writing_context_advisory_control%rowtype; d public.writing_context_shadow_dispatches%rowtype; ok boolean; begin
  select * into ctl from public.writing_context_advisory_control where singleton for update;
  select * into d from public.writing_context_shadow_dispatches where id=p_dispatch_id for update;
  select exists(select 1 from public.writing_context_shadow_jobs j
    join public.writing_source_snapshots s on s.id=j.snapshot_id
    join public.task_submissions t on t.id=s.submission_id
    join public.children ch on ch.id=s.child_id and ch.parent_user_id=s.parent_user_id
    join public.course_tasks k on k.id=t.task_id
    join public.writing_context_provider_approvals a on a.id=d.provider_approval_id
    join public.writing_context_learner_authorisations l on l.id=d.learner_authorisation_id
    join public.writing_context_shadow_policy p on p.singleton
    where j.id=d.job_id and j.claim_token=p_claim_token and j.status='processing'
      and j.claimed_at>clock_timestamp()-interval '60 seconds' and t.parent_review_status='pending'
      and t.parent_user_id=s.parent_user_id and t.child_id=s.child_id and k.parent_user_id=s.parent_user_id
      and k.task_type in ('lesson','test') and not exists(select 1 from public.task_submissions newer
        where newer.task_id=t.task_id and newer.child_id=t.child_id and newer.submitted_at>t.submitted_at)
      and public.context_shadow_scope_authorised(s.id,d.learner_authorisation_id)
      and s.occurred_at>=ctl.updated_at and not ctl.enabled and ctl.ai_mode='shadow'
      and a.expires_at>clock_timestamp() and l.expires_at>clock_timestamp()
      and p.provider_approval_id=a.id and p.rate_card_version=d.rate_card_version
      and p.revision_id=d.policy_revision_id
      and p.learner_policy_version=l.policy_version and p.max_usd_per_request=d.reserved_cost_usd
      and not exists(select 1 from public.writing_context_approval_revocations r where r.provider_approval_id=a.id or r.learner_authorisation_id=l.id)) into ok;
  if d.state is distinct from 'reserved' then return false; end if;
  if ok then
    update public.writing_context_shadow_consumption set requests_admitted=requests_admitted+1,
      admitted_exposure_usd=admitted_exposure_usd+d.reserved_cost_usd,sequence=sequence+1
      where environment=d.budget_environment and budget_day=d.budget_day and policy_revision_id=d.policy_revision_id;
    if not found then raise exception 'context_consumption_missing'; end if;
  end if;
  update public.writing_context_shadow_dispatches set state=case when ok then 'sent' else 'cancelled' end,
    sent_at=case when ok then clock_timestamp() else null end,
    finished_at=case when ok then null else clock_timestamp() end where id=d.id;
  return ok;
end $$;

create or replace function public.writing_context_shadow_operations_for_scope(p_since timestamptz,p_until timestamptz,p_scope text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_totals jsonb; v_families jsonb; begin
  p_until:=coalesce(p_until,clock_timestamp()); p_since:=coalesce(p_since,p_until-interval '24 hours');
  if p_until<=p_since or p_until-p_since>interval '31 days' then raise exception 'shadow_operations_window_invalid'; end if;
  select jsonb_build_object('attempts',count(*),'provider_calls',count(*) filter(where provider_called),
    'requests_attempted',count(*) filter(where transport_attempted),
    'ambiguous_admissions',count(*) filter(where provider_called and transport_attempted is not true),
    'eligible_at_worker_check',count(*) filter(where eligible_at_worker_check),
    'not_assessed',count(*) filter(where result_status='NOT_ASSESSED'),
    'valid',count(*) filter(where result_status='VALID'),'invalid',count(*) filter(where result_status='INVALID'),
    'uncertain',count(*) filter(where result_status='UNCERTAIN'),
    'errors',count(*) filter(where provider_called and failure_kind<>'none'),
    'timeouts',count(*) filter(where failure_kind='timeout'),
    'contract_failures',count(*) filter(where failure_kind='contract'),
    'gate_failures',count(*) filter(where failure_kind='gate'),
    'p50_ms',percentile_cont(0.50) within group(order by latency_ms) filter(where provider_called),
    'p95_ms',percentile_cont(0.95) within group(order by latency_ms) filter(where provider_called),
    'p99_ms',percentile_cont(0.99) within group(order by latency_ms) filter(where provider_called),
    'input_tokens',sum(input_tokens),'cached_input_tokens',sum(cached_input_tokens),
    'output_tokens',sum(output_tokens),'reasoning_tokens',sum(reasoning_tokens),'cache_write_tokens',sum(cache_write_tokens),
    'known_cost_usd',sum(calculated_cost_usd),'unknown_cost_calls',count(*) filter(where provider_called and billing_status='UNKNOWN'))
    into v_totals from public.writing_context_ai_attempts where public.context_shadow_source_in_scope(snapshot_id,p_scope) and record_version=1 and created_at>=p_since and created_at<p_until;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_families from (
    select family_key,result_status,reason_code,model,returned_model,rate_card_version,count(*) as attempts,
      count(*) filter(where provider_called) as provider_calls from public.writing_context_ai_attempts
    where public.context_shadow_source_in_scope(snapshot_id,p_scope) and record_version=1 and created_at>=p_since and created_at<p_until
    group by family_key,result_status,reason_code,model,returned_model,rate_card_version
    order by family_key,result_status,reason_code) x;
  return jsonb_build_object('environment','production','scope',p_scope,'since',p_since,'until',p_until,'totals',v_totals,'groups',v_families,
    'eligible_detector_occurrences',(select coalesce(sum(r.surfaced_count),0) from public.writing_context_detector_runs r
      join public.writing_context_shadow_jobs j on j.snapshot_id=r.snapshot_id and j.run_key=r.run_key
      where public.context_shadow_source_in_scope(r.snapshot_id,p_scope) and r.created_at>=p_since and r.created_at<p_until),
    'routing_excluded',(select coalesce(sum((summary->>'routing_excluded')::integer),0) from public.writing_context_shadow_jobs
      where public.context_shadow_source_in_scope(snapshot_id,p_scope) and created_at>=p_since and created_at<p_until),
    'failed_jobs',(select count(*) from public.writing_context_shadow_jobs where public.context_shadow_source_in_scope(snapshot_id,p_scope) and status='failed' and created_at>=p_since and created_at<p_until),
    'pending_jobs',(select count(*) from public.writing_context_shadow_jobs j
      join public.writing_source_snapshots s on s.id=j.snapshot_id join public.writing_context_advisory_control c on c.singleton
      where public.context_shadow_source_in_scope(j.snapshot_id,p_scope) and j.status in ('pending','processing') and s.occurred_at>=c.updated_at),
    'oldest_queue_seconds',(select coalesce(max(extract(epoch from clock_timestamp()-j.created_at)),0)
      from public.writing_context_shadow_jobs j join public.writing_source_snapshots s on s.id=j.snapshot_id
      join public.writing_context_advisory_control c on c.singleton where public.context_shadow_source_in_scope(j.snapshot_id,p_scope) and j.status in ('pending','processing') and s.occurred_at>=c.updated_at),
    'unrecorded_sends',(select count(*) from public.writing_context_shadow_dispatches d
      join public.writing_context_shadow_jobs j on j.id=d.job_id
      where d.sent_at is not null and (d.state in ('finished','abandoned') or j.status='failed'
        or d.state='sent' and d.sent_at<clock_timestamp()-interval '60 seconds')
      and not exists(select 1 from public.writing_context_ai_attempts a where a.dispatch_id=d.id)),
    'reserved_exposure_usd',(select coalesce(sum(reserved_usd),0) from public.writing_context_shadow_consumption
      where environment='production' and budget_day>=(p_since at time zone 'UTC')::date and budget_day<=(p_until at time zone 'UTC')::date),
    'daily_capacity',(select jsonb_build_object('environment',a.environment,'budget_day',(clock_timestamp() at time zone 'UTC')::date,
      'currency','USD','requests_reserved',coalesce(sum(b.requests_reserved),0),
      'requests_admitted',coalesce(sum(b.requests_admitted),0),'reserved_usd',coalesce(sum(b.reserved_usd),0),
      'known_actual_usd',coalesce(sum(b.known_actual_usd),0),
      'unknown_or_unsettled_admitted_usd',coalesce(sum(b.admitted_exposure_usd-b.known_exposure_usd),0),
      'unadmitted_reserved_usd',coalesce(sum(b.reserved_usd-b.admitted_exposure_usd),0),
      'remaining_requests',case when p.max_requests_per_day is null then null else greatest(0,p.max_requests_per_day-coalesce(sum(b.requests_reserved),0)) end,
      'remaining_reserved_usd',case when p.max_usd_per_day is null then null else greatest(0,p.max_usd_per_day-coalesce(sum(b.reserved_usd),0)) end)
      from public.writing_context_shadow_policy p
      left join public.writing_context_provider_approvals a on a.id=p.provider_approval_id
      left join public.writing_context_shadow_consumption b on b.environment=a.environment
        and b.budget_day=(clock_timestamp() at time zone 'UTC')::date
      where p.singleton group by a.environment,p.max_requests_per_day,p.max_usd_per_day));
end $$;

create or replace function public.writing_context_shadow_operations(p_since timestamptz,p_until timestamptz) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select public.writing_context_shadow_operations_for_scope(p_since,p_until,'REAL_LEARNER');
$$;

create or replace function public.monitor_writing_context_shadow() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; o jsonb; t jsonb; n numeric; begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.thresholds='{}'::jsonb then return false; end if;
  o:=public.writing_context_shadow_operations_for_scope(clock_timestamp()-make_interval(secs=>(p.thresholds->>'window_seconds')::integer),clock_timestamp(),p.dispatch_scope);
  if (o->>'unrecorded_sends')::integer>0 then
    perform public.stop_writing_context_shadow('AI_MISSING_PROVENANCE_STOP'); return false; end if;
  if exists(select 1 from public.writing_context_ai_attempts a join public.writing_context_shadow_dispatches d on d.id=a.dispatch_id
    where a.record_version=1 and d.provider_approval_id=p.provider_approval_id and (a.calculated_cost_usd>d.reserved_cost_usd or a.returned_model is not null and a.returned_model<>a.model
      or a.service_tier is not null and a.service_tier<>'default' or a.cache_write_tokens>0 or a.cached_input_tokens>0)) then
    perform public.stop_writing_context_shadow('AI_CONFIGURATION_STOP'); return false; end if;
  t:=o->'totals'; n:=(t->>'provider_calls')::numeric;
  if (o->>'oldest_queue_seconds')::numeric>(p.thresholds->>'max_queue_age_seconds')::numeric or
    (n>=(p.thresholds->>'minimum_calls')::numeric and (
      (t->>'errors')::numeric/nullif(n,0)>(p.thresholds->>'error_rate')::numeric or
      (t->>'timeouts')::numeric/nullif(n,0)>(p.thresholds->>'timeout_rate')::numeric or
      (t->>'contract_failures')::numeric/nullif(n,0)>(p.thresholds->>'malformed_rate')::numeric or
      (t->>'gate_failures')::numeric/nullif(n,0)>(p.thresholds->>'gate_failure_rate')::numeric or
      (t->>'p95_ms')::numeric>(p.thresholds->>'p95_ms')::numeric)) then
    perform public.stop_writing_context_shadow('AI_OPERATIONAL_THRESHOLD_STOP'); return false; end if;
  return true;
end $$;

create or replace view public.writing_context_feedback_decisions_v1 with (security_invoker=true) as
select d.id decision_id,d.occurrence_id,d.decided_at,d.classification parent_classification,
  d.intended_member parent_replacement,d.family_key,
  r.id detector_run_id,r.detector_version,r.registry_version,
  o.id observation_id,a.id ai_attempt_id,a.mode ai_mode,
  a.provider,a.model requested_model,a.returned_model,a.prompt_fingerprint,
  a.schema_fingerprint,a.gate_version,a.result_status ai_status,
  a.alternative_member ai_replacement,a.reason_code ai_reason_code,
  case
    when d.classification='EXCLUDED' then 'EXCLUDED'
    when a.id is null or a.result_status='NOT_ASSESSED' then 'NOT_COMPARABLE'
    when a.result_status='VALID' and d.classification='VALID' then 'AGREED_VALID'
    when a.result_status='INVALID' and d.classification='INVALID' and
      a.alternative_member=d.intended_member then 'AGREED_INVALID'
    when a.result_status='INVALID' and d.classification='INVALID' then 'REPLACEMENT_CHANGED'
    when a.result_status='INVALID' and d.classification='VALID' then 'AI_FALSE_INVALID'
    when a.result_status='VALID' and d.classification='INVALID' then 'AI_MISSED_INVALID'
    when a.result_status='UNCERTAIN' and d.classification in ('VALID','INVALID')
      then 'AI_ABSTENTION_RESOLVED'
    else 'PARENT_UNRESOLVED' end ai_outcome,
  case
    when r.id is null then 'NOT_COMPARABLE'
    when m.occurrence_id is not null and d.classification='INVALID' then 'SURFACED_CONFIRMED'
    when m.occurrence_id is not null and d.classification='EXCLUDED' then 'SURFACED_REJECTED'
    when c.id is not null and d.classification='INVALID' then 'PARENT_ADDED_MISS'
    else 'NOT_COMPARABLE' end detector_outcome,
  not exists(select 1 from public.writing_context_parent_decisions newer
    where newer.supersedes_decision_id=d.id) is_current
from public.writing_context_parent_decisions d
left join public.writing_context_advisory_observations o on o.id=d.observation_id
left join public.writing_context_parent_added_cases c on c.occurrence_id=d.occurrence_id
left join public.writing_context_ai_attempts a on a.id=case when o.id is not null then o.ai_attempt_id
  else coalesce(d.ai_attempt_id,c.ai_attempt_id) end
left join public.writing_context_detector_runs r on r.id=case when a.id is not null then a.detector_run_id
  when o.id is not null then d.detector_run_id
  else coalesce(c.detector_run_id,d.detector_run_id) end
left join public.writing_context_detector_members m
  on m.run_id=r.id and m.occurrence_id=d.occurrence_id
where exists(select 1 from public.writing_occurrences scoped_o join public.writing_source_snapshots scoped_s on scoped_s.id=scoped_o.snapshot_id where scoped_o.id=d.occurrence_id and scoped_s.source_purpose='REAL_LEARNER');

create or replace view public.writing_context_feedback_detector_metrics_v1 with (security_invoker=true) as
select r.detector_version,r.registry_version,family.family_key,
  count(m.occurrence_id)::integer surfaced,
  count(m.occurrence_id) filter(where d.id is not null)::integer reviewed,
  count(m.occurrence_id) filter(where d.classification='INVALID')::integer parent_confirmed,
  count(m.occurrence_id) filter(where d.classification='EXCLUDED')::integer parent_rejected,
  (select count(*)::integer from public.writing_context_parent_added_cases c
    join public.writing_context_current_parent_decisions current_decision
      on current_decision.occurrence_id=c.occurrence_id
      and current_decision.parent_user_id=c.parent_user_id
      and current_decision.classification='INVALID'
    where c.detector_run_id=r.id and c.governed_family_key=family.family_key
      and not exists(select 1 from public.writing_context_detector_members x
        where x.run_id=r.id and x.occurrence_id=c.occurrence_id)) parent_added_misses
from public.writing_context_detector_runs r
cross join (values ('THERE_THEIR_THEYRE'),('TO_TOO_TWO'),
  ('YOUR_YOURE'),('ITS_ITS')) family(family_key)
left join public.writing_context_detector_members m on m.run_id=r.id
  and m.family_key=family.family_key
left join public.writing_context_current_parent_decisions d on d.occurrence_id=m.occurrence_id
where public.context_shadow_source_in_scope(r.snapshot_id,'REAL_LEARNER')
group by r.id,r.detector_version,r.registry_version,family.family_key;

create or replace view public.writing_spelling_feedback_detector_metrics_v1 with (security_invoker=true) as
select b.id batch_id,b.detection_version,b.mapping_authority_fingerprint,
  b.occurrence_count,b.eligible_occurrence_count,
  count(c.id) filter(where c.disposition='FINDING')::integer surfaced,
  count(c.id) filter(where c.disposition='FINDING' and parent_issue.id is not null and
    not (parent_issue.issue_status='finalised' and
      parent_issue.final_classification='not_an_issue'))::integer parent_confirmed,
  count(c.id) filter(where c.disposition='FINDING' and
    (parent_issue.id is null or (parent_issue.issue_status='finalised' and
      parent_issue.final_classification='not_an_issue')) and
    ((parent_issue.issue_status='finalised' and parent_issue.final_classification='not_an_issue') or
     exists(select 1 from public.writing_issue_suggestions s
      where s.source_writing_occurrence_id=c.occurrence_id and s.suggestion_status='rejected') or
     exists(select 1 from public.misspelling_instances m
      where m.source_writing_occurrence_id=c.occurrence_id and m.is_false_positive=true)))::integer parent_rejected,
  (select count(distinct o.id)::integer from public.misspelling_instances m
    join public.writing_occurrences o on o.id=m.source_writing_occurrence_id
    join public.writing_known_spelling_checks assessed
      on assessed.batch_id=b.id and assessed.occurrence_id=o.id
      and assessed.disposition in ('NO_MAPPING','ABSTAINED')
    where m.parent_authored_feedback and not m.is_false_positive
      and o.snapshot_id=b.snapshot_id and o.provenance='learner_response') parent_added_misses
from public.writing_known_spelling_batches b
join public.writing_shadow_runs run on run.id=b.run_id and run.status='completed'
left join public.writing_known_spelling_checks c on c.batch_id=b.id
left join lateral (
  select i.id,i.issue_status,i.final_classification from public.writing_issues i
  where i.source_writing_occurrence_id=c.occurrence_id
  order by i.created_at desc,i.id desc limit 1
) parent_issue on true
where public.context_shadow_source_in_scope(b.snapshot_id,'REAL_LEARNER') and (select count(*) from public.writing_known_spelling_checks checked
       where checked.batch_id=b.id)=b.occurrence_count
group by b.id,b.detection_version,b.mapping_authority_fingerprint,
  b.occurrence_count,b.eligible_occurrence_count,b.snapshot_id;

create or replace view public.writing_context_feedback_operations_v1 with (security_invoker=true) as
select family_key,mode,provider,model,returned_model,prompt_fingerprint,
  schema_fingerprint,gate_version,candidate_detector_version,family_registry_version,
  result_status,reason_code,pricing_version,
  count(*)::integer attempts,
  count(*) filter(where provider_called)::integer provider_calls,
  count(*) filter(where provider_called and result_status<>'NOT_ASSESSED')::integer assessed,
  count(*) filter(where provider_request_id is not null)::integer provider_responses_with_id,
  avg(latency_ms)::numeric(12,2) average_latency_ms,
  percentile_cont(0.5) within group(order by latency_ms) median_latency_ms,
  percentile_cont(0.95) within group(order by latency_ms) p95_latency_ms,
  sum(input_tokens)::bigint input_tokens,
  sum(cached_input_tokens)::bigint cached_input_tokens,
  sum(output_tokens)::bigint output_tokens,
  sum(calculated_cost_usd)::numeric(16,8) estimated_cost_usd
from public.writing_context_ai_attempts
where public.context_shadow_source_in_scope(snapshot_id,'REAL_LEARNER')
group by family_key,mode,provider,model,returned_model,prompt_fingerprint,
  schema_fingerprint,gate_version,candidate_detector_version,family_registry_version,
  result_status,reason_code,pricing_version;

revoke all on function public.assert_context_proof_registration(),public.stamp_context_source_purpose(),
  public.lock_context_submission_child(),public.reject_context_proof_educational_write(),public.reject_context_proof_research(),
  public.context_provider_proof_child(uuid),public.context_shadow_source_in_scope(uuid,text),
  public.context_shadow_scope_authorised(uuid,uuid),public.writing_context_shadow_operations_for_scope(timestamptz,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.context_provider_proof_child(uuid),public.context_shadow_source_in_scope(uuid,text),
  public.context_shadow_scope_authorised(uuid,uuid),public.writing_context_shadow_operations_for_scope(timestamptz,timestamptz,text) to service_role;
update public.writing_context_advisory_control set enabled=false,ai_mode='disabled';
commit;
