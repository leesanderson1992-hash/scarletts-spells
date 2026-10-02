-- Stage 0B records human feedback as immutable source facts. It grants no
-- analyser authority and does not enable either contextual control.
alter table public.writing_context_ai_attempts
  add column provider_called boolean not null default false;
alter table public.misspelling_instances
  add column parent_authored_feedback boolean not null default false;
create table public.writing_context_detector_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  run_key text not null,
  detector_version text not null,
  registry_version text not null,
  eligible_scope text not null check (eligible_scope='INDEXED_LEARNER_RESPONSE_FOUR_FAMILIES'),
  run_status text not null check (run_status='COMPLETE'),
  surfaced_count integer not null check (surfaced_count>=0),
  created_at timestamptz not null default clock_timestamp(),
  unique(snapshot_id,run_key,detector_version)
);
create table public.writing_context_detector_members (
  run_id uuid not null references public.writing_context_detector_runs(id) on delete cascade,
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  family_key text not null check (family_key in
    ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS')),
  primary key(run_id,occurrence_id)
);
create trigger writing_context_detector_runs_immutable before update on public.writing_context_detector_runs
  for each row execute function public.reject_writing_fact_update();
create trigger writing_context_detector_members_immutable before update on public.writing_context_detector_members
  for each row execute function public.reject_writing_fact_update();
alter table public.writing_context_detector_runs enable row level security;
alter table public.writing_context_detector_members enable row level security;
revoke all on public.writing_context_detector_runs,public.writing_context_detector_members from public,anon,authenticated;
grant all on public.writing_context_detector_runs,public.writing_context_detector_members to service_role;

alter table public.writing_context_ai_attempts
  add column detector_run_id uuid references public.writing_context_detector_runs(id),
  add column candidate_detector_version text,
  add column family_registry_version text,
  add constraint writing_context_ai_detector_lineage_complete check (
    (detector_run_id is null and candidate_detector_version is null and family_registry_version is null) or
    (detector_run_id is not null and candidate_detector_version is not null and family_registry_version is not null));
create function public.assert_writing_context_ai_detector_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.detector_run_id is not null and not exists(
    select 1 from public.writing_context_detector_runs r
    where r.id=new.detector_run_id and r.snapshot_id=new.snapshot_id and
      r.parent_user_id=new.parent_user_id and r.child_id=new.child_id and
      r.detector_version=new.candidate_detector_version and
      r.registry_version=new.family_registry_version and r.run_status='COMPLETE') then
    raise exception 'context_ai_detector_scope_invalid';
  end if;
  return new;
end $$;
create trigger writing_context_ai_detector_scope before insert
  on public.writing_context_ai_attempts for each row
  execute function public.assert_writing_context_ai_detector_scope();

-- One transaction makes a complete candidate set visible. An interrupted
-- worker cannot leave a run falsely marked complete.
create function public.record_writing_context_detector_run(
  p_snapshot_id uuid,p_parent_user_id uuid,p_child_id uuid,p_run_key text,
  p_detector_version text,p_registry_version text,p_occurrence_ids text[]
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.writing_context_detector_runs%rowtype;
        v_id text; v_observed text; v_family text;
begin
  if nullif(btrim(p_run_key),'') is null or nullif(btrim(p_detector_version),'') is null or
     nullif(btrim(p_registry_version),'') is null or p_occurrence_ids is null or
     cardinality(p_occurrence_ids)>10000 or
     (select count(distinct x) from unnest(p_occurrence_ids) x)<>cardinality(p_occurrence_ids) then
    raise exception 'context_detector_run_invalid';
  end if;
  if not exists(select 1 from public.writing_source_snapshots s where s.id=p_snapshot_id
    and s.parent_user_id=p_parent_user_id and s.child_id=p_child_id) then
    raise exception 'context_detector_snapshot_scope_invalid';
  end if;
  select * into v_run from public.writing_context_detector_runs
    where snapshot_id=p_snapshot_id and run_key=p_run_key and detector_version=p_detector_version;
  if v_run.id is not null then
    if v_run.parent_user_id<>p_parent_user_id or v_run.child_id<>p_child_id or
       v_run.registry_version<>p_registry_version or
       v_run.surfaced_count<>cardinality(p_occurrence_ids) or
       exists(select 1 from unnest(p_occurrence_ids) x where not exists(
         select 1 from public.writing_context_detector_members m
         where m.run_id=v_run.id and m.occurrence_id=x)) then
      raise exception 'context_detector_run_collision';
    end if;
    return v_run.id;
  end if;
  insert into public.writing_context_detector_runs(snapshot_id,parent_user_id,child_id,
    run_key,detector_version,registry_version,eligible_scope,run_status,surfaced_count)
  values(p_snapshot_id,p_parent_user_id,p_child_id,p_run_key,p_detector_version,
    p_registry_version,'INDEXED_LEARNER_RESPONSE_FOUR_FAMILIES','COMPLETE',
    cardinality(p_occurrence_ids)) returning * into v_run;
  foreach v_id in array p_occurrence_ids loop
    select lower(replace(replace(o.observed_text,'’',chr(39)),'ʼ',chr(39)))
      into v_observed from public.writing_occurrences o
      where o.id=v_id and o.snapshot_id=p_snapshot_id and o.provenance='learner_response';
    v_family:=case
      when v_observed=any(array['there','their','they''re']) then 'THERE_THEIR_THEYRE'
      when v_observed=any(array['to','too','two']) then 'TO_TOO_TWO'
      when v_observed=any(array['your','you''re']) then 'YOUR_YOURE'
      when v_observed=any(array['its','it''s']) then 'ITS_ITS'
      else null end;
    if v_family is null then raise exception 'context_detector_member_out_of_scope'; end if;
    insert into public.writing_context_detector_members(run_id,occurrence_id,family_key)
      values(v_run.id,v_id,v_family);
  end loop;
  return v_run.id;
end $$;
revoke all on function public.record_writing_context_detector_run(uuid,uuid,uuid,text,text,text,text[])
  from public,anon,authenticated;
grant execute on function public.record_writing_context_detector_run(uuid,uuid,uuid,text,text,text,text[])
  to service_role;

alter table public.writing_context_parent_decisions
  add column detector_run_id uuid references public.writing_context_detector_runs(id);
create function public.link_writing_context_parent_detector_run() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  select r.id into new.detector_run_id from public.writing_context_detector_runs r
    join public.writing_occurrences o on o.snapshot_id=r.snapshot_id
    where o.id=new.occurrence_id and r.run_status='COMPLETE' and
      r.created_at<=new.decided_at
    order by r.created_at desc,r.id desc limit 1;
  return new;
end $$;
create trigger writing_context_parent_detector_link before insert
  on public.writing_context_parent_decisions for each row
  execute function public.link_writing_context_parent_detector_run();

-- A parent may identify a contextual mistake outside the four routed AI
-- families. The case is local to this writing event, never a global family.
create table public.writing_context_parent_added_cases (
  id uuid primary key default gen_random_uuid(),
  occurrence_id text not null unique references public.writing_occurrences(id) on delete cascade,
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  intended_member text not null,
  pair_fingerprint text not null,
  governed_family_key text check (governed_family_key in
    ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS')),
  parent_decision_id uuid unique references public.writing_context_parent_decisions(id),
  detector_run_id uuid references public.writing_context_detector_runs(id),
  ai_attempt_id uuid references public.writing_context_ai_attempts(id),
  writing_issue_id uuid not null unique references public.writing_issues(id),
  created_at timestamptz not null default clock_timestamp(),
  check ((governed_family_key is null)=(parent_decision_id is null))
);
create trigger writing_context_parent_added_immutable before update on public.writing_context_parent_added_cases
  for each row execute function public.reject_writing_fact_update();
alter table public.writing_context_parent_added_cases enable row level security;
create policy writing_context_parent_added_owner_read on public.writing_context_parent_added_cases
  for select to authenticated using(parent_user_id=auth.uid());
revoke all on public.writing_context_parent_added_cases from public,anon,authenticated;
grant select on public.writing_context_parent_added_cases to authenticated;
grant all on public.writing_context_parent_added_cases to service_role;

-- Same Admin "No matching skill" queue, with a distinct contextual source.
create table public.writing_context_catalog_review_cases (
  id uuid primary key default gen_random_uuid(),
  parent_added_case_id uuid not null unique references public.writing_context_parent_added_cases(id) on delete cascade,
  case_status text not null default 'open' check(case_status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  check ((case_status='open')=(reviewed_at is null))
);
alter table public.writing_context_catalog_review_cases enable row level security;
revoke all on public.writing_context_catalog_review_cases from public,anon,authenticated;
grant all on public.writing_context_catalog_review_cases to service_role;
create table public.writing_context_catalog_decisions (
  id uuid primary key default gen_random_uuid(),
  catalog_case_id uuid not null unique references public.writing_context_catalog_review_cases(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check(decision in ('reviewed','dismissed')),
  decided_at timestamptz not null default clock_timestamp()
);
create trigger writing_context_catalog_decisions_immutable before update on public.writing_context_catalog_decisions
  for each row execute function public.reject_writing_fact_update();
alter table public.writing_context_catalog_decisions enable row level security;
revoke all on public.writing_context_catalog_decisions from public,anon,authenticated;
grant all on public.writing_context_catalog_decisions to service_role;
create function public.resolve_writing_context_catalog_case(
  p_case_id uuid,p_admin_user_id uuid,p_decision text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if p_decision not in ('reviewed','dismissed') or p_admin_user_id is null then
    raise exception 'context_catalog_decision_invalid'; end if;
  update public.writing_context_catalog_review_cases
    set case_status=p_decision,reviewed_at=clock_timestamp()
    where id=p_case_id and case_status='open' returning id into v_id;
  if v_id is null then raise exception 'context_catalog_case_not_open'; end if;
  insert into public.writing_context_catalog_decisions(catalog_case_id,admin_user_id,decision)
    values(v_id,p_admin_user_id,p_decision);
  return v_id;
end $$;
revoke all on function public.resolve_writing_context_catalog_case(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.resolve_writing_context_catalog_case(uuid,uuid,text)
  to service_role;

-- The app authenticates the parent, then the database rechecks ownership and
-- source identity. Only the parent decision transaction creates a repair issue.
create function public.record_parent_added_contextual_occurrence(
  p_occurrence_id text,p_parent_user_id uuid,p_field_hash text,
  p_observed_text text,p_intended_member text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_occurrence public.writing_occurrences%rowtype;
        v_snapshot public.writing_source_snapshots%rowtype;
        v_observed text; v_intended text; v_family text; v_members text[];
        v_issue_id uuid; v_decision_id uuid; v_case_id uuid; v_attempt_id uuid;
        v_detector_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_occurrence_id,0));
  select * into v_occurrence from public.writing_occurrences where id=p_occurrence_id;
  select * into v_snapshot from public.writing_source_snapshots where id=v_occurrence.snapshot_id;
  if v_snapshot.id is null or v_snapshot.parent_user_id<>p_parent_user_id or
     v_occurrence.provenance<>'learner_response' or v_occurrence.field_hash<>p_field_hash or
     v_occurrence.observed_text<>p_observed_text or
     exists(select 1 from public.writing_context_parent_added_cases where occurrence_id=p_occurrence_id) or
     exists(select 1 from public.writing_context_current_parent_decisions where occurrence_id=p_occurrence_id) or
     exists(select 1 from public.writing_issues where source_writing_occurrence_id=p_occurrence_id
       and metadata->>'source_kind'='contextual_advisory_v4') then
    raise exception 'parent_added_context_scope_invalid';
  end if;
  v_observed:=lower(replace(replace(v_occurrence.observed_text,'’',chr(39)),'ʼ',chr(39)));
  v_intended:=lower(replace(replace(btrim(p_intended_member),'’',chr(39)),'ʼ',chr(39)));
  if v_intended is null or length(v_intended)>60 or
     v_intended !~ '^[[:alpha:]][[:alpha:]''-]*$' or
     v_observed=v_intended then raise exception 'parent_added_context_replacement_invalid'; end if;
  case
    when v_observed=any(array['there','their','they''re']) then
      v_family:='THERE_THEIR_THEYRE'; v_members:=array['there','their','they''re'];
    when v_observed=any(array['to','too','two']) then
      v_family:='TO_TOO_TWO'; v_members:=array['to','too','two'];
    when v_observed=any(array['your','you''re']) then
      v_family:='YOUR_YOURE'; v_members:=array['your','you''re'];
    when v_observed=any(array['its','it''s']) then
      v_family:='ITS_ITS'; v_members:=array['its','it''s'];
    else v_family:=null;
  end case;
  if v_family is not null and not v_intended=any(v_members) then
    raise exception 'parent_added_context_cross_family'; end if;
  select id into v_attempt_id from public.writing_context_ai_attempts
    where occurrence_id=p_occurrence_id and snapshot_id=v_snapshot.id
      and mode='shadow' and created_at<=clock_timestamp()
    order by created_at desc,id desc limit 1;
  select id into v_detector_id from public.writing_context_detector_runs
    where snapshot_id=v_snapshot.id and run_status='COMPLETE'
    order by created_at desc,id desc limit 1;
  insert into public.writing_issues(child_id,parent_user_id,task_submission_id,
    issue_status,observed_text,suggested_replacement,approved_replacement,
    context_text,source_field_key,micro_skill_key,parent_marked_at,metadata,
    source_writing_occurrence_id)
  values(v_snapshot.child_id,p_parent_user_id,v_snapshot.submission_id,
    'pending_parent_review',v_occurrence.observed_text,v_intended,v_intended,
    v_occurrence.observed_text,v_occurrence.field_path,'unknown',clock_timestamp(),
    jsonb_build_object('source_kind','contextual_advisory_v4',
      'feedback_origin','parent_added','evidence_kind','REPAIR_ONLY',
      'source_writing_occurrence_id',p_occurrence_id,
      'snapshot_field_path',v_occurrence.field_path),p_occurrence_id)
  returning id into v_issue_id;
  if v_family is not null then
    insert into public.writing_context_parent_decisions(occurrence_id,observation_id,
      parent_user_id,child_id,family_key,classification,intended_member,
      reason_code,writing_issue_id)
    values(p_occurrence_id,null,p_parent_user_id,v_snapshot.child_id,v_family,
      'INVALID',v_intended,'PARENT_ADDED_MISS',v_issue_id)
    returning id into v_decision_id;
  end if;
  insert into public.writing_context_parent_added_cases(occurrence_id,snapshot_id,
    parent_user_id,child_id,intended_member,pair_fingerprint,governed_family_key,
    parent_decision_id,detector_run_id,ai_attempt_id,writing_issue_id)
  values(p_occurrence_id,v_snapshot.id,p_parent_user_id,v_snapshot.child_id,
    v_intended,encode(digest(least(v_observed,v_intended)||':'||greatest(v_observed,v_intended),'sha256'),'hex'),
    v_family,v_decision_id,
    v_detector_id,
    v_attempt_id,v_issue_id) returning id into v_case_id;
  if v_family is null then
    insert into public.writing_context_catalog_review_cases(parent_added_case_id) values(v_case_id);
  end if;
  return v_case_id;
end $$;
revoke all on function public.record_parent_added_contextual_occurrence(text,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_parent_added_contextual_occurrence(text,uuid,text,text,text)
  to service_role;

-- The old issue source tag remains a repair-workflow discriminator. A local
-- parent-added pair must never enter the governed contextual ADLE handoff.
create function public.reject_parent_added_contextual_handoff() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.writing_context_parent_added_cases c
    where c.writing_issue_id=new.writing_issue_id and c.governed_family_key is null) then
    raise exception 'parent_added_unknown_family_has_no_learning_authority';
  end if;
  return new;
end $$;
create trigger writing_context_parent_added_handoff_guard before insert or update
  on public.writing_context_learning_handoffs for each row
  execute function public.reject_parent_added_contextual_handoff();
create function public.reject_parent_added_contextual_adle_item() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare v_issue_id uuid;
begin
  if new.source_kind='parent_verified_contextual_choice' and
     new.source_ref ~ '^contextual_writing_issue:[0-9a-f-]{36}$' then
    v_issue_id:=split_part(new.source_ref,':',2)::uuid;
    if exists(select 1 from public.writing_context_parent_added_cases c
      where c.writing_issue_id=v_issue_id and c.governed_family_key is null) then
      raise exception 'parent_added_unknown_family_has_no_adle_authority';
    end if;
  end if;
  return new;
end $$;
create trigger writing_context_parent_added_adle_guard before insert or update
  on public.adle_learning_items for each row
  execute function public.reject_parent_added_contextual_adle_item();

-- A learning-relevant parent label can be recorded for a new pair, but has
-- no curriculum authority. Keep the original governed finaliser unchanged.
create function public.finalise_parent_added_contextual_repair(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid,p_outcome text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype;
begin
  if p_outcome not in ('checking_only','not_an_issue','concept_gap',
    'fragile_knowledge','transfer_failure') then
    raise exception 'parent_added_repair_outcome_invalid'; end if;
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id for update;
  if v_issue.id is null or v_issue.issue_status<>'child_responded' or
     v_issue.final_classification is not null or not exists(
       select 1 from public.writing_context_parent_added_cases c
       where c.writing_issue_id=v_issue.id and c.parent_user_id=p_parent_user_id
         and c.child_id=p_child_id and c.governed_family_key is null) then
    raise exception 'parent_added_repair_scope_invalid'; end if;
  update public.writing_issues set issue_status='finalised',
    final_classification=p_outcome,final_classified_at=clock_timestamp(),
    metadata=metadata||jsonb_build_object('evidence_kind','REPAIR_ONLY',
      'learning_projection','BLOCKED_UNGOVERNED_CONTEXTUAL_PAIR'),
    updated_at=clock_timestamp() where id=p_writing_issue_id;
  return p_writing_issue_id;
end $$;
revoke all on function public.finalise_parent_added_contextual_repair(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.finalise_parent_added_contextual_repair(uuid,uuid,uuid,text)
  to service_role;

-- Promotion is a research candidate only. Adjudication and corpus freezing
-- are separate, access-controlled processes outside this migration.
create table public.writing_context_research_candidates (
  id uuid primary key default gen_random_uuid(),
  parent_decision_id uuid unique references public.writing_context_parent_decisions(id),
  parent_added_case_id uuid unique references public.writing_context_parent_added_cases(id),
  category text not null check(category in
    ('AI_DISAGREEMENT','DETECTION_MISS','ABSTENTION','REPLACEMENT','OTHER')),
  status text not null default 'candidate' check(status='candidate'),
  created_at timestamptz not null default clock_timestamp(),
  check ((parent_decision_id is null)<>(parent_added_case_id is null))
);
alter table public.writing_context_research_candidates enable row level security;
revoke all on public.writing_context_research_candidates from public,anon,authenticated;
grant all on public.writing_context_research_candidates to service_role;

-- Comparisons bind to the observation the parent decision actually references,
-- or to the shadow attempt captured by an independently parent-added case.
create view public.writing_context_feedback_decisions_v1 with (security_invoker=true) as
select d.id decision_id,d.occurrence_id,d.decided_at,d.classification parent_classification,
  d.intended_member parent_replacement,d.family_key,
  d.detector_run_id,r.detector_version,r.registry_version,
  o.id observation_id,a.id ai_attempt_id,a.mode ai_mode,
  a.provider,a.model requested_model,a.returned_model,a.prompt_fingerprint,
  a.schema_fingerprint,a.gate_version,a.result_status ai_status,
  a.alternative_member ai_replacement,a.reason_code ai_reason_code,
  case
    when d.classification='EXCLUDED' then 'EXCLUDED'
    when a.id is null or a.result_status='NOT_ASSESSED' then 'NOT_COMPARABLE'
    when a.result_status='VALID' and d.classification='VALID' then 'AGREED_VALID'
    when a.result_status='INVALID' and d.classification='INVALID' and
      a.alternative_member=d.intended_member then 'AGREED_INVALID'
    when a.result_status='INVALID' and d.classification='INVALID' then 'REPLACEMENT_CHANGED'
    when a.result_status='INVALID' and d.classification='VALID' then 'AI_FALSE_INVALID'
    when a.result_status='VALID' and d.classification='INVALID' then 'AI_MISSED_INVALID'
    when a.result_status='UNCERTAIN' and d.classification in ('VALID','INVALID')
      then 'AI_ABSTENTION_RESOLVED'
    else 'PARENT_UNRESOLVED' end ai_outcome,
  case
    when r.id is null then 'NOT_COMPARABLE'
    when m.occurrence_id is not null and d.classification='INVALID' then 'SURFACED_CONFIRMED'
    when m.occurrence_id is not null and d.classification='EXCLUDED' then 'SURFACED_REJECTED'
    when c.id is not null and d.classification='INVALID' then 'PARENT_ADDED_MISS'
    else 'NOT_COMPARABLE' end detector_outcome,
  not exists(select 1 from public.writing_context_parent_decisions newer
    where newer.supersedes_decision_id=d.id) is_current
from public.writing_context_parent_decisions d
left join public.writing_context_advisory_observations o on o.id=d.observation_id
left join public.writing_context_parent_added_cases c on c.occurrence_id=d.occurrence_id
left join public.writing_context_ai_attempts a on a.id=coalesce(o.ai_attempt_id,c.ai_attempt_id)
left join public.writing_context_detector_runs r on r.id=d.detector_run_id
left join public.writing_context_detector_members m
  on m.run_id=r.id and m.occurrence_id=d.occurrence_id;
revoke all on public.writing_context_feedback_decisions_v1 from public,anon,authenticated;
grant select on public.writing_context_feedback_decisions_v1 to service_role;

create view public.writing_context_feedback_ai_metrics_v1 with (security_invoker=true) as
select family_key,coalesce(returned_model,requested_model) model,
  prompt_fingerprint,schema_fingerprint,gate_version,ai_mode,
  count(*)::integer reviewed_count,
  count(*) filter(where ai_outcome='AGREED_VALID')::integer agreed_valid,
  count(*) filter(where ai_outcome='AGREED_INVALID')::integer agreed_invalid,
  count(*) filter(where ai_outcome='AI_FALSE_INVALID')::integer false_invalid,
  count(*) filter(where ai_outcome='AI_MISSED_INVALID')::integer missed_invalid,
  count(*) filter(where ai_outcome='AI_ABSTENTION_RESOLVED')::integer abstentions_resolved,
  count(*) filter(where ai_outcome='REPLACEMENT_CHANGED')::integer replacement_changed,
  count(*) filter(where ai_outcome='NOT_COMPARABLE')::integer not_comparable
from public.writing_context_feedback_decisions_v1
where is_current and ai_attempt_id is not null
group by family_key,coalesce(returned_model,requested_model),
  prompt_fingerprint,schema_fingerprint,gate_version,ai_mode;
revoke all on public.writing_context_feedback_ai_metrics_v1 from public,anon,authenticated;
grant select on public.writing_context_feedback_ai_metrics_v1 to service_role;

create view public.writing_context_feedback_detector_metrics_v1 with (security_invoker=true) as
select r.detector_version,r.registry_version,family.family_key,
  count(m.occurrence_id)::integer surfaced,
  count(m.occurrence_id) filter(where d.id is not null)::integer reviewed,
  count(m.occurrence_id) filter(where d.classification='INVALID')::integer parent_confirmed,
  count(m.occurrence_id) filter(where d.classification='EXCLUDED')::integer parent_rejected,
  (select count(*)::integer from public.writing_context_parent_added_cases c
    where c.detector_run_id=r.id and c.governed_family_key=family.family_key
      and not exists(select 1 from public.writing_context_detector_members x
        where x.run_id=r.id and x.occurrence_id=c.occurrence_id)) parent_added_misses
from public.writing_context_detector_runs r
cross join (values ('THERE_THEIR_THEYRE'),('TO_TOO_TWO'),
  ('YOUR_YOURE'),('ITS_ITS')) family(family_key)
left join public.writing_context_detector_members m on m.run_id=r.id
  and m.family_key=family.family_key
left join public.writing_context_current_parent_decisions d on d.occurrence_id=m.occurrence_id
group by r.id,r.detector_version,r.registry_version,family.family_key;
revoke all on public.writing_context_feedback_detector_metrics_v1 from public,anon,authenticated;
grant select on public.writing_context_feedback_detector_metrics_v1 to service_role;

-- Reuse S6's immutable, versioned known-spelling checks. This view includes
-- only completed full-snapshot batches; unlinked legacy missed words are
-- excluded from the recall proxy. A parent-created issue is confirmation,
-- while an explicit rejection remains a reviewed false positive.
create view public.writing_spelling_feedback_detector_metrics_v1 with (security_invoker=true) as
select b.id batch_id,b.detection_version,b.mapping_authority_fingerprint,
  b.occurrence_count,b.eligible_occurrence_count,
  count(c.id) filter(where c.disposition='FINDING')::integer surfaced,
  count(c.id) filter(where c.disposition='FINDING' and parent_issue.id is not null and
    not (parent_issue.issue_status='finalised' and
      parent_issue.final_classification='not_an_issue'))::integer parent_confirmed,
  count(c.id) filter(where c.disposition='FINDING' and
    (parent_issue.id is null or (parent_issue.issue_status='finalised' and
      parent_issue.final_classification='not_an_issue')) and
    ((parent_issue.issue_status='finalised' and parent_issue.final_classification='not_an_issue') or
     exists(select 1 from public.writing_issue_suggestions s
      where s.source_writing_occurrence_id=c.occurrence_id and s.suggestion_status='rejected') or
     exists(select 1 from public.misspelling_instances m
      where m.source_writing_occurrence_id=c.occurrence_id and m.is_false_positive=true)))::integer parent_rejected,
  (select count(*)::integer from public.misspelling_instances m
    join public.writing_occurrences o on o.id=m.source_writing_occurrence_id
    where m.parent_authored_feedback and o.snapshot_id=b.snapshot_id and
      o.provenance='learner_response' and not exists(
        select 1 from public.writing_known_spelling_checks checked
        where checked.batch_id=b.id and checked.occurrence_id=o.id
          and checked.disposition='FINDING')) parent_added_misses
from public.writing_known_spelling_batches b
join public.writing_shadow_runs run on run.id=b.run_id and run.status='completed'
left join public.writing_known_spelling_checks c on c.batch_id=b.id
left join lateral (
  select i.id,i.issue_status,i.final_classification from public.writing_issues i
  where i.source_writing_occurrence_id=c.occurrence_id
  order by i.created_at desc,i.id desc limit 1
) parent_issue on true
where (select count(*) from public.writing_known_spelling_checks checked
       where checked.batch_id=b.id)=b.occurrence_count
group by b.id,b.detection_version,b.mapping_authority_fingerprint,
  b.occurrence_count,b.eligible_occurrence_count,b.snapshot_id;
revoke all on public.writing_spelling_feedback_detector_metrics_v1 from public,anon,authenticated;
grant select on public.writing_spelling_feedback_detector_metrics_v1 to service_role;

create view public.writing_context_feedback_operations_v1 with (security_invoker=true) as
select family_key,mode,provider,model,returned_model,prompt_fingerprint,
  schema_fingerprint,gate_version,candidate_detector_version,family_registry_version,
  result_status,reason_code,pricing_version,
  count(*)::integer attempts,
  count(*) filter(where provider_called)::integer provider_calls,
  count(*) filter(where provider_called and result_status<>'NOT_ASSESSED')::integer assessed,
  count(*) filter(where provider_request_id is not null)::integer provider_responses_with_id,
  avg(latency_ms)::numeric(12,2) average_latency_ms,
  percentile_cont(0.5) within group(order by latency_ms) median_latency_ms,
  percentile_cont(0.95) within group(order by latency_ms) p95_latency_ms,
  sum(input_tokens)::bigint input_tokens,
  sum(cached_input_tokens)::bigint cached_input_tokens,
  sum(output_tokens)::bigint output_tokens,
  sum(calculated_cost_usd)::numeric(16,8) estimated_cost_usd
from public.writing_context_ai_attempts
group by family_key,mode,provider,model,returned_model,prompt_fingerprint,
  schema_fingerprint,gate_version,candidate_detector_version,family_registry_version,
  result_status,reason_code,pricing_version;
revoke all on public.writing_context_feedback_operations_v1 from public,anon,authenticated;
grant select on public.writing_context_feedback_operations_v1 to service_role;
