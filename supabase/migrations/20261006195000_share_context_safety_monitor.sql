-- Replace the historical $0.50 ceiling with the separately approved measured
-- request count times signed worst-case reservation. No policy values change.
alter table public.writing_context_shadow_policy drop constraint context_adult_daily_spend_cap;
alter table public.writing_context_shadow_policy add constraint context_adult_daily_spend_cap
  check (dispatch_scope<>'REAL_LEARNER' or (max_requests_per_day is not null
    and max_usd_per_request is not null and max_usd_per_day is not null
    and max_usd_per_day>=max_requests_per_day*max_usd_per_request and max_concurrent=1));

create or replace function public.context_shadow_execution_ready(p_revision uuid,p_dispatch uuid default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; a public.writing_context_provider_approvals%rowtype; begin
  select * into p from public.writing_context_shadow_policy where singleton and revision_id=p_revision;
  if p.singleton is null or exists(select 1 from public.writing_context_bootstrap_failures where provider_approval_id=p.provider_approval_id) then return false; end if;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  if a.id is null or not a.data_sharing_disabled
    or (p.dispatch_scope='REAL_LEARNER' and (a.retention_mode<>'STANDARD_API' or a.zdr_verified))
    or a.expires_at<=clock_timestamp()
    or exists(select 1 from public.writing_context_approval_revocations where provider_approval_id=a.id)
    then return false; end if;
  if p.execution_policy_kind='MEASURED' then
    return p.thresholds ?& array['window_seconds','minimum_calls','error_rate','timeout_rate','malformed_rate','gate_failure_rate','p95_ms','max_queue_age_seconds'];
  end if;
  if p.execution_policy_kind='ADULT_RELEASE' then
    return p.dispatch_scope='REAL_LEARNER' and a.dispatch_scope='REAL_LEARNER'
      and a.environment in ('production','staging') and p.approved_by is not null and p.evidence_ref is not null
      and p.rate_card_version is not null and p.learner_policy_version is not null
      and p.max_concurrent=1 and p.max_requests_per_day>0
      and p.max_usd_per_day>0 and p.max_usd_per_day>=p.max_requests_per_day*p.max_usd_per_request
      and p.max_usd_per_request>0 and p.max_usd_per_request<=p.max_usd_per_day
      and not exists(select 1 from public.writing_context_shadow_dispatches d
        where d.budget_environment=a.environment and (p_dispatch is null or d.id<>p_dispatch)
          and d.sent_at<clock_timestamp()-interval '60 seconds' and not exists(
            select 1 from public.writing_context_ai_attempts x where x.dispatch_id=d.id))
      and not exists(select 1 from public.adle_review_context_dispatches d
        where d.budget_environment=a.environment and (p_dispatch is null or d.id<>p_dispatch)
          and d.sent_at<clock_timestamp()-interval '60 seconds' and not exists(
            select 1 from public.adle_review_context_attempts x where x.dispatch_id=d.id));
  end if;
  if p.dispatch_scope<>'DISPOSABLE_PROVIDER_PROOF' or a.dispatch_scope is distinct from p.dispatch_scope
    or a.environment is distinct from 'production'
    or p.bootstrap_expires_at<=clock_timestamp() or p.approved_by is null or p.evidence_ref is null
    or p.max_concurrent<>1 or p.max_requests_per_day is null or p.max_usd_per_day is null or p.max_usd_per_request is null
    or p.rate_card_version is null or p.learner_policy_version is null
    or exists(select 1 from public.writing_context_bootstrap_failures where provider_approval_id=a.id)
    then return false; end if;
  if exists(select 1 from public.writing_context_shadow_dispatches d where d.budget_environment='production'
      and (p_dispatch is null or d.id<>p_dispatch) and
      (d.state in ('reserved','sent') or d.sent_at is not null and not exists(
        select 1 from public.writing_context_ai_attempts x where x.dispatch_id=d.id))) then return false; end if;
  return true;
end $$;

create or replace function public.monitor_writing_context_shadow() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; o jsonb; t jsonb; n numeric; v_now timestamptz:=clock_timestamp(); begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.execution_policy_kind='MEASURED' and not public.context_shadow_execution_ready(p.revision_id) then return false; end if;
  if p.execution_policy_kind in ('DISPOSABLE_BOOTSTRAP','ADULT_RELEASE') and not public.context_shadow_execution_ready(p.revision_id) then
    perform public.stop_writing_context_shadow('AI_OPERATIONAL_THRESHOLD_STOP'); return false; end if;
  o:=public.writing_context_shadow_operations_for_scope(v_now-make_interval(secs=>case when p.execution_policy_kind in ('DISPOSABLE_BOOTSTRAP','ADULT_RELEASE') then 2678400 else (p.thresholds->>'window_seconds')::integer end),v_now,p.dispatch_scope);
  if (o->>'unrecorded_sends')::integer>0 then
    perform public.stop_writing_context_shadow('AI_MISSING_PROVENANCE_STOP'); return false; end if;
  if exists(select 1 from public.adle_review_context_dispatches d
      where d.provider_approval_id=p.provider_approval_id and d.sent_at is not null
        and d.reserved_at<v_now-interval '60 seconds'
        and not exists(select 1 from public.adle_review_context_attempts a where a.dispatch_id=d.id)) then
    perform public.stop_writing_context_shadow('AI_MISSING_PROVENANCE_STOP'); return false; end if;
  if exists(select 1 from public.adle_review_context_attempts a
      join public.adle_review_context_dispatches d on d.id=a.dispatch_id
      where d.provider_approval_id=p.provider_approval_id and
        (a.calculated_cost_usd>d.reserved_cost_usd
          or a.returned_model is not null and a.returned_model<>'gpt-6-luna')) then
    perform public.stop_writing_context_shadow('AI_CONFIGURATION_STOP'); return false; end if;
  if exists(select 1 from public.writing_context_ai_attempts a join public.writing_context_shadow_dispatches d on d.id=a.dispatch_id
    where a.record_version=1 and d.provider_approval_id=p.provider_approval_id and (a.calculated_cost_usd>d.reserved_cost_usd or a.returned_model is not null and a.returned_model<>a.model
      or a.service_tier is not null and a.service_tier<>'default' or a.cache_write_tokens>0 or a.cached_input_tokens>0)) then
    perform public.stop_writing_context_shadow('AI_CONFIGURATION_STOP'); return false; end if;
  if p.execution_policy_kind in ('DISPOSABLE_BOOTSTRAP','ADULT_RELEASE') then return true; end if;
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
