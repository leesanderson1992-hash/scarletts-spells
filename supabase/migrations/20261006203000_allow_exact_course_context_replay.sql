-- Historical provider calls require a source-specific immutable grant.
create or replace function public.reserve_writing_context_shadow(p_job_id uuid,p_claim_token uuid,p_occurrence_id text,
  p_detector_run_id uuid,p_window_fingerprint text,p_request_bytes integer,p_environment text,p_project_ref text,
  p_deployment_sha text,p_config_fingerprint text,p_runtime_fingerprint text,p_rate_card_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ctl public.writing_context_advisory_control%rowtype; p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype; s public.writing_source_snapshots%rowtype;
  j public.writing_context_shadow_jobs%rowtype; l uuid; v_id uuid; v_count bigint; v_cost numeric; v_day date; begin
  if p_request_bytes is null or p_request_bytes not between 1 and 16000 then
    return jsonb_build_object('reason','AI_REQUEST_TOO_LARGE');
  end if;
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
  if j.id is null or s.id is null or not ((s.occurred_at>=ctl.updated_at and s.occurred_at>=a.approved_at
      and s.envelope->>'contextAiModeAtCapture'='shadow'
      and s.envelope->>'contextAiShadowCapture'='true'
      and s.envelope->>'contextAdvisoryCapture'='false')
      or public.course_context_replay_authorised(s.id))
    or not exists(select 1 from public.task_submissions t join public.course_tasks k on k.id=t.task_id
      where t.id=s.submission_id and t.parent_user_id=s.parent_user_id and t.child_id=s.child_id
      and t.parent_review_status='pending' and k.task_type='lesson' and k.parent_user_id=s.parent_user_id
      and not exists(select 1 from public.task_submissions newer where newer.task_id=t.task_id
        and newer.child_id=t.child_id and newer.submitted_at>t.submitted_at))
    then return jsonb_build_object('reason','AI_SOURCE_INELIGIBLE'); end if;
  select x.id into l from public.writing_context_learner_authorisations x
    join public.children ch on ch.id=x.child_id and ch.parent_user_id=x.parent_user_id
    where x.child_id=s.child_id and x.parent_user_id=s.parent_user_id and x.policy_version=p.learner_policy_version
    and (x.approved_at<=s.occurred_at or public.course_context_replay_authorised(s.id)) and x.expires_at>clock_timestamp()
    and not exists(select 1 from public.writing_context_approval_revocations r where r.learner_authorisation_id=x.id)
    order by x.approved_at desc limit 1;
  if not (public.context_shadow_scope_authorised(s.id,l) or public.course_context_replay_authorised(s.id)) then return jsonb_build_object('reason','AI_PROOF_SCOPE_DENIED'); end if;
  if l is null then return jsonb_build_object('reason','AI_LEARNER_NOT_AUTHORISED'); end if;
  if not exists(select 1 from public.writing_occurrences o join public.writing_context_detector_members m on m.occurrence_id=o.id
    join public.writing_context_detector_runs r on r.id=m.run_id where o.id=p_occurrence_id and o.snapshot_id=s.id
    and o.provenance='learner_response' and m.run_id=p_detector_run_id and r.snapshot_id=s.id and r.run_key=j.run_key
    and (r.detector_version='CONTEXT_ROUTING_FOUR_FAMILY_V1' and r.registry_version='CONTEXT_FOUR_FAMILY_V1' or r.detector_version='CONTEXT_PASSAGE_WINDOW_V1' and r.registry_version='CONTEXT_PASSAGE_SCAN_V1')
    and r.run_status='COMPLETE') then return jsonb_build_object('reason','AI_OCCURRENCE_INELIGIBLE'); end if;
  if exists(select 1 from public.writing_context_shadow_dispatches where job_id=j.id and occurrence_id=p_occurrence_id)
    then return jsonb_build_object('reason','AI_ALREADY_RESERVED'); end if;
  if exists(select 1 from public.writing_context_ai_rate_cards c where c.version=p.rate_card_version
    and (16000*greatest(c.input_rate,c.cached_input_rate,c.cache_write_rate)+2048*c.output_rate)/c.unit_tokens>p.max_usd_per_request)
    then return jsonb_build_object('reason','AI_REQUEST_COST_CAP_TOO_SMALL'); end if;
  select coalesce(sum(requests_reserved),0),coalesce(sum(reserved_usd),0) into v_count,v_cost
    from public.writing_context_shadow_consumption where environment=a.environment and budget_day=v_day;
  if v_count>=p.max_requests_per_day or v_cost+p.max_usd_per_request>p.max_usd_per_day then
    return jsonb_build_object('reason','AI_DAILY_CAP_DEFERRED'); end if;
  if public.course_context_replay_authorised(s.id)
    and (exists(select 1 from public.writing_context_shadow_jobs q
      where q.status in ('pending','deferred') and not exists(select 1
        from public.course_context_replay_grants g where g.snapshot_id=q.snapshot_id))
      or exists(select 1 from public.adle_review_context_jobs q
        join public.adle_review_context_sources x on x.id=q.source_id
        where q.status in ('pending','deferred') and x.capture_mode='shadow'))
    and ((select count(*) from public.writing_context_shadow_dispatches d
      join public.writing_context_shadow_jobs q on q.id=d.job_id
      join public.course_context_replay_grants g on g.snapshot_id=q.snapshot_id
      where d.budget_day=v_day)
      +(select count(*) from public.adle_review_context_dispatches d
        join public.adle_review_context_jobs q on q.id=d.job_id
        join public.adle_review_context_replay_grants g on g.source_id=q.source_id
        where d.budget_day=v_day))>=ceil(p.max_requests_per_day*0.25)
    then return jsonb_build_object('reason','AI_DAILY_CAP_DEFERRED'); end if;
  if (select count(*) from public.writing_context_shadow_dispatches where job_id=j.id)>=32
    then return jsonb_build_object('reason','AI_SUBMISSION_LIMIT'); end if;
  if exists(select 1 from public.writing_context_shadow_dispatches where state in ('reserved','sent')
    and reserved_at>clock_timestamp()-interval '60 seconds')
    or exists(select 1 from public.adle_review_context_dispatches where state in ('reserved','sent')
    and reserved_at>clock_timestamp()-interval '60 seconds')
    then return jsonb_build_object('reason','AI_GLOBAL_CONCURRENCY_LIMIT'); end if;
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
      and (public.context_shadow_scope_authorised(s.id) or public.course_context_replay_authorised(s.id))
      and not ctl.enabled and ctl.ai_mode='shadow' and ((s.occurred_at>=ctl.updated_at and s.occurred_at>=a.approved_at) or public.course_context_replay_authorised(s.id))
      and ((s.envelope->>'contextAiModeAtCapture'='shadow' and s.envelope->>'contextAiShadowCapture'='true'
      and s.envelope->>'contextAdvisoryCapture'='false') or public.course_context_replay_authorised(s.id)) and t.parent_review_status='pending'
      and t.parent_user_id=s.parent_user_id and t.child_id=s.child_id and k.parent_user_id=s.parent_user_id and k.task_type='lesson'
      and not exists(select 1 from public.task_submissions newer where newer.task_id=t.task_id and newer.child_id=t.child_id and newer.submitted_at>t.submitted_at)
      and a.environment=p_environment and a.project_ref=p_project_ref and a.deployment_sha=p_deployment_sha
      and a.config_fingerprint=p_config_fingerprint and a.runtime_fingerprint=p_runtime_fingerprint
      and a.expires_at>clock_timestamp() and c.fingerprint=p_rate_card_fingerprint and c.effective_at<=clock_timestamp()
      and not exists(select 1 from public.writing_context_approval_revocations r where r.provider_approval_id=a.id)
      and exists(select 1 from public.writing_context_learner_authorisations l where l.child_id=s.child_id and l.parent_user_id=s.parent_user_id
        and l.policy_version=p.learner_policy_version and (l.approved_at<=s.occurred_at or public.course_context_replay_authorised(s.id)) and l.expires_at>clock_timestamp()
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
      and t.parent_review_status='pending' and k.task_type='lesson' and k.parent_user_id=s.parent_user_id
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
      and k.task_type='lesson' and not exists(select 1 from public.task_submissions newer
        where newer.task_id=t.task_id and newer.child_id=t.child_id and newer.submitted_at>t.submitted_at)
      and (public.context_shadow_scope_authorised(s.id,d.learner_authorisation_id) or public.course_context_replay_authorised(s.id))
      and (s.occurred_at>=ctl.updated_at or public.course_context_replay_authorised(s.id)) and not ctl.enabled and ctl.ai_mode='shadow'
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
