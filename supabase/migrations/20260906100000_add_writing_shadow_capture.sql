-- Whole-writing S1: default-off, atomic source capture and isolated shadow jobs.
create table public.writing_shadow_controls (
  child_id uuid primary key references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  capture_enabled boolean not null default false,
  processing_enabled boolean not null default false,
  extraction_enabled boolean not null default false,
  resolution_enabled boolean not null default false,
  evidence_shadow_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.writing_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.task_submissions(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  occurred_at timestamptz not null,
  source_revision text not null default '1',
  envelope jsonb not null check (jsonb_typeof(envelope) = 'object'),
  captured_at timestamptz not null default now()
);

create table public.writing_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  analysis_version text not null default 'WRITING_SHADOW_V1',
  replay_key text not null default 'initial',
  status text not null default 'pending' check (status in ('pending','processing','failed','completed')),
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 8),
  lease_token uuid,
  started_at timestamptz,
  next_retry_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text check (error_code is null or error_code in ('ANALYSIS_FAILED','LEASE_EXPIRED','UNSUPPORTED_VERSION')),
  result jsonb,
  created_at timestamptz not null default now(),
  unique(snapshot_id, analysis_version, replay_key),
  check (status <> 'completed' or (result is not null and completed_at is not null))
);
create index writing_shadow_runs_pending_idx on public.writing_shadow_runs(next_retry_at, created_at)
  where status in ('pending','failed','processing');

create function public.assert_writing_shadow_ownership() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.children c where c.id=new.child_id and c.parent_user_id=new.parent_user_id)
    then raise exception 'writing_shadow_child_ownership'; end if;
  if tg_table_name='writing_source_snapshots' then
    if not exists(select 1 from public.task_submissions s where s.id=new.submission_id
      and s.child_id=new.child_id and s.parent_user_id=new.parent_user_id and s.task_id=new.task_id
      and s.submitted_at=new.occurred_at) then raise exception 'writing_shadow_submission_ownership'; end if;
  end if;
  return new;
end $$;
create trigger writing_shadow_controls_ownership before insert or update on public.writing_shadow_controls
  for each row execute function public.assert_writing_shadow_ownership();
create trigger writing_source_snapshot_ownership before insert on public.writing_source_snapshots
  for each row execute function public.assert_writing_shadow_ownership();

create function public.writing_shadow_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'writing_source_snapshots' then
    raise exception 'writing_shadow_immutable';
  end if;
  if old.status = 'completed' then
    raise exception 'writing_shadow_immutable';
  end if;
  if new.snapshot_id <> old.snapshot_id or new.analysis_version <> old.analysis_version or new.replay_key <> old.replay_key then
    raise exception 'writing_shadow_identity_immutable';
  end if;
  return new;
end $$;
create trigger writing_source_snapshot_immutable before update on public.writing_source_snapshots
  for each row execute function public.writing_shadow_immutable();
create trigger writing_shadow_result_immutable before update on public.writing_shadow_runs
  for each row execute function public.writing_shadow_immutable();

-- The existing submission RPC inserts its job in the same transaction as the
-- submission. Capture here preserves the RPC signature and returned-work fixes.
-- Controls and task context come from the database, never a client rollout flag.
create function public.capture_writing_source_from_submission_job() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.task_submissions%rowtype;
  t public.course_tasks%rowtype;
  snapshot_id uuid;
  raw_capture jsonb;
