begin;
create table public.writing_context_shadow_stops (
  id uuid primary key default gen_random_uuid(),
  code text not null check(code ~ '^[A-Z0-9_]{1,80}$'),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.writing_context_shadow_stops enable row level security;
revoke all on public.writing_context_shadow_stops from public,anon,authenticated;
grant select on public.writing_context_shadow_stops to service_role;
create function public.stop_writing_context_shadow(p_code text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; begin
  if p_code not in ('AI_MODEL_IDENTITY_STOP','AI_CONFIGURATION_STOP','AI_MISSING_PROVENANCE_STOP',
    'AI_OPERATIONAL_THRESHOLD_STOP','AI_COST_STOP','AI_PRIVACY_STOP','AI_VISIBILITY_STOP','AI_LEARNING_MUTATION_STOP')
    then raise exception 'shadow_stop_code_invalid'; end if;
  select approved_by into actor from public.writing_context_shadow_policy where singleton;
  -- This always disables, even before an operator approval exists.
  update public.writing_context_advisory_control set enabled=false,ai_mode='disabled',updated_by=actor where singleton;
  insert into public.writing_context_shadow_stops(code) values(p_code);
  return true;
end $$;
create function public.assert_context_shadow_thresholds() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare k text; begin
  if new.thresholds='{}'::jsonb then return new; end if;
  if not(new.thresholds ?& array['window_seconds','minimum_calls','error_rate','timeout_rate','malformed_rate','gate_failure_rate','p95_ms','max_queue_age_seconds'])
    then raise exception 'shadow_thresholds_incomplete'; end if;
  foreach k in array array['window_seconds','minimum_calls','p95_ms','max_queue_age_seconds'] loop
    if jsonb_typeof(new.thresholds->k)<>'number' or (new.thresholds->>k)::numeric<=0
      or mod((new.thresholds->>k)::numeric,1)<>0 then raise exception 'shadow_threshold_invalid'; end if;
  end loop;
  foreach k in array array['error_rate','timeout_rate','malformed_rate','gate_failure_rate'] loop
    if jsonb_typeof(new.thresholds->k)<>'number' or (new.thresholds->>k)::numeric<0 or (new.thresholds->>k)::numeric>1
      then raise exception 'shadow_threshold_invalid'; end if;
  end loop;
  if (new.thresholds->>'window_seconds')::numeric>2678400 then raise exception 'shadow_window_too_large'; end if;
  return new;
end $$;
create trigger context_shadow_thresholds before update on public.writing_context_shadow_policy
  for each row execute function public.assert_context_shadow_thresholds();
revoke all on function public.assert_context_shadow_thresholds() from public,anon,authenticated;

create function public.writing_context_shadow_operations(p_since timestamptz,p_until timestamptz) returns jsonb
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
    into v_totals from public.writing_context_ai_attempts where record_version=1 and created_at>=p_since and created_at<p_until;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_families from (
    select family_key,result_status,reason_code,model,returned_model,rate_card_version,count(*) as attempts,
      count(*) filter(where provider_called) as provider_calls from public.writing_context_ai_attempts
    where record_version=1 and created_at>=p_since and created_at<p_until
    group by family_key,result_status,reason_code,model,returned_model,rate_card_version
    order by family_key,result_status,reason_code) x;
  return jsonb_build_object('since',p_since,'until',p_until,'totals',v_totals,'groups',v_families,
    'eligible_detector_occurrences',(select coalesce(sum(r.surfaced_count),0) from public.writing_context_detector_runs r
      join public.writing_context_shadow_jobs j on j.snapshot_id=r.snapshot_id and j.run_key=r.run_key
      where r.created_at>=p_since and r.created_at<p_until),
    'routing_excluded',(select coalesce(sum((summary->>'routing_excluded')::integer),0) from public.writing_context_shadow_jobs
      where created_at>=p_since and created_at<p_until),
    'failed_jobs',(select count(*) from public.writing_context_shadow_jobs where status='failed' and created_at>=p_since and created_at<p_until),
    'pending_jobs',(select count(*) from public.writing_context_shadow_jobs j
      join public.writing_source_snapshots s on s.id=j.snapshot_id join public.writing_context_advisory_control c on c.singleton
      where j.status in ('pending','processing') and s.occurred_at>=c.updated_at),
    'oldest_queue_seconds',(select coalesce(max(extract(epoch from clock_timestamp()-j.created_at)),0)
      from public.writing_context_shadow_jobs j join public.writing_source_snapshots s on s.id=j.snapshot_id
      join public.writing_context_advisory_control c on c.singleton where j.status in ('pending','processing') and s.occurred_at>=c.updated_at),
    'unrecorded_sends',(select count(*) from public.writing_context_shadow_dispatches d
      join public.writing_context_shadow_jobs j on j.id=d.job_id
      where d.sent_at is not null and (d.state in ('finished','abandoned') or j.status='failed'
        or d.state='sent' and d.sent_at<clock_timestamp()-interval '60 seconds')
      and not exists(select 1 from public.writing_context_ai_attempts a where a.dispatch_id=d.id)),
    'reserved_exposure_usd',(select coalesce(sum(reserved_usd),0) from public.writing_context_shadow_consumption
      where budget_day>=(p_since at time zone 'UTC')::date and budget_day<=(p_until at time zone 'UTC')::date),
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
create function public.monitor_writing_context_shadow() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; o jsonb; t jsonb; n numeric; begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.thresholds='{}'::jsonb then return false; end if;
  o:=public.writing_context_shadow_operations(clock_timestamp()-make_interval(secs=>(p.thresholds->>'window_seconds')::integer),clock_timestamp());
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
revoke all on function public.stop_writing_context_shadow(text),public.writing_context_shadow_operations(timestamptz,timestamptz),
  public.monitor_writing_context_shadow() from public,anon,authenticated;
grant execute on function public.stop_writing_context_shadow(text),public.writing_context_shadow_operations(timestamptz,timestamptz),
  public.monitor_writing_context_shadow() to service_role;
-- Migrations always finish with both switches disabled, independent of prior state.
update public.writing_context_advisory_control set enabled=false,ai_mode='disabled';
commit;
