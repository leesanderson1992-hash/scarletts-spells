begin;
create table public.writing_context_provider_approvals (
  id uuid primary key default gen_random_uuid(),
  environment text not null check(environment in ('staging','production')),
  project_ref text not null check(project_ref ~ '^[A-Za-z0-9_-]{1,100}$'),
  deployment_sha text not null check(deployment_sha ~ '^[a-f0-9]{40}$'),
  model text not null check(model='gpt-6-luna'),
  endpoint text not null check(endpoint='/v1/responses'),
  config_fingerprint text not null check(config_fingerprint ~ '^[a-f0-9]{64}$'),
  runtime_fingerprint text not null check(runtime_fingerprint ~ '^[a-f0-9]{64}$'),
  zdr_verified boolean not null check(zdr_verified),
  data_sharing_disabled boolean not null check(data_sharing_disabled),
  evidence_ref text not null check(evidence_ref ~ '^[A-Za-z0-9_./:-]{1,200}$'),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check(expires_at>approved_at)
);
create table public.writing_context_learner_authorisations (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null check(policy_version ~ '^[A-Za-z0-9_.-]{1,80}$'),
  evidence_ref text not null check(evidence_ref ~ '^[A-Za-z0-9_./:-]{1,200}$'),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check(expires_at>approved_at)
);
create table public.writing_context_approval_revocations (
  id uuid primary key default gen_random_uuid(),
  provider_approval_id uuid references public.writing_context_provider_approvals(id) on delete cascade,
  learner_authorisation_id uuid references public.writing_context_learner_authorisations(id) on delete cascade,
  revoked_by uuid not null references auth.users(id),
  evidence_ref text not null check(evidence_ref ~ '^[A-Za-z0-9_./:-]{1,200}$'),
  created_at timestamptz not null default clock_timestamp(),
  check(num_nonnulls(provider_approval_id,learner_authorisation_id)=1)
);
create table public.writing_context_shadow_policy (
  singleton boolean primary key default true check(singleton),
  provider_approval_id uuid references public.writing_context_provider_approvals(id),
  rate_card_version text,
  learner_policy_version text,
  max_requests_per_day integer check(max_requests_per_day>0),
  max_usd_per_day numeric(14,8) check(max_usd_per_day>0),
  max_usd_per_request numeric(14,8) check(max_usd_per_request>0),
  max_concurrent integer not null default 1 check(max_concurrent=1),
  -- Signed staging measurements determine thresholds; empty is DENY.
  thresholds jsonb not null default '{}',
  evidence_ref text check(evidence_ref ~ '^[A-Za-z0-9_./:-]{1,200}$'),
  approved_by uuid references auth.users(id)
);
insert into public.writing_context_shadow_policy(singleton) values(true);
create table public.writing_context_shadow_jobs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null unique references public.writing_source_snapshots(id) on delete cascade,
  run_key text not null,
  status text not null default 'pending' check(status in ('pending','processing','complete','failed')),
  claim_token uuid,
  claimed_at timestamptz,
  claim_count integer not null default 0,
  completed_at timestamptz,
  error_code text check(error_code ~ '^[A-Z0-9_]{1,80}$'),
  summary jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index context_shadow_jobs_pending on public.writing_context_shadow_jobs(status,created_at);
create table public.writing_context_shadow_dispatches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.writing_context_shadow_jobs(id) on delete cascade,
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  detector_run_id uuid not null references public.writing_context_detector_runs(id) on delete cascade,
  provider_approval_id uuid not null references public.writing_context_provider_approvals(id),
  learner_authorisation_id uuid not null references public.writing_context_learner_authorisations(id),
  rate_card_version text not null,
  window_fingerprint text not null check(window_fingerprint ~ '^[a-f0-9]{64}$'),
  request_bytes integer not null check(request_bytes between 1 and 8000),
  reserved_cost_usd numeric(14,8) not null check(reserved_cost_usd>0),
  state text not null default 'reserved' check(state in ('reserved','sent','finished','abandoned','cancelled')),
  reserved_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  finished_at timestamptz,
  unique(job_id,occurrence_id)
);
create index context_shadow_dispatch_budget on public.writing_context_shadow_dispatches(reserved_at,state);

create table public.writing_context_shadow_policy_history (
  id uuid primary key,
  policy jsonb not null,
  recorded_at timestamptz not null default clock_timestamp()
);
alter table public.writing_context_shadow_policy_history enable row level security;
revoke all on public.writing_context_shadow_policy_history from public,anon,authenticated;
grant select on public.writing_context_shadow_policy_history to service_role;
create trigger context_shadow_policy_history_immutable before update on public.writing_context_shadow_policy_history
  for each row execute function public.reject_writing_fact_update();
