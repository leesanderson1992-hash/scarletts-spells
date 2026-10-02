-- Stage 0B corrective pass. Preserve committed migrations and immutable facts.
-- No provider/advisory control, learning, reward, or registry activation changes.

-- A research candidate is only a pointer. Its governed source deletion removes it.
alter table public.writing_context_research_candidates
  drop constraint writing_context_research_candidates_parent_decision_id_fkey,
  add constraint writing_context_research_candidates_parent_decision_id_fkey
    foreign key(parent_decision_id) references public.writing_context_parent_decisions(id) on delete cascade,
  drop constraint writing_context_research_candidates_parent_added_case_id_fkey,
  add constraint writing_context_research_candidates_parent_added_case_id_fkey
    foreign key(parent_added_case_id) references public.writing_context_parent_added_cases(id) on delete cascade;

-- New decisions explicitly bind shadow evidence. Existing facts are not rewritten;
-- the read model derives historical AI detector identity from its original attempt.
alter table public.writing_context_parent_decisions
  add column ai_attempt_id uuid references public.writing_context_ai_attempts(id);
create or replace function public.link_writing_context_parent_detector_run() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare v_attempt public.writing_context_ai_attempts%rowtype;
        v_observation public.writing_context_advisory_observations%rowtype;
        v_snapshot_id uuid;
begin
  select snapshot_id into v_snapshot_id from public.writing_occurrences where id=new.occurrence_id;
  if new.observation_id is not null then
    select * into v_observation from public.writing_context_advisory_observations
      where id=new.observation_id;
    if v_observation.id is null or v_observation.occurrence_id<>new.occurrence_id or
       v_observation.parent_user_id<>new.parent_user_id or v_observation.child_id<>new.child_id or
       v_observation.family_key<>new.family_key then
      raise exception 'context_reviewed_observation_scope_invalid';
    end if;
    if new.ai_attempt_id is not null and
       new.ai_attempt_id is distinct from v_observation.ai_attempt_id then
      raise exception 'context_reviewed_attempt_mismatch';
    end if;
    new.ai_attempt_id:=v_observation.ai_attempt_id;
  elsif new.ai_attempt_id is null then
    -- A later manual decision carries the original independently bound shadow
    -- evidence, never a newly sampled or newest attempt.
    if exists(select 1 from public.writing_context_parent_added_cases c
      where c.occurrence_id=new.occurrence_id) then
      select c.ai_attempt_id,c.detector_run_id into new.ai_attempt_id,new.detector_run_id
        from public.writing_context_parent_added_cases c
        where c.occurrence_id=new.occurrence_id;
    elsif new.supersedes_decision_id is not null then
      select d.ai_attempt_id,d.detector_run_id into new.ai_attempt_id,new.detector_run_id
        from public.writing_context_parent_decisions d where d.id=new.supersedes_decision_id;
    end if;
  end if;
  if new.ai_attempt_id is not null then
    select * into v_attempt from public.writing_context_ai_attempts where id=new.ai_attempt_id;
    if v_attempt.id is null or v_attempt.occurrence_id<>new.occurrence_id or
       v_attempt.snapshot_id<>v_snapshot_id or v_attempt.parent_user_id<>new.parent_user_id or
       v_attempt.child_id<>new.child_id or v_attempt.family_key<>new.family_key or
       (new.observation_id is null and v_attempt.mode<>'shadow') then
      raise exception 'context_reviewed_attempt_scope_invalid';
    end if;
    new.detector_run_id:=v_attempt.detector_run_id;
  elsif new.observation_id is not null then
    -- V4 has no AI attempt. Match the observation's run identity rather than
    -- attaching a run that was created after that observation.
    select r.id into new.detector_run_id from public.writing_context_detector_runs r
      where r.snapshot_id=v_snapshot_id and r.run_status='COMPLETE'
        and r.run_key=split_part(v_observation.run_key,':',1)
        and r.created_at<=v_observation.created_at
      order by r.created_at desc,r.id desc limit 1;
  elsif new.detector_run_id is null and new.supersedes_decision_id is null and
        not exists(select 1 from public.writing_context_parent_added_cases c
          where c.occurrence_id=new.occurrence_id) then
    select r.id into new.detector_run_id from public.writing_context_detector_runs r
      where r.snapshot_id=v_snapshot_id and r.run_status='COMPLETE'
        and r.created_at<=new.decided_at
      order by r.created_at desc,r.id desc limit 1;
  end if;
  if new.detector_run_id is not null and not exists(
    select 1 from public.writing_context_detector_runs r where r.id=new.detector_run_id
      and r.snapshot_id=v_snapshot_id and r.parent_user_id=new.parent_user_id
      and r.child_id=new.child_id and r.run_status='COMPLETE') then
    raise exception 'context_reviewed_detector_scope_invalid';
  end if;
  return new;
end $$;

