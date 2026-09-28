begin;
create table public.writing_context_ai_rate_cards (
  version text primary key check(version ~ '^[A-Za-z0-9_.-]{1,80}$'),
  provider text not null check(provider='openai'), model text not null check(model='gpt-6-luna'),
  endpoint text not null check(endpoint='/v1/responses'), service_tier text not null check(service_tier='default'),
  currency text not null check(currency='USD'), unit_tokens integer not null check(unit_tokens=1000000),
  input_rate numeric(20,10) not null check(input_rate>=0),
  cached_input_rate numeric(20,10) not null check(cached_input_rate>=0),
  cache_write_rate numeric(20,10) not null check(cache_write_rate>=0),
  output_rate numeric(20,10) not null check(output_rate>=0),
  calculation_version text not null check(calculation_version='CONTEXT_COST_USD_V1'),
  effective_at timestamptz not null,
  source_url text not null check(source_url like 'https://developers.openai.com/%'),
  evidence_ref text not null check(evidence_ref ~ '^[A-Za-z0-9_./:-]{1,200}$'),
  approved_by uuid not null references auth.users(id),
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create function public.assert_context_rate_card() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
  if new.fingerprint<>encode(digest(concat_ws('|',new.version,new.provider,new.model,new.endpoint,new.service_tier,
    new.currency,new.unit_tokens::text,new.input_rate::text,new.cached_input_rate::text,new.cache_write_rate::text,
    new.output_rate::text,new.calculation_version),'sha256'),'hex') then raise exception 'rate_card_fingerprint_invalid'; end if;
  return new;
end $$;
create trigger context_rate_card_scope before insert on public.writing_context_ai_rate_cards
  for each row execute function public.assert_context_rate_card();
revoke all on function public.assert_context_rate_card() from public,anon,authenticated;
create trigger context_rate_card_immutable before update on public.writing_context_ai_rate_cards
  for each row execute function public.reject_writing_fact_update();
alter table public.writing_context_ai_rate_cards enable row level security;
revoke all on public.writing_context_ai_rate_cards from public,anon,authenticated;
grant select,insert on public.writing_context_ai_rate_cards to service_role;
alter table public.writing_context_shadow_policy add foreign key(rate_card_version) references public.writing_context_ai_rate_cards(version);
alter table public.writing_context_shadow_dispatches add foreign key(rate_card_version) references public.writing_context_ai_rate_cards(version);
-- Operational capacity has no learner/source linkage and survives their deletion.
-- The control lock serializes reservation/admission/settlement. All revisions in
-- the environment's UTC day count toward the current signed daily limits.
create table public.writing_context_shadow_consumption (
  environment text not null check(environment in ('staging','production')),
  budget_day date not null,
  policy_revision_id uuid not null references public.writing_context_shadow_policy_history(id),
  currency text not null default 'USD' check(currency='USD'),
  requests_reserved bigint not null default 0 check(requests_reserved>=0),
  requests_admitted bigint not null default 0 check(requests_admitted between 0 and requests_reserved),
  reserved_usd numeric(20,8) not null default 0 check(reserved_usd>=0),
  admitted_exposure_usd numeric(20,8) not null default 0 check(admitted_exposure_usd between 0 and reserved_usd),
  known_actual_usd numeric(20,8) not null default 0 check(known_actual_usd>=0),
  known_exposure_usd numeric(20,8) not null default 0 check(known_exposure_usd between 0 and admitted_exposure_usd),
  sequence bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(environment,budget_day,policy_revision_id)
);
alter table public.writing_context_shadow_consumption enable row level security;
revoke all on public.writing_context_shadow_consumption from public,anon,authenticated,service_role;
grant select on public.writing_context_shadow_consumption to service_role;
create function public.assert_context_shadow_consumption() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
  if tg_op='DELETE' then raise exception 'context_consumption_delete_denied'; end if;
  if (new.environment,new.budget_day,new.policy_revision_id,new.currency) is distinct from
    (old.environment,old.budget_day,old.policy_revision_id,old.currency)
    or new.requests_reserved<old.requests_reserved or new.requests_admitted<old.requests_admitted
    or new.reserved_usd<old.reserved_usd or new.admitted_exposure_usd<old.admitted_exposure_usd
    or new.known_actual_usd<old.known_actual_usd or new.known_exposure_usd<old.known_exposure_usd
    or new.sequence<>old.sequence+1 then raise exception 'context_consumption_nonmonotonic'; end if;
  new.updated_at:=clock_timestamp(); return new;
end $$;
create trigger context_shadow_consumption_monotonic before update or delete on public.writing_context_shadow_consumption
  for each row execute function public.assert_context_shadow_consumption();
revoke all on function public.assert_context_shadow_consumption() from public,anon,authenticated;
alter table public.writing_context_shadow_dispatches
  add column budget_environment text not null,
  add column budget_day date not null,
  add column budget_cost_recorded boolean not null default false,
  add foreign key(budget_environment,budget_day,policy_revision_id)
    references public.writing_context_shadow_consumption(environment,budget_day,policy_revision_id);

-- Legacy immutable Stage 0 facts remain version 0. All new facts are version 1.
alter table public.writing_context_ai_attempts add column record_version integer not null default 0;
alter table public.writing_context_ai_attempts alter column record_version set default 1;
alter table public.writing_context_ai_attempts
  add column dispatch_id uuid unique references public.writing_context_shadow_dispatches(id) on delete cascade,
  add column rate_card_version text references public.writing_context_ai_rate_cards(version),
  add column rate_card_fingerprint text,
  add column runtime_fingerprint text,
  add column reasoning_tokens integer check(reasoning_tokens>=0),
  add column cache_write_tokens integer check(cache_write_tokens>=0),
  add column service_tier text,
  add column provider_response_id text,
  add column currency text,
  add column unit_tokens integer,
  add column calculation_version text,
  add column request_started_at timestamptz,
  add column transport_started_at timestamptz,
  add column transport_attempted boolean,
  add column response_received_at timestamptz,
  add column billing_status text check(billing_status in ('KNOWN','UNKNOWN','NOT_SENT')),
  add column failure_kind text check(failure_kind in ('provider','timeout','contract','gate','configuration','none')),
  add column completed_after_disable boolean,
  add column eligible_at_worker_check boolean,
  add constraint context_stage1_fact check(record_version in (0,1) and (record_version=0 or (
    mode='shadow' and (not provider_called or dispatch_id is not null)
    and (transport_attempted is not true or provider_called)
    and (provider_called or result_status='NOT_ASSESSED'))));
create function public.assert_context_stage1_attempt() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.writing_context_shadow_dispatches%rowtype; j public.writing_context_shadow_jobs%rowtype;
  c public.writing_context_ai_rate_cards%rowtype; begin
  if new.record_version<>1 then raise exception 'new_context_fact_version_invalid'; end if;
  -- Acquire control before receipt FK locks, matching admission's lock order.
  if new.dispatch_id is not null then
    perform 1 from public.writing_context_advisory_control where singleton for update;
  end if;
  if new.runtime_fingerprint is null or new.runtime_fingerprint !~ '^[a-f0-9]{64}$'
    or new.prompt_fingerprint !~ '^[a-f0-9]{64}$' or new.schema_fingerprint !~ '^[a-f0-9]{64}$'
    or new.config_fingerprint !~ '^[a-f0-9]{64}$' or new.gate_version<>'CONTEXT_AI_SAFETY_GATE_V1'
    then raise exception 'context_attempt_provenance_invalid'; end if;
  if not exists(select 1 from public.writing_context_detector_members m where m.run_id=new.detector_run_id
    and m.occurrence_id=new.occurrence_id and m.family_key=new.family_key) then raise exception 'context_attempt_membership_invalid'; end if;
  if new.dispatch_id is not null then
    select * into d from public.writing_context_shadow_dispatches where id=new.dispatch_id;
    select * into j from public.writing_context_shadow_jobs where id=d.job_id;
    select * into c from public.writing_context_ai_rate_cards where version=d.rate_card_version;
    if d.id is null or d.occurrence_id<>new.occurrence_id or d.detector_run_id<>new.detector_run_id
      or j.snapshot_id<>new.snapshot_id or j.run_key<>new.run_key or d.state not in ('sent','finished','abandoned','cancelled')
      or new.window_fingerprint is distinct from d.window_fingerprint then raise exception 'context_dispatch_lineage_invalid'; end if;
    if new.model<>c.model or new.provider<>c.provider or not exists(select 1 from public.writing_context_provider_approvals a
      where a.id=d.provider_approval_id and a.config_fingerprint=new.config_fingerprint and a.runtime_fingerprint=new.runtime_fingerprint)
      then raise exception 'context_dispatch_configuration_invalid'; end if;
    new.provider_called:=d.sent_at is not null;
    new.rate_card_version:=c.version; new.rate_card_fingerprint:=c.fingerprint; new.pricing_version:=c.version;
    new.currency:=c.currency; new.unit_tokens:=c.unit_tokens; new.calculation_version:=c.calculation_version;
    new.request_started_at:=d.sent_at;
    if new.input_tokens is not null and new.cached_input_tokens is not null and new.output_tokens is not null
      and new.reasoning_tokens is not null and new.cache_write_tokens is not null
      and new.cached_input_tokens+new.cache_write_tokens<=new.input_tokens and new.reasoning_tokens<=new.output_tokens
      and new.returned_model=c.model and new.service_tier=c.service_tier then
      new.calculated_cost_usd:=round(((new.input_tokens-new.cached_input_tokens-new.cache_write_tokens)*c.input_rate
        +new.cached_input_tokens*c.cached_input_rate+new.cache_write_tokens*c.cache_write_rate
        +new.output_tokens*c.output_rate)/c.unit_tokens,8);
      new.billing_status:='KNOWN';
    else new.calculated_cost_usd:=null; new.billing_status:=case when new.provider_called then 'UNKNOWN' else 'NOT_SENT' end;
    end if;
    new.completed_after_disable:=not exists(select 1 from public.writing_context_advisory_control where singleton and ai_mode='shadow' and not enabled);
  else
    if new.provider_called or new.calculated_cost_usd is not null then raise exception 'context_uncalled_cost_invalid'; end if;
    new.billing_status:='NOT_SENT';
  end if;
  return new;
end $$;
-- AFTER INSERT plus a dispatch marker: receipt replay/deletion cannot settle twice.
-- Known usage classifies exposure for monitoring; it never refunds capacity.
create function public.settle_context_shadow_consumption() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.writing_context_shadow_dispatches%rowtype; begin
  if new.record_version<>1 or not new.provider_called or new.billing_status<>'KNOWN' then return new; end if;
  perform 1 from public.writing_context_advisory_control where singleton for update;
  update public.writing_context_shadow_dispatches set budget_cost_recorded=true
    where id=new.dispatch_id and not budget_cost_recorded returning * into d;
  if not found then return new; end if;
  update public.writing_context_shadow_consumption set known_actual_usd=known_actual_usd+new.calculated_cost_usd,
    known_exposure_usd=known_exposure_usd+d.reserved_cost_usd,sequence=sequence+1
    where environment=d.budget_environment and budget_day=d.budget_day and policy_revision_id=d.policy_revision_id;
  if not found then raise exception 'context_consumption_missing'; end if;
  return new;
end $$;
create trigger context_shadow_consumption_settlement after insert on public.writing_context_ai_attempts
  for each row execute function public.settle_context_shadow_consumption();
revoke all on function public.settle_context_shadow_consumption() from public,anon,authenticated;

-- Read-only governance check for the coverage denominator, before per-submission/global caps.
-- Final dispatch still repeats current eligibility under the kill-switch lock.
create function public.context_shadow_job_eligible(p_job_id uuid,p_claim_token uuid,p_environment text,p_project_ref text,
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
create trigger context_stage1_attempt before insert on public.writing_context_ai_attempts
  for each row execute function public.assert_context_stage1_attempt();
revoke all on function public.assert_context_stage1_attempt() from public,anon,authenticated;

-- Both reservation and final admission serialize with the existing kill switch.
create function public.reserve_writing_context_shadow(p_job_id uuid,p_claim_token uuid,p_occurrence_id text,
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
create function public.begin_writing_context_shadow_dispatch(p_dispatch_id uuid,p_claim_token uuid) returns boolean
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
create function public.finish_writing_context_shadow_dispatch(p_dispatch_id uuid,p_claim_token uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  update public.writing_context_shadow_dispatches d set state=case when sent_at is null then 'cancelled' else 'finished' end,
    finished_at=clock_timestamp() from public.writing_context_shadow_jobs j
    where d.id=p_dispatch_id and j.id=d.job_id and j.claim_token=p_claim_token and j.status='processing'
    and d.state in ('reserved','sent','cancelled'); return found;
end $$;
revoke all on function public.reserve_writing_context_shadow(uuid,uuid,text,uuid,text,integer,text,text,text,text,text,text),
  public.begin_writing_context_shadow_dispatch(uuid,uuid),public.finish_writing_context_shadow_dispatch(uuid,uuid),
  public.context_shadow_job_eligible(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_writing_context_shadow(uuid,uuid,text,uuid,text,integer,text,text,text,text,text,text),
  public.begin_writing_context_shadow_dispatch(uuid,uuid),public.finish_writing_context_shadow_dispatch(uuid,uuid),
  public.context_shadow_job_eligible(uuid,uuid,text,text,text,text,text,text) to service_role;
commit;
