-- Advisory use is not S8 release approval, selection, or activation. The
-- singleton remains off until the separately reviewed policy exception exists.
create table public.writing_context_advisory_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id)
);
insert into public.writing_context_advisory_control(singleton, enabled) values (true, false);
create function public.stamp_writing_context_advisory_control() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger writing_context_advisory_control_stamp before update on public.writing_context_advisory_control
  for each row execute function public.stamp_writing_context_advisory_control();

-- This is a projection of frozen V4 into parent review, not a release result.
create table public.writing_context_advisory_observations (
  id uuid primary key default gen_random_uuid(),
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  family_key text not null check (family_key in ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS')),
  release_key text not null,
  release_id uuid not null,
  run_key text not null,
  manifest_fingerprint text not null,
  observation_status text not null check (observation_status in ('VALID','INVALID','UNCERTAIN','NOT_ASSESSED')),
  observed_member text not null,
  alternative_member text,
  reason_code text not null,
  assessed_scope text,
  rule_id text,
  result_fingerprint text not null,
  trace_fingerprint text,
  diagnostics jsonb not null default '{}'::jsonb check (jsonb_typeof(diagnostics)='object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (occurrence_id, release_id, run_key),
  check ((observation_status='INVALID')=(alternative_member is not null))
);
create index writing_context_advisory_observations_snapshot_idx
  on public.writing_context_advisory_observations(snapshot_id, created_at, id);

-- Parent truth is independent from the machine observation. Later changes are
-- new events pointing to the prior decision, never updates to a gold-like row.
create table public.writing_context_parent_decisions (
  id uuid primary key default gen_random_uuid(),
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  observation_id uuid references public.writing_context_advisory_observations(id),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  family_key text not null check (family_key in ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS')),
  classification text not null check (classification in ('VALID','INVALID','UNCERTAIN','EXCLUDED')),
  intended_member text,
  reason_code text,
  review_policy_version text not null default 'CONTEXT_PARENT_REVIEW_ALL_V1',
  supersedes_decision_id uuid unique references public.writing_context_parent_decisions(id),
  writing_issue_id uuid references public.writing_issues(id),
  decided_at timestamptz not null default clock_timestamp(),
  check ((classification='INVALID')=(intended_member is not null)),
  check (classification<>'EXCLUDED' or reason_code is not null)
);
create unique index writing_context_parent_decisions_initial_idx
  on public.writing_context_parent_decisions(occurrence_id) where supersedes_decision_id is null;
create index writing_context_parent_decisions_occurrence_idx
  on public.writing_context_parent_decisions(occurrence_id, decided_at desc, id desc);

create function public.assert_writing_context_advisory_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare v_snapshot public.writing_source_snapshots%rowtype;
        v_observation public.writing_context_advisory_observations%rowtype;
        v_prior public.writing_context_parent_decisions%rowtype;
begin
  select snapshot.* into v_snapshot from public.writing_occurrences occurrence
    join public.writing_source_snapshots snapshot on snapshot.id=occurrence.snapshot_id
    where occurrence.id=new.occurrence_id;
  if v_snapshot.id is null or v_snapshot.parent_user_id<>new.parent_user_id or v_snapshot.child_id<>new.child_id then
    raise exception 'context_advisory_occurrence_scope_invalid';
  end if;
  if tg_table_name='writing_context_advisory_observations' then
    if new.snapshot_id<>v_snapshot.id then raise exception 'context_advisory_snapshot_mismatch'; end if;
  else
    if new.observation_id is not null then
      select * into v_observation from public.writing_context_advisory_observations where id=new.observation_id;
      if v_observation.occurrence_id is distinct from new.occurrence_id or v_observation.family_key is distinct from new.family_key then
        raise exception 'context_advisory_observation_mismatch';
      end if;
    end if;
    if new.supersedes_decision_id is not null then
      select * into v_prior from public.writing_context_parent_decisions where id=new.supersedes_decision_id;
      if v_prior.occurrence_id is distinct from new.occurrence_id then raise exception 'context_advisory_supersession_mismatch'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger writing_context_advisory_observation_scope before insert on public.writing_context_advisory_observations
  for each row execute function public.assert_writing_context_advisory_scope();
create trigger writing_context_parent_decision_scope before insert on public.writing_context_parent_decisions
  for each row execute function public.assert_writing_context_advisory_scope();
create trigger writing_context_advisory_observation_immutable before update on public.writing_context_advisory_observations
  for each row execute function public.reject_writing_fact_update();
create trigger writing_context_parent_decision_immutable before update on public.writing_context_parent_decisions
  for each row execute function public.reject_writing_fact_update();

create view public.writing_context_current_parent_decisions with (security_invoker=true) as
select decision.* from public.writing_context_parent_decisions decision
where not exists (select 1 from public.writing_context_parent_decisions newer
                  where newer.supersedes_decision_id=decision.id);

alter table public.writing_context_advisory_control enable row level security;
alter table public.writing_context_advisory_observations enable row level security;
alter table public.writing_context_parent_decisions enable row level security;
create policy writing_context_advisory_observations_parent_read on public.writing_context_advisory_observations
  for select to authenticated using (parent_user_id=auth.uid());
create policy writing_context_parent_decisions_parent_read on public.writing_context_parent_decisions
  for select to authenticated using (parent_user_id=auth.uid());
revoke all on public.writing_context_advisory_control, public.writing_context_advisory_observations,
  public.writing_context_parent_decisions, public.writing_context_current_parent_decisions from public,anon,authenticated;
grant select on public.writing_context_advisory_observations,public.writing_context_parent_decisions,
  public.writing_context_current_parent_decisions to authenticated;
grant all on public.writing_context_advisory_control,public.writing_context_advisory_observations,
  public.writing_context_parent_decisions to service_role;
grant select on public.writing_context_current_parent_decisions to service_role;

-- One transaction owns the parent decision and its optional repair issue.
-- This is deliberately not a spelling mapping and does not create learning
-- evidence. The API server authenticates the parent before calling it.
create function public.record_writing_context_parent_decision(
  p_occurrence_id text, p_observation_id uuid, p_parent_user_id uuid,
  p_classification text, p_intended_member text default null,
  p_reason_code text default null, p_context_excerpt text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_occurrence public.writing_occurrences%rowtype;
        v_snapshot public.writing_source_snapshots%rowtype;
        v_previous public.writing_context_parent_decisions%rowtype;
        v_existing public.writing_issues%rowtype;
        v_family text; v_members text[]; v_observed text;
        v_alternative text; v_issue_id uuid; v_decision_id uuid;
        v_enabled boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_occurrence_id,0));
  select * into v_occurrence from public.writing_occurrences where id=p_occurrence_id;
  select * into v_snapshot from public.writing_source_snapshots where id=v_occurrence.snapshot_id;
  if v_snapshot.id is null or v_snapshot.parent_user_id<>p_parent_user_id then
    raise exception 'context_parent_occurrence_not_owned';
  end if;
  select enabled into v_enabled from public.writing_context_advisory_control where singleton=true;
  if not coalesce(v_enabled,false) then raise exception 'context_advisory_disabled'; end if;
  v_observed:=lower(replace(replace(v_occurrence.observed_text,'’',chr(39)),'ʼ',chr(39)));
  case
    when v_observed=any(array['there','their','they''re']) then
      v_family:='THERE_THEIR_THEYRE'; v_members:=array['there','their','they''re'];
    when v_observed=any(array['to','too','two']) then
      v_family:='TO_TOO_TWO'; v_members:=array['to','too','two'];
    when v_observed=any(array['your','you''re']) then
      v_family:='YOUR_YOURE'; v_members:=array['your','you''re'];
    when v_observed=any(array['its','it''s']) then
      v_family:='ITS_ITS'; v_members:=array['its','it''s'];
    else raise exception 'context_parent_not_governed';
  end case;
  if p_classification not in ('VALID','INVALID','UNCERTAIN','EXCLUDED') then
    raise exception 'context_parent_invalid_classification';
  end if;
  v_alternative:=case when p_intended_member is null then null
    else lower(replace(replace(p_intended_member,'’',chr(39)),'ʼ',chr(39))) end;
  if (p_classification='INVALID') is distinct from (v_alternative is not null)
     or (v_alternative is not null and
         (not v_alternative=any(v_members) or v_alternative=v_observed)) then
    raise exception 'context_parent_invalid_alternative';
  end if;
  if p_classification='EXCLUDED' and nullif(trim(p_reason_code),'') is null then
    raise exception 'context_parent_exclusion_reason_required';
  end if;
  if p_context_excerpt is not null and (length(p_context_excerpt)>200 or
      position(v_occurrence.observed_text in p_context_excerpt)=0) then
    raise exception 'context_parent_excerpt_invalid';
  end if;
  if p_observation_id is not null and not exists (
    select 1 from public.writing_context_advisory_observations o
    where o.id=p_observation_id and o.occurrence_id=p_occurrence_id
      and o.parent_user_id=p_parent_user_id and o.family_key=v_family
  ) then raise exception 'context_parent_observation_mismatch'; end if;
  select * into v_previous from public.writing_context_current_parent_decisions
    where occurrence_id=p_occurrence_id;
  select * into v_existing from public.writing_issues
    where source_writing_occurrence_id=p_occurrence_id and
      metadata->>'source_kind'='contextual_advisory_v4'
    order by created_at desc,id desc limit 1 for update;
  if v_existing.issue_status='finalised' and
     v_existing.final_classification='not_an_issue' then
    v_existing:=null;
  end if;
  if v_existing.id is not null and v_existing.issue_status<>'pending_parent_review' then
    raise exception 'context_parent_issue_already_sent_to_child';
  end if;
  if p_classification='INVALID' then
    if v_existing.id is null then
      insert into public.writing_issues(child_id,parent_user_id,task_submission_id,
        issue_status,observed_text,suggested_replacement,approved_replacement,
        context_text,source_field_key,micro_skill_key,parent_marked_at,metadata,
        source_writing_occurrence_id)
      values(v_snapshot.child_id,p_parent_user_id,v_snapshot.submission_id,
        'pending_parent_review',v_occurrence.observed_text,v_alternative,v_alternative,
        coalesce(p_context_excerpt,v_occurrence.observed_text),null,'unknown',clock_timestamp(),
        jsonb_build_object('source_kind','contextual_advisory_v4',
          'evidence_kind','REPAIR_ONLY','source_writing_occurrence_id',p_occurrence_id,
          'snapshot_field_path',v_occurrence.field_path),
        p_occurrence_id) returning id into v_issue_id;
    else
      update public.writing_issues set approved_replacement=v_alternative,
        suggested_replacement=v_alternative,updated_at=clock_timestamp()
        where id=v_existing.id;
      v_issue_id:=v_existing.id;
    end if;
  elsif v_existing.id is not null then
    update public.writing_issues set issue_status='finalised',
      final_classification='not_an_issue',final_classified_at=clock_timestamp(),
      updated_at=clock_timestamp() where id=v_existing.id;
  end if;
  insert into public.writing_context_parent_decisions(occurrence_id,observation_id,
    parent_user_id,child_id,family_key,classification,intended_member,reason_code,
    supersedes_decision_id,writing_issue_id)
  values(p_occurrence_id,p_observation_id,p_parent_user_id,v_snapshot.child_id,
    v_family,p_classification,v_alternative,p_reason_code,v_previous.id,v_issue_id)
  returning id into v_decision_id;
  return v_decision_id;
end $$;
revoke all on function public.record_writing_context_parent_decision(text,uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_writing_context_parent_decision(text,uuid,uuid,text,text,text,text)
  to service_role;

-- A prompted word repair is durable, parent-confirmed evidence of repair only.
-- It never calls the spelling learning-item finaliser or reward bridge.
create function public.finalise_contextual_repair_only(
  p_writing_issue_id uuid, p_parent_user_id uuid, p_child_id uuid,
  p_outcome text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype;
begin
  if p_outcome not in ('checking_only','fragile_knowledge','concept_gap',
                       'transfer_failure','not_an_issue') then
    raise exception 'contextual_repair_outcome_invalid';
  end if;
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id for update;
  if v_issue.id is null or v_issue.metadata->>'source_kind'<>'contextual_advisory_v4'
     or v_issue.issue_status<>'child_responded' or v_issue.final_classification is not null then
    raise exception 'contextual_repair_scope_invalid';
  end if;
  update public.writing_issues set issue_status='finalised',
    final_classification=p_outcome,final_classified_at=clock_timestamp(),
    metadata=metadata||jsonb_build_object('evidence_kind','REPAIR_ONLY',
      'learning_projection','BLOCKED_PENDING_SEPARATE_BRIDGE'),
    updated_at=clock_timestamp() where id=p_writing_issue_id;
  return p_writing_issue_id;
end $$;
revoke all on function public.finalise_contextual_repair_only(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.finalise_contextual_repair_only(uuid,uuid,uuid,text)
  to service_role;

-- Cover all existing approval paths, including bulk reason-draft approval.
-- A future UI change cannot accidentally route this source kind through the
-- normal learning-item finaliser.
alter function public.finalise_writing_issue_classification_and_learning_item(uuid,uuid,uuid,text)
  rename to finalise_writing_issue_classification_and_learning_item_pre_context_advisory;
revoke all on function public.finalise_writing_issue_classification_and_learning_item_pre_context_advisory(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
create function public.finalise_writing_issue_classification_and_learning_item(
  p_writing_issue_id uuid, p_parent_user_id uuid, p_child_id uuid,
  p_final_classification text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype;
begin
  if auth.uid() is not null and auth.uid()<>p_parent_user_id then
    raise exception 'writing_issue_parent_scope_invalid';
  end if;
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id;
  if v_issue.metadata->>'source_kind'='contextual_advisory_v4' then
    perform public.finalise_contextual_repair_only(p_writing_issue_id,p_parent_user_id,
      p_child_id,p_final_classification);
    return jsonb_build_object('writing_issue_id',p_writing_issue_id,
      'learning_item_id',null,'created_learning_item',false,
      'reused_learning_item',false,'evidence_kind','REPAIR_ONLY');
  end if;
  return public.finalise_writing_issue_classification_and_learning_item_pre_context_advisory(
    p_writing_issue_id,p_parent_user_id,p_child_id,p_final_classification);
end $$;
revoke all on function public.finalise_writing_issue_classification_and_learning_item(uuid,uuid,uuid,text)
  from public,anon;
grant execute on function public.finalise_writing_issue_classification_and_learning_item(uuid,uuid,uuid,text)
  to authenticated,service_role;

-- Optional, deliberate promotion into a diagnostic queue. Neither this row
-- nor the metrics view is qualification gold or learning evidence.
create table public.writing_context_diagnostic_promotions (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references public.writing_context_parent_decisions(id),
  occurrence_id text not null references public.writing_occurrences(id),
  parent_user_id uuid not null references auth.users(id),
  child_id uuid not null references public.children(id),
  category text not null check (category in ('FALSE_VALID','WRONG_ALTERNATIVE',
    'AVOIDABLE_UNCERTAIN','MISSED_CONSTRUCTION','PROTECTED_OR_AMBIGUOUS','OTHER')),
  parent_note text,
  queue_status text not null default 'open' check (queue_status in ('open','reviewed')),
  created_at timestamptz not null default clock_timestamp()
);
create function public.assert_writing_context_diagnostic_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare v_decision public.writing_context_parent_decisions%rowtype;
begin
  select * into v_decision from public.writing_context_parent_decisions where id=new.decision_id;
  if v_decision.id is null or v_decision.occurrence_id<>new.occurrence_id or
     v_decision.parent_user_id<>new.parent_user_id or v_decision.child_id<>new.child_id then
    raise exception 'context_diagnostic_scope_invalid';
  end if;
  return new;
end $$;
create trigger writing_context_diagnostic_scope before insert on public.writing_context_diagnostic_promotions
  for each row execute function public.assert_writing_context_diagnostic_scope();
alter table public.writing_context_diagnostic_promotions enable row level security;
create policy writing_context_diagnostic_parent_read on public.writing_context_diagnostic_promotions
  for select to authenticated using (parent_user_id=auth.uid());
revoke all on public.writing_context_diagnostic_promotions from public,anon,authenticated;
grant select on public.writing_context_diagnostic_promotions to authenticated;
grant all on public.writing_context_diagnostic_promotions to service_role;

create view public.writing_context_advisory_review_metrics with (security_invoker=true) as
with latest_observation as (
  select distinct on (occurrence_id) * from public.writing_context_advisory_observations
  order by occurrence_id,created_at desc,id desc
), source_rows as (
  select o.id as occurrence_id,o.snapshot_id,
    case when lower(translate(o.observed_text,'’ʼ',chr(39)||chr(39)))=any(array['there','their','they''re']) then 'THERE_THEIR_THEYRE'
      when lower(translate(o.observed_text,'’ʼ',chr(39)||chr(39)))=any(array['to','too','two']) then 'TO_TOO_TWO'
      when lower(translate(o.observed_text,'’ʼ',chr(39)||chr(39)))=any(array['your','you''re']) then 'YOUR_YOURE'
      when lower(translate(o.observed_text,'’ʼ',chr(39)||chr(39)))=any(array['its','it''s']) then 'ITS_ITS' end as family_key
  from public.writing_occurrences o
)
select s.family_key,snapshot.parent_user_id,snapshot.child_id,
  count(*) as occurrence_count,
  count(*) filter(where d.classification is not null) as reviewed_count,
  count(*) filter(where d.classification is null) as pending_count,
  count(*) filter(where d.classification is not null and m.observation_status='NOT_ASSESSED') as unavailable_count,
  count(*) filter(where d.classification=m.observation_status and
    (d.classification<>'INVALID' or d.intended_member=m.alternative_member)) as exact_agreement_count,
  count(*) filter(where m.observation_status='VALID' and d.classification='INVALID') as false_valid_count,
  count(*) filter(where m.observation_status='INVALID' and d.classification='INVALID' and
    d.intended_member<>m.alternative_member) as wrong_alternative_count,
  count(*) filter(where m.observation_status='UNCERTAIN' and d.classification='INVALID') as abstained_error_count,
  count(*) filter(where m.observation_status='UNCERTAIN' and d.classification='VALID') as avoidable_abstention_count
from source_rows s join public.writing_source_snapshots snapshot on snapshot.id=s.snapshot_id
left join latest_observation m on m.occurrence_id=s.occurrence_id
left join public.writing_context_current_parent_decisions d on d.occurrence_id=s.occurrence_id
where s.family_key is not null and snapshot.envelope->>'contextAdvisoryCapture'='true'
group by s.family_key,snapshot.parent_user_id,snapshot.child_id;
revoke all on public.writing_context_advisory_review_metrics from public,anon,authenticated;
grant select on public.writing_context_advisory_review_metrics to authenticated,service_role;
create view public.writing_context_advisory_scope_metrics with (security_invoker=true) as
with latest_observation as (
  select distinct on (occurrence_id) * from public.writing_context_advisory_observations
  order by occurrence_id,created_at desc,id desc
)
select m.family_key,m.assessed_scope,s.parent_user_id,s.child_id,
  count(*) as observed_count,
  count(*) filter(where d.classification is not null) as reviewed_count,
  count(*) filter(where d.classification=m.observation_status and
    (d.classification<>'INVALID' or d.intended_member=m.alternative_member)) as exact_agreement_count
from latest_observation m
join public.writing_source_snapshots s on s.id=m.snapshot_id
left join public.writing_context_current_parent_decisions d on d.occurrence_id=m.occurrence_id
where s.envelope->>'contextAdvisoryCapture'='true'
group by m.family_key,m.assessed_scope,s.parent_user_id,s.child_id;
revoke all on public.writing_context_advisory_scope_metrics from public,anon,authenticated;
grant select on public.writing_context_advisory_scope_metrics to authenticated,service_role;

-- Preserve source atomically for the globally enabled advisory route. Existing
-- child-scoped shadow controls continue to govern only their original runs.
create or replace function public.capture_writing_source_from_submission_job() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.task_submissions%rowtype; t public.course_tasks%rowtype;
        v_shadow_enabled boolean; v_advisory_enabled boolean; snapshot_id uuid; raw_capture jsonb;
begin
  select * into s from public.task_submissions where id=new.submission_id;
  select coalesce((select c.capture_enabled from public.writing_shadow_controls c
    where c.child_id=s.child_id and c.parent_user_id=s.parent_user_id),false) into v_shadow_enabled;
  select enabled into v_advisory_enabled from public.writing_context_advisory_control where singleton=true;
  if not v_shadow_enabled and not coalesce(v_advisory_enabled,false) then return new; end if;
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