create or replace function public.record_parent_added_contextual_occurrence(
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
  if v_attempt_id is not null then
    select detector_run_id into v_detector_id from public.writing_context_ai_attempts
      where id=v_attempt_id;
  else
    select id into v_detector_id from public.writing_context_detector_runs
      where snapshot_id=v_snapshot.id and run_status='COMPLETE'
      order by created_at desc,id desc limit 1;
  end if;
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
      reason_code,writing_issue_id,ai_attempt_id,detector_run_id)
    values(p_occurrence_id,null,p_parent_user_id,v_snapshot.child_id,v_family,
      'INVALID',v_intended,'PARENT_ADDED_MISS',v_issue_id,v_attempt_id,v_detector_id)
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

-- Immutable evidence determines the historical comparison, including legacy rows.
create or replace view public.writing_context_feedback_decisions_v1 with (security_invoker=true) as
select d.id decision_id,d.occurrence_id,d.decided_at,d.classification parent_classification,
  d.intended_member parent_replacement,d.family_key,
  r.id detector_run_id,r.detector_version,r.registry_version,
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
left join public.writing_context_ai_attempts a on a.id=case when o.id is not null then o.ai_attempt_id
  else coalesce(d.ai_attempt_id,c.ai_attempt_id) end
left join public.writing_context_detector_runs r on r.id=case when a.id is not null then a.detector_run_id
  when o.id is not null then d.detector_run_id
  else coalesce(c.detector_run_id,d.detector_run_id) end
left join public.writing_context_detector_members m
  on m.run_id=r.id and m.occurrence_id=d.occurrence_id;

-- Total reviewed is coverage, not accuracy. Comparable includes valid linguistic
-- abstentions resolved by decisive parent truth; NOT_ASSESSED is excluded.
-- The four outcome buckets partition the total; operational NOT_ASSESSED overlaps
-- those buckets as a diagnostic count. Missing AI evidence stays visible.
create or replace view public.writing_context_feedback_ai_metrics_v1 with (security_invoker=true) as
select family_key,coalesce(returned_model,requested_model) model,
  prompt_fingerprint,schema_fingerprint,gate_version,ai_mode,
  count(*)::integer reviewed_count,
  count(*) filter(where ai_outcome='AGREED_VALID')::integer agreed_valid,
  count(*) filter(where ai_outcome='AGREED_INVALID')::integer agreed_invalid,
  count(*) filter(where ai_outcome='AI_FALSE_INVALID')::integer false_invalid,
  count(*) filter(where ai_outcome='AI_MISSED_INVALID')::integer missed_invalid,
  count(*) filter(where ai_outcome='AI_ABSTENTION_RESOLVED')::integer abstentions_resolved,
  count(*) filter(where ai_outcome='REPLACEMENT_CHANGED')::integer replacement_changed,
  count(*) filter(where ai_outcome='NOT_COMPARABLE')::integer not_comparable,
  count(*)::integer total_reviewed_count,
  count(*) filter(where ai_outcome in ('AGREED_VALID','AGREED_INVALID',
    'AI_FALSE_INVALID','AI_MISSED_INVALID','AI_ABSTENTION_RESOLVED',
    'REPLACEMENT_CHANGED'))::integer comparable_count,
  count(*) filter(where ai_outcome='EXCLUDED')::integer excluded_count,
  count(*) filter(where ai_outcome='PARENT_UNRESOLVED')::integer unresolved_count,
  count(*) filter(where ai_status='NOT_ASSESSED')::integer operational_not_assessed_count
from public.writing_context_feedback_decisions_v1
where is_current
group by family_key,coalesce(returned_model,requested_model),
  prompt_fingerprint,schema_fingerprint,gate_version,ai_mode;

-- Current recall uses current parent truth; original decisions remain unchanged.
create or replace view public.writing_context_feedback_detector_metrics_v1 with (security_invoker=true) as
select r.detector_version,r.registry_version,family.family_key,
  count(m.occurrence_id)::integer surfaced,
  count(m.occurrence_id) filter(where d.id is not null)::integer reviewed,
  count(m.occurrence_id) filter(where d.classification='INVALID')::integer parent_confirmed,
  count(m.occurrence_id) filter(where d.classification='EXCLUDED')::integer parent_rejected,
  (select count(*)::integer from public.writing_context_parent_added_cases c
    join public.writing_context_current_parent_decisions current_decision
      on current_decision.occurrence_id=c.occurrence_id
      and current_decision.parent_user_id=c.parent_user_id
      and current_decision.classification='INVALID'
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

-- Checks are the explicit assessed membership for a complete S6 batch. A partial
-- replay counts only its own checked occurrences. Count equality validates batch
-- completion, never full-snapshot coverage. Legacy unlinked rows cannot join.
create or replace view public.writing_spelling_feedback_detector_metrics_v1 with (security_invoker=true) as
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
  (select count(distinct o.id)::integer from public.misspelling_instances m
    join public.writing_occurrences o on o.id=m.source_writing_occurrence_id
    join public.writing_known_spelling_checks assessed
      on assessed.batch_id=b.id and assessed.occurrence_id=o.id
      and assessed.disposition in ('NO_MAPPING','ABSTAINED')
    where m.parent_authored_feedback and not m.is_false_positive
      and o.snapshot_id=b.snapshot_id and o.provenance='learner_response') parent_added_misses
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
