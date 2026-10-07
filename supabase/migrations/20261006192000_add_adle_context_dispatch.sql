-- All provider admission uses the course resolver's locked control, approval,
-- rate card, consumption counter and emergency stop.
create function public.claim_adle_review_context_job(p_review_session_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.adle_review_context_jobs%rowtype;
begin
  update public.adle_review_context_jobs set status='failed',
    error_code='AI_CLAIM_RETRIES_EXHAUSTED',completed_at=clock_timestamp()
    where status='processing' and claim_count>=8
      and claimed_at<clock_timestamp()-interval '60 seconds';
  select q.* into j from public.adle_review_context_jobs q
    join public.adle_review_context_sources s on s.id=q.source_id
    where (p_review_session_id is null or s.review_session_id=p_review_session_id)
      and (q.status='pending' or q.status='deferred' and q.next_eligible_at<=clock_timestamp()
        or q.status='processing' and q.claimed_at<clock_timestamp()-interval '60 seconds')
      and q.claim_count<8 order by q.created_at for update of q skip locked limit 1;
  if j.id is null then return null; end if;
  update public.adle_review_context_dispatches set state='abandoned',finished_at=clock_timestamp()
    where job_id=j.id and state in ('reserved','sent');
  update public.adle_review_context_jobs set status='processing',claim_token=gen_random_uuid(),
    claimed_at=clock_timestamp(),next_eligible_at=null,
    claim_count=claim_count+case when j.status='deferred' then 0 else 1 end
    where id=j.id returning * into j;
  return to_jsonb(j);
end $$;

create function public.finish_adle_review_context_job(p_job_id uuid,p_claim_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.adle_review_context_jobs set status=case when p_error_code is null then 'complete' else 'failed' end,
    error_code=p_error_code,completed_at=clock_timestamp(),claim_token=null,claimed_at=null
    where id=p_job_id and claim_token=p_claim_token and status='processing';
  return found;
end $$;

create function public.defer_adle_review_context_job(p_job_id uuid,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.adle_review_context_jobs set status='deferred',
    next_eligible_at=(date_trunc('day',clock_timestamp() at time zone 'UTC') + interval '1 day') at time zone 'UTC',
    claim_token=null,claimed_at=null
    where id=p_job_id and claim_token=p_claim_token and status='processing'
      and not exists(select 1 from public.adle_review_context_dispatches d
        where d.job_id=p_job_id and d.state in ('reserved','sent'));
  return found;
end $$;

create function public.reserve_adle_review_context_window(
  p_job_id uuid,p_claim_token uuid,p_window_fingerprint text,p_request_bytes integer,
  p_environment text,p_project_ref text,p_deployment_sha text,p_config_fingerprint text,
  p_runtime_fingerprint text,p_rate_card_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ctl public.writing_context_advisory_control%rowtype;
  p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype;
  j public.adle_review_context_jobs%rowtype;
  s public.adle_review_context_sources%rowtype;
  l uuid; v_id uuid; v_count bigint; v_cost numeric; v_day date; v_replay boolean;
begin
  if p_request_bytes is null or p_request_bytes not between 1 and 16000
    or p_window_fingerprint !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('reason','AI_REQUEST_INVALID'); end if;
  select * into ctl from public.writing_context_advisory_control where singleton for update;
  if ctl.singleton is null or ctl.enabled or ctl.ai_mode<>'shadow' then
    return jsonb_build_object('reason','AI_CONTROL_DISABLED'); end if;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.provider_approval_id is null or p.revision_id is null or p.rate_card_version is null
    or p.max_requests_per_day is null or p.max_usd_per_day is null or p.max_usd_per_request is null
    or p.execution_policy_kind<>'ADULT_RELEASE' or p.dispatch_scope<>'REAL_LEARNER'
    or not public.context_shadow_execution_ready(p.revision_id) then
    return jsonb_build_object('reason','AI_POLICY_UNAPPROVED'); end if;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  if a.id is null or a.approved_at>clock_timestamp() or a.expires_at<=clock_timestamp()
    or a.environment<>p_environment or a.project_ref<>p_project_ref or a.deployment_sha<>p_deployment_sha
    or a.config_fingerprint<>p_config_fingerprint or a.runtime_fingerprint<>p_runtime_fingerprint
    or a.dispatch_scope<>'REAL_LEARNER' or a.retention_mode<>'STANDARD_API'
    or exists(select 1 from public.writing_context_approval_revocations r where r.provider_approval_id=a.id)
    then return jsonb_build_object('reason','AI_PROVIDER_APPROVAL_UNAVAILABLE'); end if;
  if not exists(select 1 from public.writing_context_ai_rate_cards c where c.version=p.rate_card_version
    and c.fingerprint=p_rate_card_fingerprint and c.effective_at<=clock_timestamp()
    and (16000*greatest(c.input_rate,c.cached_input_rate,c.cache_write_rate)+2048*c.output_rate)
      /c.unit_tokens<=p.max_usd_per_request) then
    return jsonb_build_object('reason','AI_RATE_CARD_MISMATCH'); end if;
  select * into j from public.adle_review_context_jobs where id=p_job_id and claim_token=p_claim_token
    and status='processing' and claimed_at>clock_timestamp()-interval '60 seconds' for update;
  select * into s from public.adle_review_context_sources where id=j.source_id;
  if j.id is null or s.id is null or s.source_hash<>
      encode(extensions.digest(convert_to(s.submitted_text,'UTF8'),'sha256'),'hex')
    or not exists(select 1 from public.adle_review_sessions r
      join public.children ch on ch.id=r.child_id and ch.parent_user_id=r.parent_user_id
      where r.id=s.review_session_id and r.submitted_writing_text=s.submitted_text
        and r.child_id=s.child_id and r.parent_user_id=s.parent_user_id
        and r.writing_submitted_at=s.submitted_at)
    or public.context_provider_proof_child(s.child_id)
    then return jsonb_build_object('reason','AI_SOURCE_INELIGIBLE'); end if;
  v_replay:=exists(select 1 from public.adle_review_context_replay_grants g
    where g.source_id=s.id and g.source_hash=s.source_hash and g.expires_at>clock_timestamp());
  if not (s.capture_mode='shadow' and s.submitted_at>=ctl.updated_at
      and s.submitted_at>=a.approved_at and s.capture_policy_revision_id=p.revision_id)
    and not (v_replay and exists(select 1 from public.adle_review_context_replay_grants g
      where g.source_id=s.id and g.source_hash=s.source_hash and g.expires_at>clock_timestamp())
      and not exists(select 1 from public.adle_review_parent_reviews r where r.review_session_id=s.review_session_id))
    then return jsonb_build_object('reason','AI_SOURCE_INELIGIBLE'); end if;
  select x.id into l from public.writing_context_learner_authorisations x
    where x.child_id=s.child_id and x.parent_user_id=s.parent_user_id
      and x.policy_version=p.learner_policy_version and x.authorisation_kind='ADULT_SUBMISSION'
      and x.approved_by=s.parent_user_id and x.expires_at>clock_timestamp()
      and (v_replay or x.approved_at<=s.submitted_at)
      and not exists(select 1 from public.writing_context_approval_revocations r
        where r.learner_authorisation_id=x.id)
    order by x.approved_at desc limit 1;
  if l is null then return jsonb_build_object('reason','AI_LEARNER_NOT_AUTHORISED'); end if;
  if exists(select 1 from public.adle_review_context_dispatches d where d.job_id=j.id
    and d.window_fingerprint=p_window_fingerprint) then
    return jsonb_build_object('reason','AI_ALREADY_RESERVED'); end if;
  if (select count(*) from public.adle_review_context_dispatches where job_id=j.id)>=3 then
    return jsonb_build_object('reason','AI_SUBMISSION_LIMIT'); end if;
  if exists(select 1 from public.writing_context_shadow_dispatches d where d.state in ('reserved','sent')
      and d.reserved_at>clock_timestamp()-interval '60 seconds')
    or exists(select 1 from public.adle_review_context_dispatches d where d.state in ('reserved','sent')
      and d.reserved_at>clock_timestamp()-interval '60 seconds') then
    return jsonb_build_object('reason','AI_GLOBAL_CONCURRENCY_LIMIT'); end if;
  v_day:=(clock_timestamp() at time zone 'UTC')::date;
  select coalesce(sum(requests_reserved),0),coalesce(sum(reserved_usd),0) into v_count,v_cost
    from public.writing_context_shadow_consumption where environment=a.environment and budget_day=v_day;
  if v_count>=p.max_requests_per_day or v_cost+p.max_usd_per_request>p.max_usd_per_day then
    return jsonb_build_object('reason','AI_DAILY_CAP_DEFERRED'); end if;
  if v_replay and (exists(select 1 from public.adle_review_context_jobs q
      join public.adle_review_context_sources x on x.id=q.source_id
      where q.status in ('pending','deferred') and x.capture_mode='shadow')
    or exists(select 1 from public.writing_context_shadow_jobs q
      where q.status in ('pending','deferred') and not exists(select 1
        from public.course_context_replay_grants g where g.snapshot_id=q.snapshot_id)))
    and ((select count(*) from public.adle_review_context_dispatches d
      join public.adle_review_context_jobs q on q.id=d.job_id
      join public.adle_review_context_replay_grants g on g.source_id=q.source_id
      where d.budget_day=v_day)
      +(select count(*) from public.writing_context_shadow_dispatches d
        join public.writing_context_shadow_jobs q on q.id=d.job_id
        join public.course_context_replay_grants g on g.snapshot_id=q.snapshot_id
        where d.budget_day=v_day))>=ceil(p.max_requests_per_day*0.25)
    then return jsonb_build_object('reason','AI_DAILY_CAP_DEFERRED'); end if;
  insert into public.writing_context_shadow_consumption(environment,budget_day,policy_revision_id,
    requests_reserved,reserved_usd,sequence)
    values(a.environment,v_day,p.revision_id,1,p.max_usd_per_request,1)
    on conflict(environment,budget_day,policy_revision_id) do update
      set requests_reserved=writing_context_shadow_consumption.requests_reserved+1,
        reserved_usd=writing_context_shadow_consumption.reserved_usd+excluded.reserved_usd,
        sequence=writing_context_shadow_consumption.sequence+1;
  insert into public.adle_review_context_dispatches(job_id,window_fingerprint,request_bytes,
    provider_approval_id,learner_authorisation_id,policy_revision_id,rate_card_version,
    budget_environment,budget_day,reserved_cost_usd)
    values(j.id,p_window_fingerprint,p_request_bytes,a.id,l,p.revision_id,p.rate_card_version,
      a.environment,v_day,p.max_usd_per_request) returning id into v_id;
  return jsonb_build_object('id',v_id,'reason',null);
end $$;

create function public.begin_adle_review_context_dispatch(p_dispatch_id uuid,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare ctl public.writing_context_advisory_control%rowtype;
  d public.adle_review_context_dispatches%rowtype; ok boolean;
begin
  select * into ctl from public.writing_context_advisory_control where singleton for update;
  select * into d from public.adle_review_context_dispatches where id=p_dispatch_id for update;
  if d.id is null or d.state<>'reserved' then return false; end if;
  select exists(select 1 from public.adle_review_context_jobs j
    join public.adle_review_context_sources s on s.id=j.source_id
    join public.adle_review_sessions r on r.id=s.review_session_id
    join public.writing_context_shadow_policy p on p.singleton
    join public.writing_context_provider_approvals a on a.id=d.provider_approval_id
    join public.writing_context_learner_authorisations l on l.id=d.learner_authorisation_id
    where j.id=d.job_id and j.claim_token=p_claim_token and j.status='processing'
      and j.claimed_at>clock_timestamp()-interval '60 seconds'
      and s.submitted_text=r.submitted_writing_text and s.child_id=r.child_id
      and s.parent_user_id=r.parent_user_id and not ctl.enabled and ctl.ai_mode='shadow'
      and p.provider_approval_id=a.id and p.revision_id=d.policy_revision_id
      and p.rate_card_version=d.rate_card_version and p.max_usd_per_request=d.reserved_cost_usd
      and p.learner_policy_version=l.policy_version and a.expires_at>clock_timestamp()
      and l.expires_at>clock_timestamp() and public.context_shadow_execution_ready(p.revision_id,d.id)
      and not exists(select 1 from public.writing_context_approval_revocations v
        where v.provider_approval_id=a.id or v.learner_authorisation_id=l.id)) into ok;
  if ok then
    update public.writing_context_shadow_consumption
      set requests_admitted=requests_admitted+1,
        admitted_exposure_usd=admitted_exposure_usd+d.reserved_cost_usd,sequence=sequence+1
      where environment=d.budget_environment and budget_day=d.budget_day
        and policy_revision_id=d.policy_revision_id;
    if not found then raise exception 'context_consumption_missing'; end if;
  end if;
  update public.adle_review_context_dispatches
    set state=case when ok then 'sent' else 'cancelled' end,
      sent_at=case when ok then clock_timestamp() else null end,
      finished_at=case when ok then null else clock_timestamp() end where id=d.id;
  return ok;
end $$;

create function public.finish_adle_review_context_dispatch(p_dispatch_id uuid,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.adle_review_context_dispatches d
    set state=case when d.sent_at is null then 'cancelled' else 'finished' end,
      finished_at=clock_timestamp()
    from public.adle_review_context_jobs j where d.id=p_dispatch_id and j.id=d.job_id
      and j.claim_token=p_claim_token and j.status='processing'
      and d.state in ('reserved','sent','cancelled');
  return found;
end $$;

revoke all on function public.claim_adle_review_context_job(uuid),
  public.finish_adle_review_context_job(uuid,uuid,text),public.defer_adle_review_context_job(uuid,uuid),
  public.reserve_adle_review_context_window(uuid,uuid,text,integer,text,text,text,text,text,text),
  public.begin_adle_review_context_dispatch(uuid,uuid),
  public.finish_adle_review_context_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_adle_review_context_job(uuid),
  public.finish_adle_review_context_job(uuid,uuid,text),public.defer_adle_review_context_job(uuid,uuid),
  public.reserve_adle_review_context_window(uuid,uuid,text,integer,text,text,text,text,text,text),
  public.begin_adle_review_context_dispatch(uuid,uuid),
  public.finish_adle_review_context_dispatch(uuid,uuid) to service_role;