begin
  select * into s from public.task_submissions where id = new.submission_id;
  if not exists (select 1 from public.writing_shadow_controls c
    where c.child_id = s.child_id and c.parent_user_id = s.parent_user_id and c.capture_enabled) then
    return new;
  end if;
  if s.id is null or new.parent_user_id <> s.parent_user_id or new.child_id <> s.child_id or new.task_id <> s.task_id then
    raise exception 'writing_shadow_source_ownership';
  end if;
  select * into t from public.course_tasks where id = s.task_id and parent_user_id = s.parent_user_id;
  if t.id is null or t.task_type not in ('lesson','test') then raise exception 'writing_shadow_task_invalid'; end if;
  raw_capture := new.payload->'writingSourceCapture';
  insert into public.writing_source_snapshots(submission_id,parent_user_id,child_id,task_id,occurred_at,envelope)
  values (s.id,s.parent_user_id,s.child_id,s.task_id,s.submitted_at,jsonb_build_object(
    'schemaVersion',1,
    'rawSubmissionText',case when jsonb_typeof(raw_capture->'rawSubmissionText') = 'string' then raw_capture->'rawSubmissionText' else 'null'::jsonb end,
    'draftPayload',case when jsonb_typeof(raw_capture->'draftPayload') = 'object' then raw_capture->'draftPayload' else 'null'::jsonb end,
    'rawCaptureAvailable',coalesce(jsonb_typeof(raw_capture) = 'object',false),
    'captureMetadata',raw_capture - 'rawSubmissionText' - 'draftPayload',
    'legacySubmissionText',s.submission_text,
    'processingPayload',new.payload - 'writingSourceCapture',
    'structuredPayloads',coalesce((select jsonb_agg(jsonb_build_object('type',p.payload_type,'version',p.payload_version,'value',p.payload_json) order by p.id)
      from public.task_submission_payloads p where p.submission_id = s.id),'[]'::jsonb),
    'taskContext',jsonb_build_object('kind','saved_definition_at_submission','title',t.title,'instructions',t.instructions,'lessonSchema',t.lesson_schema),
    'displayedContextVerified',false
  )) returning id into snapshot_id;
  insert into public.writing_shadow_runs(snapshot_id) values(snapshot_id);
  return new;
end $$;
create trigger capture_writing_source_from_submission_job after insert on public.task_submission_processing_jobs
  for each row execute function public.capture_writing_source_from_submission_job();

create function public.claim_writing_shadow_runs(p_limit integer default 20)
returns setof public.writing_shadow_runs
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.writing_shadow_runs set status='failed', lease_token=null,
    error_code='LEASE_EXPIRED',next_retry_at=now()
    where status='processing' and started_at < now()-interval '10 minutes';
  return query
  with selected as (
    select r.id from public.writing_shadow_runs r
    join public.writing_source_snapshots s on s.id=r.snapshot_id
    join public.writing_shadow_controls c on c.child_id=s.child_id and c.parent_user_id=s.parent_user_id
    where c.processing_enabled and r.status in ('pending','failed') and r.attempt_count<8 and r.next_retry_at<=now()
    order by r.created_at,r.id limit greatest(1,least(coalesce(p_limit,20),20)) for update of r skip locked
  ) update public.writing_shadow_runs r set status='processing',attempt_count=r.attempt_count+1,
    lease_token=gen_random_uuid(),started_at=now(),error_code=null
    from selected where r.id=selected.id returning r.*;
end $$;

create function public.finish_writing_shadow_run(p_run_id uuid,p_lease_token uuid,p_result jsonb,p_error_code text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  if (p_result is null) = (p_error_code is null) then raise exception 'writing_shadow_result_invalid'; end if;
  if p_error_code is not null and p_error_code not in ('ANALYSIS_FAILED','UNSUPPORTED_VERSION') then raise exception 'writing_shadow_error_invalid'; end if;
  update public.writing_shadow_runs set status=case when p_error_code is null then 'completed' else 'failed' end,
    result=p_result,error_code=p_error_code,lease_token=null,
    completed_at=case when p_error_code is null then now() else null end,
    next_retry_at=now()+make_interval(secs=>least(3600,30*power(2,greatest(0,attempt_count-1)))::integer)
    where id=p_run_id and status='processing' and lease_token=p_lease_token;
  get diagnostics affected = row_count;
  return affected=1;
end $$;

alter table public.writing_shadow_controls enable row level security;
alter table public.writing_source_snapshots enable row level security;
alter table public.writing_shadow_runs enable row level security;
create policy writing_source_owner_read on public.writing_source_snapshots for select to authenticated using (auth.uid()=parent_user_id);
create policy writing_run_owner_read on public.writing_shadow_runs for select to authenticated using (
  exists(select 1 from public.writing_source_snapshots s where s.id=snapshot_id and s.parent_user_id=auth.uid()));
revoke all on public.writing_shadow_controls,public.writing_source_snapshots,public.writing_shadow_runs from anon,authenticated;
grant select on public.writing_source_snapshots,public.writing_shadow_runs to authenticated;
grant all on public.writing_shadow_controls,public.writing_source_snapshots,public.writing_shadow_runs to service_role;
revoke all on function public.writing_shadow_immutable(),public.capture_writing_source_from_submission_job(),public.claim_writing_shadow_runs(integer),public.finish_writing_shadow_run(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.assert_writing_shadow_ownership() from public,anon,authenticated;
grant execute on function public.claim_writing_shadow_runs(integer),public.finish_writing_shadow_run(uuid,uuid,jsonb,text) to service_role;