alter table public.writing_context_shadow_policy add column revision_id uuid references public.writing_context_shadow_policy_history(id);
alter table public.writing_context_shadow_dispatches add column policy_revision_id uuid references public.writing_context_shadow_policy_history(id);
create function public.record_context_shadow_policy_revision() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  new.revision_id:=gen_random_uuid();
  insert into public.writing_context_shadow_policy_history(id,policy) values(new.revision_id,to_jsonb(new)-'revision_id');
  return new;
end $$;
create trigger context_shadow_policy_revision before update on public.writing_context_shadow_policy
  for each row execute function public.record_context_shadow_policy_revision();
revoke all on function public.record_context_shadow_policy_revision() from public,anon,authenticated;

do $$ declare n text; begin
  foreach n in array array['writing_context_provider_approvals','writing_context_learner_authorisations',
    'writing_context_approval_revocations','writing_context_shadow_policy','writing_context_shadow_jobs',
    'writing_context_shadow_dispatches'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('revoke all on public.%I from public,anon,authenticated',n);
    execute format('grant select on public.%I to service_role',n);
  end loop;
  foreach n in array array['writing_context_provider_approvals','writing_context_learner_authorisations',
    'writing_context_approval_revocations'] loop
    execute format('grant insert on public.%I to service_role',n);
    execute format('create trigger %I before update on public.%I for each row execute function public.reject_writing_fact_update()',n||'_immutable',n);
  end loop;
end $$;
grant update on public.writing_context_shadow_policy to service_role;

-- Only captures made during this activation can be queued. No old submission backfill.
create function public.enqueue_writing_context_shadow(p_submission_id uuid) returns uuid
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
    and s.parent_user_id=t.parent_user_id and s.child_id=t.child_id
  on conflict(snapshot_id) do nothing returning id into v_id;
  return v_id;
end $$;
create function public.claim_writing_context_shadow(p_submission_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.writing_context_shadow_jobs%rowtype; begin
  select j.* into v_job from public.writing_context_shadow_jobs j
  join public.writing_source_snapshots s on s.id=j.snapshot_id
  where (p_submission_id is null or s.submission_id=p_submission_id)
    and (j.status='pending' or (j.status='processing' and j.claimed_at<clock_timestamp()-interval '60 seconds'))
    and j.claim_count<8 order by j.created_at for update of j skip locked limit 1;
  if v_job.id is null then return null; end if;
  update public.writing_context_shadow_jobs set status='processing',claim_token=gen_random_uuid(),
    claimed_at=clock_timestamp(),claim_count=claim_count+1 where id=v_job.id returning * into v_job;
  -- A send with an ambiguous outcome is never repeated after lease recovery.
  update public.writing_context_shadow_dispatches set state='abandoned',finished_at=clock_timestamp()
    where job_id=v_job.id and state in ('sent','reserved');
  return to_jsonb(v_job);
end $$;
create function public.reconcile_writing_context_shadow() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare x record; n integer:=0; begin
  for x in select s.submission_id from public.writing_source_snapshots s
    join public.writing_context_advisory_control c on c.singleton
    where not c.enabled and c.ai_mode='shadow' and s.occurred_at>=c.updated_at
      and not exists(select 1 from public.writing_context_shadow_jobs j where j.snapshot_id=s.id)
    order by s.occurred_at limit 100 loop
    if public.enqueue_writing_context_shadow(x.submission_id) is not null then n:=n+1; end if;
  end loop; return n;
end $$;
create function public.finish_writing_context_shadow_job(p_job_id uuid,p_claim_token uuid,p_error_code text,p_summary jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ begin
  if p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,80}$' then raise exception 'shadow_error_code_invalid'; end if;
  if jsonb_typeof(p_summary)<>'object' or exists(select 1 from jsonb_each(p_summary) x
    where x.key not in ('indexed','governed','routing_excluded','attempts','provider_calls') or jsonb_typeof(x.value)<>'number')
    then raise exception 'shadow_summary_invalid'; end if;
  update public.writing_context_shadow_jobs set status=case when p_error_code is null then 'complete' else 'failed' end,
    completed_at=clock_timestamp(),error_code=p_error_code,summary=p_summary
    where id=p_job_id and claim_token=p_claim_token and status='processing';
  return found;
end $$;
revoke all on function public.enqueue_writing_context_shadow(uuid),public.claim_writing_context_shadow(uuid),
  public.finish_writing_context_shadow_job(uuid,uuid,text,jsonb),public.reconcile_writing_context_shadow() from public,anon,authenticated;
grant execute on function public.enqueue_writing_context_shadow(uuid),public.claim_writing_context_shadow(uuid),
  public.finish_writing_context_shadow_job(uuid,uuid,text,jsonb),public.reconcile_writing_context_shadow() to service_role;
commit;
