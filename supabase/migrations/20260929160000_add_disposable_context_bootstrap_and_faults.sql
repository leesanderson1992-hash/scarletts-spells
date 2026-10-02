-- Unique forward migration. No fixture, approval, cap, key or activation seed.
begin;
alter table public.writing_context_shadow_policy
  add column execution_policy_kind text not null default 'MEASURED'
    check(execution_policy_kind in ('MEASURED','DISPOSABLE_BOOTSTRAP')),
  add column bootstrap_expires_at timestamptz,
  add constraint context_bootstrap_proof_only check (
    (execution_policy_kind='MEASURED' and bootstrap_expires_at is null) or
    (execution_policy_kind='DISPOSABLE_BOOTSTRAP' and dispatch_scope='DISPOSABLE_PROVIDER_PROOF'
      and bootstrap_expires_at is not null));

-- Non-personal, append-only failure latch survives source deletion and policy revision.
create table public.writing_context_bootstrap_failures (
  provider_approval_id uuid primary key references public.writing_context_provider_approvals(id),
  policy_revision_id uuid not null references public.writing_context_shadow_policy_history(id),
  code text not null check(code ~ '^[A-Z0-9_]{1,80}$'),
  created_at timestamptz not null default clock_timestamp()
);
create table public.writing_context_proof_fault_plans (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete restrict,
  policy_revision_id uuid not null references public.writing_context_shadow_policy_history(id),
  runtime_fingerprint text not null check(runtime_fingerprint ~ '^[a-f0-9]{64}$'),
  field_path text not null check(length(field_path) between 1 and 500),
  field_hash text not null check(field_hash ~ '^[a-f0-9]{64}$'),
  window_fingerprint text not null check(window_fingerprint ~ '^[a-f0-9]{64}$'),
  start_utf16 integer not null check(start_utf16>=0),
  end_utf16 integer not null check(end_utf16>start_utf16),
  action text not null check(action in ('SIMULATE_TIMEOUT','SIMULATE_429','SIMULATE_5XX',
    'PAUSE_BEFORE_ADMISSION','PAUSE_AFTER_FETCH','PAUSE_BEFORE_RECEIPT','INTERRUPT_AFTER_FETCH')),
  approved_by uuid not null references auth.users(id),
  evidence_ref text not null check(evidence_ref ~ '^[A-Za-z0-9_./:-]{1,200}$'),
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check(expires_at>approved_at),
  check(approved_by=parent_user_id),
  unique(policy_revision_id,child_id,task_id,field_path,start_utf16,end_utf16)
);
create table public.writing_context_proof_fault_consumptions (
  plan_id uuid primary key references public.writing_context_proof_fault_plans(id) on delete cascade,
  dispatch_id uuid not null unique references public.writing_context_shadow_dispatches(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create table public.writing_context_proof_fault_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.writing_context_proof_fault_plans(id) on delete cascade,
  phase text not null check(phase in ('BEFORE_ADMISSION','FETCH_INVOKED','BEFORE_RECEIPT',
    'INTERRUPTED','RELEASED','REVOKED','SIMULATION_STARTED','SIMULATED','BOUND')),
  evidence_ref text check(evidence_ref ~ '^[A-Za-z0-9_./:-]{1,200}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(plan_id,phase)
);
do $$ declare n text; begin
  foreach n in array array['writing_context_bootstrap_failures','writing_context_proof_fault_plans',
    'writing_context_proof_fault_consumptions','writing_context_proof_fault_events'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('revoke all on public.%I from public,anon,authenticated',n);
    execute format('grant select on public.%I to service_role',n);
    execute format('create trigger %I before update on public.%I for each row execute function public.reject_writing_fact_update()',n||'_immutable',n);
  end loop;
end $$;
grant insert on public.writing_context_proof_fault_plans to service_role;
create trigger context_bootstrap_failure_delete before delete on public.writing_context_bootstrap_failures
  for each row execute function public.reject_writing_fact_update();
create trigger context_bootstrap_failure_truncate before truncate on public.writing_context_bootstrap_failures
  for each statement execute function public.reject_writing_fact_update();
create index context_proof_fault_coordinates on public.writing_context_proof_fault_plans(child_id,task_id,field_path,start_utf16,end_utf16);

create or replace function public.stop_writing_context_shadow(p_code text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; begin
  if p_code not in ('AI_MODEL_IDENTITY_STOP','AI_CONFIGURATION_STOP','AI_MISSING_PROVENANCE_STOP',
    'AI_OPERATIONAL_THRESHOLD_STOP','AI_COST_STOP','AI_PRIVACY_STOP','AI_VISIBILITY_STOP','AI_LEARNING_MUTATION_STOP')
    then raise exception 'shadow_stop_code_invalid'; end if;
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.execution_policy_kind='DISPOSABLE_BOOTSTRAP' and p.provider_approval_id is not null and p.revision_id is not null then
    insert into public.writing_context_bootstrap_failures(provider_approval_id,policy_revision_id,code)
      values(p.provider_approval_id,p.revision_id,p_code) on conflict do nothing;
  end if;
  update public.writing_context_advisory_control set enabled=false,ai_mode='disabled',updated_by=p.approved_by where singleton;
  insert into public.writing_context_shadow_stops(code) values(p_code);
  return true;
end $$;

-- Called with control already locked by monitor/reservation/admission. Own reserved
-- dispatch is excluded only at final admission; every other unresolved job blocks.
create function public.context_shadow_execution_ready(p_revision uuid,p_dispatch uuid default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; a public.writing_context_provider_approvals%rowtype; begin
  select * into p from public.writing_context_shadow_policy where singleton and revision_id=p_revision;
  if p.singleton is null or exists(select 1 from public.writing_context_bootstrap_failures where provider_approval_id=p.provider_approval_id) then return false; end if;
  if p.execution_policy_kind='MEASURED' then
    return p.thresholds ?& array['window_seconds','minimum_calls','error_rate','timeout_rate','malformed_rate','gate_failure_rate','p95_ms','max_queue_age_seconds'];
  end if;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  if p.dispatch_scope<>'DISPOSABLE_PROVIDER_PROOF' or a.dispatch_scope is distinct from p.dispatch_scope
    or a.environment is distinct from 'production' or a.expires_at<=clock_timestamp()
    or p.bootstrap_expires_at<=clock_timestamp() or p.approved_by is null or p.evidence_ref is null
    or p.max_concurrent<>1 or p.max_requests_per_day is null or p.max_usd_per_day is null or p.max_usd_per_request is null
    or p.rate_card_version is null or p.learner_policy_version is null
    or exists(select 1 from public.writing_context_approval_revocations where provider_approval_id=a.id)
    or exists(select 1 from public.writing_context_bootstrap_failures where provider_approval_id=a.id)
    then return false; end if;
  if exists(select 1 from public.writing_context_shadow_dispatches d where d.budget_environment='production'
      and (p_dispatch is null or d.id<>p_dispatch) and
      (d.state in ('reserved','sent') or d.sent_at is not null and not exists(
        select 1 from public.writing_context_ai_attempts x where x.dispatch_id=d.id))) then return false; end if;
  return true;
end $$;

create function public.assert_context_proof_fault_plan() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  perform 1 from public.children where id=new.child_id for update;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.dispatch_scope<>'DISPOSABLE_PROVIDER_PROOF' or p.revision_id is distinct from new.policy_revision_id
    or new.approved_at>clock_timestamp() or new.expires_at<=clock_timestamp()
    or not exists(select 1 from public.writing_context_provider_proof_learners f
      join public.children ch on ch.id=f.child_id and ch.parent_user_id=f.parent_user_id
      join public.course_tasks t on t.id=f.task_id and t.parent_user_id=f.parent_user_id
      where f.child_id=new.child_id and f.parent_user_id=new.parent_user_id and f.task_id=new.task_id
        and f.expires_at>=new.expires_at and t.task_type in ('lesson','test'))
    or not exists(select 1 from public.writing_context_provider_approvals a where a.id=p.provider_approval_id
      and a.dispatch_scope=p.dispatch_scope and a.environment='production' and a.runtime_fingerprint=new.runtime_fingerprint
      and a.expires_at>=new.expires_at and not exists(select 1 from public.writing_context_approval_revocations r where r.provider_approval_id=a.id))
    or not exists(select 1 from public.writing_context_learner_authorisations l where l.child_id=new.child_id
      and l.parent_user_id=new.parent_user_id and l.approved_by=new.parent_user_id and l.authorisation_kind='OPERATOR_PROOF'
      and l.policy_version=p.learner_policy_version and l.expires_at>=new.expires_at
      and not exists(select 1 from public.writing_context_approval_revocations r where r.learner_authorisation_id=l.id))
    or exists(select 1 from public.writing_source_snapshots s where s.child_id=new.child_id and s.task_id=new.task_id)
    or exists(select 1 from public.task_submissions t where t.child_id=new.child_id and t.task_id=new.task_id)
    or (p.execution_policy_kind='DISPOSABLE_BOOTSTRAP' and new.expires_at>p.bootstrap_expires_at)
    then raise exception 'AI_PROOF_FAULT_APPROVAL_DENIED'; end if;
  return new;
end $$;
create trigger context_proof_fault_plan before insert on public.writing_context_proof_fault_plans
  for each row execute function public.assert_context_proof_fault_plan();

-- None/denied are distinct: stale or mismatched selected cases cannot become real sends.
create function public.bind_writing_context_proof_fault(p_dispatch_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.writing_context_shadow_dispatches%rowtype; s public.writing_source_snapshots%rowtype;
  o public.writing_occurrences%rowtype; f public.writing_context_proof_fault_plans%rowtype; begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select * into d from public.writing_context_shadow_dispatches where id=p_dispatch_id for update;
  select s0.* into s from public.writing_source_snapshots s0 join public.writing_context_shadow_jobs j on j.snapshot_id=s0.id
    where j.id=d.job_id and j.claim_token=p_claim_token and j.status='processing';
  if d.id is null or s.id is null or d.state<>'reserved' then return jsonb_build_object('kind','DENIED'); end if;
  select * into o from public.writing_occurrences where id=d.occurrence_id;
  select * into f from public.writing_context_proof_fault_plans where child_id=s.child_id and task_id=s.task_id
    and field_path=o.field_path and start_utf16=o.start_utf16 and end_utf16=o.end_utf16 order by approved_at desc,id desc limit 1 for update;
  if f.id is null then
    if exists(select 1 from public.writing_context_proof_fault_plans where child_id=s.child_id and task_id=s.task_id and field_path=o.field_path)
      then return jsonb_build_object('kind','DENIED'); end if;
    return jsonb_build_object('kind','NONE');
  end if;
  if s.source_purpose<>'DISPOSABLE_PROVIDER_PROOF' or f.parent_user_id<>s.parent_user_id
    or f.policy_revision_id<>d.policy_revision_id or f.field_hash<>o.field_hash or f.window_fingerprint<>d.window_fingerprint
    or f.approved_at>s.occurred_at or f.expires_at<=clock_timestamp()
    or not public.context_shadow_scope_authorised(s.id,d.learner_authorisation_id)
    or not exists(select 1 from public.writing_context_provider_approvals a where a.id=d.provider_approval_id and a.runtime_fingerprint=f.runtime_fingerprint)
    or exists(select 1 from public.writing_context_proof_fault_events where plan_id=f.id and phase in ('REVOKED','BOUND'))
    or exists(select 1 from public.writing_context_proof_fault_consumptions where plan_id=f.id or dispatch_id=d.id)
    then return jsonb_build_object('kind','DENIED'); end if;
  insert into public.writing_context_proof_fault_consumptions(plan_id,dispatch_id) values(f.id,d.id);
  insert into public.writing_context_proof_fault_events(plan_id,phase) values(f.id,'BOUND');
  return jsonb_build_object('kind','BOUND','id',f.id,'action',f.action,'expires_at',f.expires_at);
end $$;

-- Release remains possible after kill: it grants no admission and cannot undo disablement.
create function public.context_proof_fault_live(p_dispatch uuid,p_claim uuid) returns boolean
language sql security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.writing_context_proof_fault_consumptions c
    join public.writing_context_proof_fault_plans f on f.id=c.plan_id
    join public.writing_context_shadow_dispatches d on d.id=c.dispatch_id
    join public.writing_context_shadow_jobs j on j.id=d.job_id
    join public.writing_source_snapshots s on s.id=j.snapshot_id
    join public.writing_context_provider_proof_learners r on r.child_id=s.child_id and r.task_id=s.task_id and r.parent_user_id=s.parent_user_id
    join public.children ch on ch.id=s.child_id and ch.parent_user_id=s.parent_user_id
    join public.course_tasks t on t.id=s.task_id and t.parent_user_id=s.parent_user_id
    join public.writing_context_shadow_policy p on p.singleton and p.revision_id=d.policy_revision_id
    where d.id=p_dispatch and j.claim_token=p_claim and j.status='processing' and j.claimed_at>clock_timestamp()-interval '60 seconds'
      and s.source_purpose='DISPOSABLE_PROVIDER_PROOF' and f.child_id=s.child_id and f.task_id=s.task_id and f.parent_user_id=s.parent_user_id
      and f.policy_revision_id=d.policy_revision_id and p.dispatch_scope='DISPOSABLE_PROVIDER_PROOF'
      and f.expires_at>clock_timestamp() and r.expires_at>clock_timestamp()
      and not exists(select 1 from public.writing_context_proof_fault_events e where e.plan_id=f.id and e.phase='REVOKED'));
$$;
create function public.record_writing_context_proof_fault_phase(p_dispatch_id uuid,p_claim_token uuid,p_phase text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.writing_context_proof_fault_plans%rowtype; d public.writing_context_shadow_dispatches%rowtype; begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  if not public.context_proof_fault_live(p_dispatch_id,p_claim_token) then return false; end if;
  select * into d from public.writing_context_shadow_dispatches where id=p_dispatch_id;
  select f0.* into f from public.writing_context_proof_fault_plans f0 join public.writing_context_proof_fault_consumptions c on c.plan_id=f0.id where c.dispatch_id=d.id;
  if not ((p_phase in ('SIMULATION_STARTED','SIMULATED') and f.action like 'SIMULATE_%' and d.state='reserved')
    or (p_phase='BEFORE_ADMISSION' and f.action='PAUSE_BEFORE_ADMISSION' and d.state='reserved')
    or (p_phase='FETCH_INVOKED' and f.action in ('PAUSE_AFTER_FETCH','INTERRUPT_AFTER_FETCH') and d.state='sent')
    or (p_phase='BEFORE_RECEIPT' and f.action='PAUSE_BEFORE_RECEIPT' and d.state='sent')
    or (p_phase='INTERRUPTED' and f.action='INTERRUPT_AFTER_FETCH' and d.state='sent'
      and exists(select 1 from public.writing_context_proof_fault_events where plan_id=f.id and phase='FETCH_INVOKED')))
    then return false; end if;
  insert into public.writing_context_proof_fault_events(plan_id,phase) values(f.id,p_phase) on conflict do nothing;
  if p_phase='SIMULATED' then perform public.stop_writing_context_shadow('AI_OPERATIONAL_THRESHOLD_STOP'); end if;
  if p_phase='INTERRUPTED' then perform public.stop_writing_context_shadow('AI_MISSING_PROVENANCE_STOP'); end if;
  return true;
end $$;
create function public.writing_context_proof_fault_status(p_dispatch_id uuid,p_claim_token uuid) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('authorised',public.context_proof_fault_live(p_dispatch_id,p_claim_token),
    'released',exists(select 1 from public.writing_context_proof_fault_events e
      join public.writing_context_proof_fault_consumptions c on c.plan_id=e.plan_id where c.dispatch_id=p_dispatch_id and e.phase='RELEASED'));
$$;
create function public.release_writing_context_proof_fault(p_plan_id uuid,p_actor uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid; token uuid; begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select c.dispatch_id,j.claim_token into d,token from public.writing_context_proof_fault_consumptions c
    join public.writing_context_proof_fault_plans f on f.id=c.plan_id
    join public.writing_context_shadow_dispatches x on x.id=c.dispatch_id
    join public.writing_context_shadow_jobs j on j.id=x.job_id
    where f.id=p_plan_id and f.approved_by=p_actor and exists(select 1 from public.writing_context_proof_fault_events e
      where e.plan_id=f.id and e.phase in ('BEFORE_ADMISSION','FETCH_INVOKED','BEFORE_RECEIPT'));
  if d is null or not public.context_proof_fault_live(d,token) then return false; end if;
  insert into public.writing_context_proof_fault_events(plan_id,phase) values(p_plan_id,'RELEASED') on conflict do nothing;
  return true;
end $$;
create function public.revoke_writing_context_proof_fault(p_plan_id uuid,p_actor uuid,p_evidence_ref text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  if not exists(select 1 from public.writing_context_proof_fault_plans where id=p_plan_id and approved_by=p_actor) then return false; end if;
  insert into public.writing_context_proof_fault_events(plan_id,phase,evidence_ref) values(p_plan_id,'REVOKED',p_evidence_ref) on conflict do nothing;
  return true;
end $$;

alter table public.writing_context_ai_attempts add column evidence_kind text not null default 'GENUINE_PROVIDER'
  check(evidence_kind in ('GENUINE_PROVIDER','PROOF_SIMULATION','PROOF_TIMING'));
create function public.assert_context_proof_attempt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare action text; begin
  select f.action into action from public.writing_context_proof_fault_plans f
    join public.writing_context_proof_fault_consumptions c on c.plan_id=f.id where c.dispatch_id=new.dispatch_id;
  new.evidence_kind:=case when action like 'SIMULATE_%' then 'PROOF_SIMULATION' when action is not null then 'PROOF_TIMING' else 'GENUINE_PROVIDER' end;
  -- Canonical stale recovery has no transport observation. A bound no-send plan
  -- independently forbids admission, so its unsent dispatch proves NOT_SENT.
  if new.evidence_kind='PROOF_SIMULATION' and not new.provider_called and new.transport_attempted is null then
    new.transport_attempted:=false;
  end if;
  if new.evidence_kind='PROOF_SIMULATION' and (new.provider_called or new.transport_attempted is distinct from false
    or new.result_status<>'NOT_ASSESSED' or new.billing_status<>'NOT_SENT' or new.returned_model is not null
    or new.provider_request_id is not null or new.provider_response_id is not null or new.service_tier is not null
    or new.input_tokens is not null or new.output_tokens is not null or new.cached_input_tokens is not null
    or new.cache_write_tokens is not null or new.reasoning_tokens is not null or new.calculated_cost_usd is not null
    or new.declared_decision is not null or new.alternative_member is not null or new.transport_started_at is not null
    or new.response_received_at is not null or new.reason_code not in ('AI_PROOF_HOOK_UNAVAILABLE','AI_RESERVED_OUTCOME_AMBIGUOUS','AI_PROOF_'||replace(action,'SIMULATE_','SIMULATED_')))
    then raise exception 'AI_PROOF_SIMULATION_PROVENANCE_DENIED'; end if;
  return new;
end $$;
-- Runs after the frozen BEFORE INSERT provenance trigger, including authoritative billing.
create trigger zz_context_proof_attempt before insert on public.writing_context_ai_attempts
  for each row execute function public.assert_context_proof_attempt();
create function public.stop_failed_context_bootstrap_attempt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  if new.result_status='NOT_ASSESSED' and exists(select 1 from public.writing_context_shadow_policy p
    where p.singleton and p.execution_policy_kind='DISPOSABLE_BOOTSTRAP'
      and public.context_shadow_source_in_scope(new.snapshot_id,p.dispatch_scope)) then
    perform public.stop_writing_context_shadow('AI_OPERATIONAL_THRESHOLD_STOP');
  end if;
  return new;
end $$;
create trigger context_bootstrap_failure after insert on public.writing_context_ai_attempts
  for each row execute function public.stop_failed_context_bootstrap_attempt();

create function public.context_proof_fault_admission_allowed(p_dispatch uuid,p_claim uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.writing_context_shadow_dispatches%rowtype; selected boolean; begin
  select * into d from public.writing_context_shadow_dispatches where id=p_dispatch;
  select exists(select 1 from public.writing_context_proof_fault_plans f
    join public.writing_source_snapshots s on s.child_id=f.child_id and s.task_id=f.task_id
    join public.writing_context_shadow_jobs j on j.snapshot_id=s.id
    join public.writing_occurrences o on o.id=d.occurrence_id and o.field_path=f.field_path
    where j.id=d.job_id) into selected;
  if not selected then return true; end if;
  return public.context_proof_fault_live(p_dispatch,p_claim) and exists(
    select 1 from public.writing_context_proof_fault_consumptions c
    join public.writing_context_proof_fault_plans f on f.id=c.plan_id
    where c.dispatch_id=p_dispatch and f.action not like 'SIMULATE_%'
      and (f.action<>'PAUSE_BEFORE_ADMISSION' or exists(select 1 from public.writing_context_proof_fault_events e where e.plan_id=f.id and e.phase='RELEASED')));
end $$;

-- Retain existing all-outcome operational totals, add a separate genuine sample.
alter function public.writing_context_shadow_operations_for_scope(timestamptz,timestamptz,text)
  rename to writing_context_shadow_operations_for_scope_stage1b_base;
revoke all on function public.writing_context_shadow_operations_for_scope_stage1b_base(timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
create function public.writing_context_shadow_operations_for_scope(p_since timestamptz,p_until timestamptz,p_scope text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o jsonb; m jsonb; kinds jsonb; faults jsonb; begin
  p_until:=coalesce(p_until,clock_timestamp()); p_since:=coalesce(p_since,p_until-interval '24 hours');
  o:=public.writing_context_shadow_operations_for_scope_stage1b_base(p_since,p_until,p_scope);
  select jsonb_build_object('provider_calls',count(*) filter(where provider_called),
    'errors',count(*) filter(where provider_called and failure_kind<>'none'),
    'timeouts',count(*) filter(where failure_kind='timeout'),
    'contract_failures',count(*) filter(where failure_kind='contract'),
    'gate_failures',count(*) filter(where failure_kind='gate'),
    'p95_ms',percentile_cont(.95) within group(order by latency_ms) filter(where provider_called)) into m
    from public.writing_context_ai_attempts where record_version=1 and evidence_kind='GENUINE_PROVIDER'
      and public.context_shadow_source_in_scope(snapshot_id,p_scope) and created_at>=p_since and created_at<p_until;
  select coalesce(jsonb_object_agg(evidence_kind,n),'{}') into kinds from (
    select evidence_kind,count(*) n from public.writing_context_ai_attempts where record_version=1
      and public.context_shadow_source_in_scope(snapshot_id,p_scope) and created_at>=p_since and created_at<p_until group by evidence_kind) x;
  -- Include interrupted dispatches before a receipt exists; counts expose no hook capability.
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into faults from (
    select f.action,d.state,count(*) dispatches,count(*) filter(where exists(
      select 1 from public.writing_context_ai_attempts a where a.dispatch_id=d.id)) receipts
    from public.writing_context_proof_fault_consumptions c
    join public.writing_context_proof_fault_plans f on f.id=c.plan_id
    join public.writing_context_shadow_dispatches d on d.id=c.dispatch_id
    join public.writing_context_shadow_jobs j on j.id=d.job_id
    where public.context_shadow_source_in_scope(j.snapshot_id,p_scope) and d.reserved_at>=p_since and d.reserved_at<p_until
    group by f.action,d.state order by f.action,d.state) x;
  return o || jsonb_build_object('measurements',m,'evidence_kinds',kinds,'fault_dispatches',faults);
end $$;

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
    or (p.execution_policy_kind='MEASURED' and not (p.thresholds ?& array['window_seconds','minimum_calls','error_rate','timeout_rate','malformed_rate','gate_failure_rate','p95_ms','max_queue_age_seconds']))
    then return jsonb_build_object('reason','AI_POLICY_UNAPPROVED'); end if;
  if not public.context_shadow_execution_ready(p.revision_id) then return jsonb_build_object('reason','AI_EXECUTION_POLICY_DENIED'); end if;
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
      and public.context_shadow_execution_ready(p.revision_id,d.id)
      and public.context_proof_fault_admission_allowed(d.id,p_claim_token)
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

create or replace function public.monitor_writing_context_shadow() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; o jsonb; t jsonb; n numeric; v_now timestamptz:=clock_timestamp(); begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.execution_policy_kind='MEASURED' and not public.context_shadow_execution_ready(p.revision_id) then return false; end if;
  if p.execution_policy_kind='DISPOSABLE_BOOTSTRAP' and not public.context_shadow_execution_ready(p.revision_id) then
    perform public.stop_writing_context_shadow('AI_OPERATIONAL_THRESHOLD_STOP'); return false; end if;
  o:=public.writing_context_shadow_operations_for_scope(v_now-make_interval(secs=>case when p.execution_policy_kind='DISPOSABLE_BOOTSTRAP' then 2678400 else (p.thresholds->>'window_seconds')::integer end),v_now,p.dispatch_scope);
  if (o->>'unrecorded_sends')::integer>0 then
    perform public.stop_writing_context_shadow('AI_MISSING_PROVENANCE_STOP'); return false; end if;
  if exists(select 1 from public.writing_context_ai_attempts a join public.writing_context_shadow_dispatches d on d.id=a.dispatch_id
    where a.record_version=1 and d.provider_approval_id=p.provider_approval_id and (a.calculated_cost_usd>d.reserved_cost_usd or a.returned_model is not null and a.returned_model<>a.model
      or a.service_tier is not null and a.service_tier<>'default' or a.cache_write_tokens>0 or a.cached_input_tokens>0)) then
    perform public.stop_writing_context_shadow('AI_CONFIGURATION_STOP'); return false; end if;
  if p.execution_policy_kind='DISPOSABLE_BOOTSTRAP' then return true; end if;
  t:=o->'measurements'; n:=(t->>'provider_calls')::numeric;
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

-- Retain ordinary-client restrictions. Broad trusted service authority remains the owner assumption.
do $$ declare signature text; begin
  foreach signature in array array[
    'context_shadow_execution_ready(uuid,uuid)','assert_context_proof_fault_plan()',
    'bind_writing_context_proof_fault(uuid,uuid)','context_proof_fault_live(uuid,uuid)',
    'record_writing_context_proof_fault_phase(uuid,uuid,text)','writing_context_proof_fault_status(uuid,uuid)',
    'release_writing_context_proof_fault(uuid,uuid)','revoke_writing_context_proof_fault(uuid,uuid,text)',
    'assert_context_proof_attempt()','stop_failed_context_bootstrap_attempt()',
    'context_proof_fault_admission_allowed(uuid,uuid)',
    'writing_context_shadow_operations_for_scope(timestamptz,timestamptz,text)'] loop
    execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
  end loop;
end $$;
grant execute on function public.bind_writing_context_proof_fault(uuid,uuid),
  public.record_writing_context_proof_fault_phase(uuid,uuid,text),public.writing_context_proof_fault_status(uuid,uuid),
  public.release_writing_context_proof_fault(uuid,uuid),public.revoke_writing_context_proof_fault(uuid,uuid,text),
  public.writing_context_shadow_operations_for_scope(timestamptz,timestamptz,text) to service_role;

create function public.stop_failed_writing_context_bootstrap() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  if exists(select 1 from public.writing_context_shadow_policy p join public.writing_context_advisory_control c on c.singleton
      where p.singleton and p.execution_policy_kind='DISPOSABLE_BOOTSTRAP' and c.ai_mode='shadow') then
    perform public.stop_writing_context_shadow('AI_CONFIGURATION_STOP'); return true;
  end if;
  return false;
end $$;
revoke all on function public.stop_failed_writing_context_bootstrap() from public,anon,authenticated;
grant execute on function public.stop_failed_writing_context_bootstrap() to service_role;

-- Never migrate into activation. Constraint requires leaving bootstrap before DENY.
update public.writing_context_advisory_control set enabled=false,ai_mode='disabled';
update public.writing_context_shadow_policy set execution_policy_kind='MEASURED',bootstrap_expires_at=null,dispatch_scope='DENY';
commit;
