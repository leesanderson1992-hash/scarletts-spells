-- AI is an observation source only. The existing parent decision and learning
-- transactions remain the sole authority for contextual consequences.
alter table public.writing_context_advisory_control
  add column ai_mode text not null default 'disabled'
  check (ai_mode in ('disabled','shadow','parent_advisory'));
alter table public.writing_context_advisory_control
  add constraint writing_context_ai_parent_mode_requires_review
  check (ai_mode <> 'parent_advisory' or enabled);
alter table public.writing_context_advisory_control
  add constraint writing_context_ai_shadow_excludes_review
  check (ai_mode <> 'shadow' or not enabled);

create table public.writing_context_ai_attempts (
  id uuid primary key default gen_random_uuid(),
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  run_key text not null,
  mode text not null check (mode in ('shadow','parent_advisory')),
  family_key text not null check (family_key in ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS')),
  result_status text not null check (result_status in ('VALID','INVALID','UNCERTAIN','NOT_ASSESSED')),
  alternative_member text,
  reason_code text not null,
  provider text not null,
  model text not null,
  returned_model text,
  provider_request_id text,
  prompt_fingerprint text not null,
  schema_fingerprint text not null,
  config_fingerprint text not null,
  gate_version text not null,
  window_fingerprint text,
  latency_ms integer,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  calculated_cost_usd numeric(14,8),
  pricing_version text,
  declared_decision text check (declared_decision in ('VALID','INVALID','UNCERTAIN')),
  created_at timestamptz not null default clock_timestamp(),
  unique (occurrence_id, run_key, mode),
  check ((result_status='INVALID')=(alternative_member is not null)),
  check (latency_ms is null or latency_ms >= 0),
  check (input_tokens is null or input_tokens >= 0),
  check (cached_input_tokens is null or (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens)),
  check (output_tokens is null or output_tokens >= 0),
  check (calculated_cost_usd is null or calculated_cost_usd >= 0)
);
create index writing_context_ai_attempts_created_idx
  on public.writing_context_ai_attempts(created_at,mode,result_status);
alter table public.writing_context_ai_attempts enable row level security;
revoke all on public.writing_context_ai_attempts from public,anon,authenticated;
grant all on public.writing_context_ai_attempts to service_role;

alter table public.writing_context_advisory_observations
  add column analysis_source text not null default 'frozen_v4'
    check (analysis_source in ('frozen_v4','ai_provider')),
  add column ai_attempt_id uuid references public.writing_context_ai_attempts(id),
  add constraint writing_context_ai_observation_attempt_required
    check ((analysis_source='ai_provider')=(ai_attempt_id is not null));

create function public.assert_writing_context_ai_attempt_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare v_occurrence public.writing_occurrences%rowtype;
        v_snapshot public.writing_source_snapshots%rowtype;
begin
  select * into v_occurrence from public.writing_occurrences where id=new.occurrence_id;
  select * into v_snapshot from public.writing_source_snapshots where id=v_occurrence.snapshot_id;
  if v_snapshot.id is null or new.snapshot_id<>v_snapshot.id or
     new.parent_user_id<>v_snapshot.parent_user_id or new.child_id<>v_snapshot.child_id then
    raise exception 'context_ai_attempt_scope_invalid';
  end if;
  return new;
end $$;
create trigger writing_context_ai_attempt_scope before insert on public.writing_context_ai_attempts
  for each row execute function public.assert_writing_context_ai_attempt_scope();
create trigger writing_context_ai_attempt_immutable before update on public.writing_context_ai_attempts
  for each row execute function public.reject_writing_fact_update();

create function public.assert_writing_context_ai_observation_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare v_attempt public.writing_context_ai_attempts%rowtype;
begin
  if new.analysis_source <> 'ai_provider' then return new; end if;
  select * into v_attempt from public.writing_context_ai_attempts where id=new.ai_attempt_id;
  if v_attempt.id is null or v_attempt.mode <> 'parent_advisory' or
     v_attempt.occurrence_id <> new.occurrence_id or
     v_attempt.snapshot_id <> new.snapshot_id or
     v_attempt.parent_user_id <> new.parent_user_id or
     v_attempt.child_id <> new.child_id or
     v_attempt.family_key <> new.family_key or
     v_attempt.result_status <> new.observation_status or
     v_attempt.alternative_member is distinct from new.alternative_member then
    raise exception 'context_ai_observation_scope_invalid';
  end if;
  return new;
end $$;
create trigger writing_context_ai_observation_scope before insert on public.writing_context_advisory_observations
  for each row execute function public.assert_writing_context_ai_observation_scope();

-- Shadow captures are durable but not part of the parent review route.
create or replace function public.capture_writing_source_from_submission_job() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.task_submissions%rowtype; t public.course_tasks%rowtype;
        v_shadow_enabled boolean; v_advisory_enabled boolean; v_ai_mode text;
        snapshot_id uuid; raw_capture jsonb;
begin
  select * into s from public.task_submissions where id=new.submission_id;
  select coalesce((select c.capture_enabled from public.writing_shadow_controls c
    where c.child_id=s.child_id and c.parent_user_id=s.parent_user_id),false) into v_shadow_enabled;
  select enabled,ai_mode into v_advisory_enabled,v_ai_mode
    from public.writing_context_advisory_control where singleton=true;
  if not v_shadow_enabled and not coalesce(v_advisory_enabled,false) and
     v_ai_mode is distinct from 'shadow' then return new; end if;
  if s.id is null or new.parent_user_id<>s.parent_user_id or new.child_id<>s.child_id or new.task_id<>s.task_id then
    raise exception 'writing_shadow_source_ownership';
  end if;
  select * into t from public.course_tasks where id=s.task_id and parent_user_id=s.parent_user_id;
  if t.id is null or t.task_type not in ('lesson','test') then raise exception 'writing_shadow_task_invalid'; end if;
  raw_capture:=new.payload->'writingSourceCapture';
  insert into public.writing_source_snapshots(submission_id,parent_user_id,child_id,task_id,occurred_at,envelope)
  values(s.id,s.parent_user_id,s.child_id,s.task_id,s.submitted_at,jsonb_build_object(
    'schemaVersion',1,
    'contextAdvisoryCapture',coalesce(v_advisory_enabled,false),
    'contextAiShadowCapture',v_ai_mode='shadow',
    'contextAiModeAtCapture',v_ai_mode,
    'rawSubmissionText',case when jsonb_typeof(raw_capture->'rawSubmissionText')='string' then raw_capture->'rawSubmissionText' else 'null'::jsonb end,
    'draftPayload',case when jsonb_typeof(raw_capture->'draftPayload')='object' then raw_capture->'draftPayload' else 'null'::jsonb end,
    'rawCaptureAvailable',coalesce(jsonb_typeof(raw_capture)='object',false),
    'captureMetadata',raw_capture-'rawSubmissionText'-'draftPayload',
    'legacySubmissionText',s.submission_text,
    'processingPayload',new.payload-'writingSourceCapture',
    'structuredPayloads',coalesce((select jsonb_agg(jsonb_build_object('type',p.payload_type,'version',p.payload_version,'value',p.payload_json) order by p.id)
      from public.task_submission_payloads p where p.submission_id=s.id),'[]'::jsonb),
    'taskContext',jsonb_build_object('kind','saved_definition_at_submission','title',t.title,'instructions',t.instructions,'lessonSchema',t.lesson_schema),
    'displayedContextVerified',false
  )) on conflict(submission_id) do nothing returning id into snapshot_id;
  if v_shadow_enabled then
    if snapshot_id is null then select id into snapshot_id from public.writing_source_snapshots where submission_id=s.id; end if;
    insert into public.writing_shadow_runs(snapshot_id) values(snapshot_id) on conflict do nothing;
  end if;
  return new;
end $$;

create or replace function public.disable_writing_context_advisory(p_actor uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_actor is null then raise exception 'rollback_actor_required'; end if;
  update public.writing_context_advisory_control
  set enabled=false,ai_mode='disabled',updated_by=p_actor
  where singleton=true and (enabled=true or ai_mode<>'disabled');
  return true;
end $$;
