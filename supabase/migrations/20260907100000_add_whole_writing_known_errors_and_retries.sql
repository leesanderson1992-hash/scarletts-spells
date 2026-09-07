-- S6: governed known spelling-error findings and separate learner repair facts.
-- Detection and review materialisation are independently default-off. Nothing
-- in this migration writes learning, reward, proficiency, Authentic Use,
-- review-schedule, or retirement authorities.

alter table public.writing_shadow_controls
  add column known_error_detection_enabled boolean not null default false,
  add column known_error_review_enabled boolean not null default false;

create table public.writing_known_spelling_batches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.writing_shadow_runs(id) on delete cascade,
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  detection_version text not null,
  mapping_authority_fingerprint text not null,
  occurrence_count integer not null check(occurrence_count>=0),
  eligible_occurrence_count integer not null check(eligible_occurrence_count>=0),
  ineligible_occurrence_count integer not null check(ineligible_occurrence_count>=0),
  abstained_occurrence_count integer not null check(abstained_occurrence_count>=0),
  finding_count integer not null check(finding_count>=0),
  created_at timestamptz not null default clock_timestamp(),
  check(eligible_occurrence_count+ineligible_occurrence_count=occurrence_count)
);
create index writing_known_spelling_batches_snapshot_idx
  on public.writing_known_spelling_batches(snapshot_id,created_at desc,id desc);

create table public.writing_known_spelling_checks (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.writing_known_spelling_batches(id) on delete cascade,
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  disposition text not null check(disposition in ('FINDING','NO_MAPPING','ABSTAINED','INELIGIBLE_AUTHORSHIP')),
  finding_key text,
  created_at timestamptz not null default clock_timestamp(),
  unique(batch_id,occurrence_id),
  check((disposition='FINDING')=(finding_key is not null))
);
create index writing_known_spelling_checks_occurrence_idx
  on public.writing_known_spelling_checks(occurrence_id,created_at desc,id desc);

create table public.writing_known_spelling_findings (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null unique references public.writing_known_spelling_checks(id) on delete cascade,
  batch_id uuid not null references public.writing_known_spelling_batches(id) on delete cascade,
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  finding_key text not null,
  observed_normalized text not null,
  intended_normalized text not null,
  mapping_ids uuid[] not null check(cardinality(mapping_ids)>0),
  micro_skill_keys text[] not null check(cardinality(micro_skill_keys)>0),
  authority_references text[] not null check(cardinality(authority_references)>0),
  dialect text not null,
  normalization_version text not null,
  category text not null,
  secondary_category text,
  error_pattern text,
  prior_finding_id uuid references public.writing_known_spelling_findings(id),
  lineage_reconciliation text not null check(lineage_reconciliation in ('ORIGINAL','EXACT_HISTORICAL_MATCH')),
  created_at timestamptz not null default clock_timestamp(),
  unique(batch_id,occurrence_id),
  check((prior_finding_id is null)=(lineage_reconciliation='ORIGINAL')),
  check(observed_normalized<>intended_normalized)
);
create index writing_known_spelling_findings_occurrence_idx
  on public.writing_known_spelling_findings(occurrence_id,created_at desc,id desc);
create index writing_known_spelling_findings_pair_idx
  on public.writing_known_spelling_findings(observed_normalized,intended_normalized,created_at desc);

create trigger writing_known_spelling_batch_immutable before update on public.writing_known_spelling_batches
  for each row execute function public.reject_writing_fact_update();
create trigger writing_known_spelling_check_immutable before update on public.writing_known_spelling_checks
  for each row execute function public.reject_writing_fact_update();
create trigger writing_known_spelling_finding_immutable before update on public.writing_known_spelling_findings
  for each row execute function public.reject_writing_fact_update();

-- A partial E1 replay supersedes only the occurrences it actually checked.
create view public.writing_known_spelling_current_checks
with (security_invoker=true) as
select distinct on(c.occurrence_id) c.*
from public.writing_known_spelling_checks c
join public.writing_known_spelling_batches b on b.id=c.batch_id
join public.writing_shadow_runs r on r.id=b.run_id and r.status='completed'
left join public.writing_shadow_run_enrichment_scopes s on s.run_id=r.id
order by c.occurrence_id,coalesce(s.event_sequence,0) desc,r.completed_at desc,r.id desc,c.id desc;

create view public.writing_known_spelling_current_findings
with (security_invoker=true) as
select f.*
from public.writing_known_spelling_findings f
join public.writing_known_spelling_current_checks c on c.id=f.check_id and c.disposition='FINDING';

alter table public.misspelling_instances
  add column source_writing_occurrence_id text references public.writing_occurrences(id) on delete set null;
alter table public.writing_issue_suggestions
  add column source_writing_occurrence_id text references public.writing_occurrences(id) on delete set null;
alter table public.writing_issues
  add column source_writing_occurrence_id text references public.writing_occurrences(id) on delete set null;
alter table public.writing_issue_correction_attempts
  add column source_writing_occurrence_id text references public.writing_occurrences(id) on delete set null,
  add column correction_outcome text not null default 'unknown' check(correction_outcome in ('correct','incorrect','unknown')),
  add column assistance_state text not null default 'unknown' check(assistance_state in ('independent','scaffolded','answer_visible','unknown')),
  add column answer_visibility text not null default 'unknown' check(answer_visibility in ('not_shown','shown','unknown'));

create unique index misspelling_instances_source_occurrence_key
  on public.misspelling_instances(source_writing_occurrence_id)
  where source_writing_occurrence_id is not null;
create index writing_issue_suggestions_source_occurrence_idx on public.writing_issue_suggestions(source_writing_occurrence_id);
create index writing_issues_source_occurrence_idx on public.writing_issues(source_writing_occurrence_id);
create index writing_issue_attempts_source_occurrence_idx on public.writing_issue_correction_attempts(source_writing_occurrence_id);

create function public.apply_whole_writing_occurrence_lineage() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare expected_occurrence text; source_submission uuid; source_parent uuid; source_child uuid;
begin
  if tg_table_name='misspelling_instances' then
    expected_occurrence:=new.source_writing_occurrence_id;
  elsif tg_table_name='writing_issue_suggestions' then
    if new.misspelling_instance_id is not null then
      select source_writing_occurrence_id into expected_occurrence from public.misspelling_instances where id=new.misspelling_instance_id;
    end if;
  elsif tg_table_name='writing_issues' then
    if new.source_misspelling_instance_id is not null then
      select source_writing_occurrence_id into expected_occurrence from public.misspelling_instances where id=new.source_misspelling_instance_id;
    elsif new.source_suggestion_id is not null then
      select source_writing_occurrence_id into expected_occurrence from public.writing_issue_suggestions where id=new.source_suggestion_id;
    end if;
  elsif tg_table_name='writing_issue_correction_attempts' then
    select source_writing_occurrence_id into expected_occurrence from public.writing_issues where id=new.writing_issue_id;
  end if;
  if expected_occurrence is not null then
    if new.source_writing_occurrence_id is not null and new.source_writing_occurrence_id<>expected_occurrence then
      raise exception 'whole_writing_occurrence_lineage_conflict';
    end if;
    new.source_writing_occurrence_id:=expected_occurrence;
  end if;
  if new.source_writing_occurrence_id is not null then
    select s.submission_id,s.parent_user_id,s.child_id into source_submission,source_parent,source_child
    from public.writing_occurrences o join public.writing_source_snapshots s on s.id=o.snapshot_id
    where o.id=new.source_writing_occurrence_id;
    if source_parent is distinct from new.parent_user_id or source_child is distinct from new.child_id then
      raise exception 'whole_writing_occurrence_scope_invalid';
    end if;
    if tg_table_name='misspelling_instances' then
      if not exists(select 1 from public.writing_samples ws where ws.id=new.writing_sample_id
        and ws.task_submission_id=source_submission and ws.parent_user_id=source_parent and ws.child_id=source_child) then
        raise exception 'whole_writing_occurrence_sample_invalid';
      end if;
    elsif tg_table_name<>'writing_issue_correction_attempts' and new.task_submission_id is not null then
      if new.task_submission_id is distinct from source_submission then
        raise exception 'whole_writing_occurrence_submission_invalid';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger misspelling_whole_writing_lineage before insert or update of source_writing_occurrence_id on public.misspelling_instances
  for each row execute function public.apply_whole_writing_occurrence_lineage();
create trigger suggestion_whole_writing_lineage before insert or update of source_writing_occurrence_id,misspelling_instance_id on public.writing_issue_suggestions
  for each row execute function public.apply_whole_writing_occurrence_lineage();
create trigger issue_whole_writing_lineage before insert or update of source_writing_occurrence_id,source_misspelling_instance_id,source_suggestion_id on public.writing_issues
  for each row execute function public.apply_whole_writing_occurrence_lineage();
create trigger attempt_whole_writing_lineage before insert or update of source_writing_occurrence_id,writing_issue_id on public.writing_issue_correction_attempts
  for each row execute function public.apply_whole_writing_occurrence_lineage();

create function public.protect_writing_correction_attempt_fact() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.writing_issue_id is distinct from old.writing_issue_id
    or new.child_id is distinct from old.child_id
    or new.parent_user_id is distinct from old.parent_user_id
    or new.task_submission_id is distinct from old.task_submission_id
    or new.attempted_correction is distinct from old.attempted_correction
    or new.corrected_independently is distinct from old.corrected_independently
    or new.reflection is distinct from old.reflection
    or new.source_writing_occurrence_id is distinct from old.source_writing_occurrence_id
    or new.correction_outcome is distinct from old.correction_outcome
    or new.assistance_state is distinct from old.assistance_state
    or new.answer_visibility is distinct from old.answer_visibility then
    raise exception 'writing_correction_attempt_fact_immutable';
  end if;
  return new;
end $$;
create trigger writing_correction_attempt_fact_immutable
  before update on public.writing_issue_correction_attempts
  for each row execute function public.protect_writing_correction_attempt_fact();

create function public.persist_writing_shadow_result_with_known_errors(p_run_id uuid,p_lease_token uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
  persisted boolean; r public.writing_shadow_runs%rowtype; source public.writing_source_snapshots%rowtype;
  known jsonb; item jsonb; finding jsonb; v_batch_id uuid; check_id uuid; prior_id uuid;
  mapping_ids uuid[]; skill_keys text[]; authority_refs text[]; occurrence_count integer;
  current_mapping_count integer; authority_invalid boolean;
begin
  persisted:=public.persist_writing_shadow_result(p_run_id,p_lease_token,p_result);
  if not persisted then return false; end if;
  known:=p_result->'knownSpellingErrors';
  if known is null or jsonb_typeof(known)='null' then return true; end if;
  if jsonb_typeof(known)<>'object' then raise exception 'writing_known_error_result_invalid'; end if;
  select * into r from public.writing_shadow_runs where id=p_run_id and status='completed';
  select * into source from public.writing_source_snapshots where id=r.snapshot_id;
  occurrence_count:=jsonb_array_length(coalesce(p_result->'occurrences','[]'::jsonb));
  if jsonb_array_length(coalesce(known->'checks','[]'::jsonb))<>occurrence_count then
    raise exception 'writing_known_error_coverage_incomplete';
  end if;
  insert into public.writing_known_spelling_batches(run_id,snapshot_id,parent_user_id,child_id,detection_version,
    mapping_authority_fingerprint,occurrence_count,eligible_occurrence_count,ineligible_occurrence_count,abstained_occurrence_count,finding_count)
  values(r.id,r.snapshot_id,source.parent_user_id,source.child_id,known->>'version',known->>'mappingAuthorityFingerprint',occurrence_count,
    (known->>'eligibleOccurrenceCount')::integer,(known->>'ineligibleOccurrenceCount')::integer,
    (known->>'abstainedOccurrenceCount')::integer,jsonb_array_length(coalesce(known->'findings','[]'::jsonb)))
  returning id into v_batch_id;
  for item in select value from jsonb_array_elements(coalesce(known->'checks','[]'::jsonb)) loop
    if not exists(select 1 from public.writing_occurrence_interpretations i where i.run_id=r.id and i.occurrence_id=item->>'occurrenceId') then
      raise exception 'writing_known_error_occurrence_unmatched';
    end if;
    insert into public.writing_known_spelling_checks(batch_id,occurrence_id,disposition,finding_key)
    values(v_batch_id,item->>'occurrenceId',item->>'disposition',nullif(item->>'findingKey','')) returning id into check_id;
    if item->>'disposition'='FINDING' then
      select value into finding from jsonb_array_elements(coalesce(known->'findings','[]'::jsonb))
        where value->>'findingKey'=item->>'findingKey' and value->>'occurrenceId'=item->>'occurrenceId';
      if finding is null then raise exception 'writing_known_error_finding_unmatched'; end if;
      select array_agg(value::uuid order by value) into mapping_ids from jsonb_array_elements_text(finding->'mappingIds');
      select array_agg(value order by value) into skill_keys from jsonb_array_elements_text(finding->'microSkillKeys');
      select array_agg(value order by value) into authority_refs from jsonb_array_elements_text(finding->'authorityReferences');
      select count(*),coalesce(bool_or(
        not (current_mapping.mapping_id=any(mapping_ids))
        or current_mapping.correct_spelling_normalized<>finding->>'intendedNormalized'
        or not (current_mapping.micro_skill_key=any(skill_keys))
        or not (current_mapping.authority_reference=any(authority_refs))
      ),false) into current_mapping_count,authority_invalid
      from public.find_resolver_visible_token_safe_canonical_mappings(
        array[finding->>'observedNormalized'],finding->>'dialect',finding->>'normalizationVersion'
      ) current_mapping;
      if current_mapping_count<>cardinality(mapping_ids) or authority_invalid
        or exists(select 1 from unnest(skill_keys) skill where not exists(
          select 1 from public.find_resolver_visible_token_safe_canonical_mappings(
            array[finding->>'observedNormalized'],finding->>'dialect',finding->>'normalizationVersion'
          ) current_mapping where current_mapping.micro_skill_key=skill))
        or exists(select 1 from unnest(authority_refs) authority where not exists(
          select 1 from public.find_resolver_visible_token_safe_canonical_mappings(
            array[finding->>'observedNormalized'],finding->>'dialect',finding->>'normalizationVersion'
          ) current_mapping where current_mapping.authority_reference=authority)) then
        raise exception 'writing_known_error_authority_changed';
      end if;
      select f.id into prior_id from public.writing_known_spelling_findings f
      join public.writing_known_spelling_batches b on b.id=f.batch_id
      where f.occurrence_id=item->>'occurrenceId' and f.finding_key=item->>'findingKey'
      order by b.created_at desc,b.id desc,f.id desc limit 1;
      insert into public.writing_known_spelling_findings(check_id,batch_id,occurrence_id,finding_key,observed_normalized,
        intended_normalized,mapping_ids,micro_skill_keys,authority_references,dialect,normalization_version,category,
        secondary_category,error_pattern,prior_finding_id,lineage_reconciliation)
      values(check_id,v_batch_id,item->>'occurrenceId',finding->>'findingKey',finding->>'observedNormalized',finding->>'intendedNormalized',
        mapping_ids,skill_keys,authority_refs,finding->>'dialect',finding->>'normalizationVersion',finding->>'category',
        nullif(finding->>'secondaryCategory',''),nullif(finding->>'errorPattern',''),prior_id,
        case when prior_id is null then 'ORIGINAL' else 'EXACT_HISTORICAL_MATCH' end);
    end if;
  end loop;
  if (select count(*) from public.writing_known_spelling_checks where batch_id=v_batch_id and disposition<>'INELIGIBLE_AUTHORSHIP')
       <> (known->>'eligibleOccurrenceCount')::integer
    or (select count(*) from public.writing_known_spelling_checks where batch_id=v_batch_id and disposition='INELIGIBLE_AUTHORSHIP')
       <> (known->>'ineligibleOccurrenceCount')::integer
    or (select count(*) from public.writing_known_spelling_checks where batch_id=v_batch_id and disposition='ABSTAINED')
       <> (known->>'abstainedOccurrenceCount')::integer then
    raise exception 'writing_known_error_check_counts_invalid';
  end if;
  if (select count(*) from public.writing_known_spelling_findings where batch_id=v_batch_id) <> jsonb_array_length(coalesce(known->'findings','[]'::jsonb)) then
    raise exception 'writing_known_error_finding_coverage_incomplete';
  end if;
  return true;
end $$;

create view public.writing_known_spelling_observability
with (security_invoker=true) as
select b.child_id,
  count(distinct b.id)::bigint batches,
  count(distinct c.id)::bigint checked_occurrences,
  count(distinct c.id) filter(where c.disposition='FINDING')::bigint findings,
  count(distinct c.id) filter(where c.disposition='NO_MAPPING')::bigint no_mapping,
  count(distinct c.id) filter(where c.disposition='ABSTAINED')::bigint abstained,
  count(distinct c.id) filter(where c.disposition='INELIGIBLE_AUTHORSHIP')::bigint ineligible_authorship,
  count(distinct m.id)::bigint review_candidates,
  count(distinct i.id)::bigint parent_review_issues,
  count(distinct a.id)::bigint retry_attempts,
  count(distinct a.id) filter(where a.correction_outcome='correct')::bigint correct_retries,
  count(distinct a.id) filter(where a.correction_outcome='incorrect')::bigint incorrect_retries,
  count(distinct a.id) filter(where a.assistance_state='unknown')::bigint retries_with_unknown_assistance
from public.writing_known_spelling_batches b
join public.writing_known_spelling_checks c on c.batch_id=b.id
left join public.misspelling_instances m on m.source_writing_occurrence_id=c.occurrence_id
left join public.writing_issues i on i.source_writing_occurrence_id=c.occurrence_id
left join public.writing_issue_correction_attempts a on a.source_writing_occurrence_id=c.occurrence_id
group by b.child_id;

create view public.writing_known_spelling_pair_histories
with (security_invoker=true) as
select b.child_id,f.observed_normalized,f.intended_normalized,
  count(distinct f.occurrence_id)::bigint distinct_occurrences,
  min(s.occurred_at) first_occurred_at,max(s.occurred_at) last_occurred_at,
  count(distinct a.id)::bigint retry_attempts,
  count(distinct a.id) filter(where a.correction_outcome='correct')::bigint correct_retries
from public.writing_known_spelling_findings f
join public.writing_known_spelling_batches b on b.id=f.batch_id
join public.writing_source_snapshots s on s.id=b.snapshot_id
left join public.writing_issue_correction_attempts a on a.source_writing_occurrence_id=f.occurrence_id
group by b.child_id,f.observed_normalized,f.intended_normalized;

create function public.materialize_writing_known_error_review_candidates(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare materialized_count integer;
begin
  if p_limit<1 or p_limit>500 then raise exception 'writing_known_error_materialization_limit_invalid'; end if;
  with eligible as (
    select f.*,o.observed_text,o.field_path,o.start_utf16,o.end_utf16,b.parent_user_id,b.child_id,b.snapshot_id,
      s.submission_id,ws.id writing_sample_id
    from public.writing_known_spelling_current_findings f
    join public.writing_known_spelling_batches b on b.id=f.batch_id
    join public.writing_occurrences o on o.id=f.occurrence_id
    join public.writing_source_snapshots s on s.id=b.snapshot_id
    join public.writing_shadow_controls control on control.child_id=b.child_id and control.parent_user_id=b.parent_user_id
      and control.known_error_review_enabled
    join public.writing_samples ws on ws.task_submission_id=s.submission_id and ws.parent_user_id=b.parent_user_id and ws.child_id=b.child_id
    where not exists(select 1 from public.misspelling_instances m where m.source_writing_occurrence_id=f.occurrence_id)
    order by f.created_at,f.id limit p_limit
  ), exact_legacy_links as (
    select e.occurrence_id,m.id misspelling_id
    from eligible e
    join public.misspelling_instances m on m.writing_sample_id=e.writing_sample_id
      and m.source_writing_occurrence_id is null
      and lower(btrim(m.misspelled_word))=e.observed_normalized
      and lower(btrim(m.corrected_word))=e.intended_normalized
    where (select count(*) from eligible same_finding
      where same_finding.writing_sample_id=e.writing_sample_id
        and same_finding.observed_normalized=e.observed_normalized
        and same_finding.intended_normalized=e.intended_normalized)=1
      and (select count(*) from public.misspelling_instances same_candidate
        where same_candidate.writing_sample_id=e.writing_sample_id
          and same_candidate.source_writing_occurrence_id is null
          and lower(btrim(same_candidate.misspelled_word))=e.observed_normalized
          and lower(btrim(same_candidate.corrected_word))=e.intended_normalized)=1
  ), linked as (
    update public.misspelling_instances m set source_writing_occurrence_id=l.occurrence_id
    from exact_legacy_links l where m.id=l.misspelling_id returning 1
  ), candidates as (
    select e.* from eligible e
    where not exists(select 1 from public.misspelling_instances legacy
      where legacy.writing_sample_id=e.writing_sample_id
        and legacy.source_writing_occurrence_id is null
        and lower(btrim(legacy.misspelled_word))=e.observed_normalized
        and lower(btrim(legacy.corrected_word))=e.intended_normalized)
  ), inserted as (
    insert into public.misspelling_instances(writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,
      context_text,position_start,position_end,notes,error_type,secondary_error_type,confidence_score,suggested_word,
      is_parent_overridden,is_false_positive,source_writing_occurrence_id)
    select writing_sample_id,child_id,parent_user_id,observed_text,intended_normalized,observed_text,null,null,
      jsonb_build_object('detectedPrimaryCategory',category,'detectedErrorPattern',error_pattern,
        'detectionSource','resolver_visible_canonical','selectedWordFamilyId',null,
        'canonicalDetection',jsonb_build_object('detectionSource','resolver_visible_canonical',
          'canonicalMappingId',case when cardinality(mapping_ids)=1 then mapping_ids[1] else null end,
          'canonicalMappingIds',mapping_ids,'canonicalCorrection',intended_normalized,
          'microSkillKey',case when cardinality(micro_skill_keys)=1 then micro_skill_keys[1] else null end,
          'microSkillKeys',micro_skill_keys,'dialectCode',dialect,'normalizationVersion',normalization_version,
          'authorityReferences',authority_references),
        'wholeWritingOccurrence',jsonb_build_object('id',occurrence_id,'fieldPath',field_path,
          'startUtf16',start_utf16,'endUtf16',end_utf16,'findingId',id,'findingKey',finding_key))::text,
      category,secondary_category,1,intended_normalized,false,false,occurrence_id
    from candidates on conflict(source_writing_occurrence_id) where source_writing_occurrence_id is not null do nothing
    returning 1
  ) select (select count(*) from linked)+(select count(*) from inserted) into materialized_count;
  return materialized_count;
end $$;

alter table public.writing_known_spelling_batches enable row level security;
alter table public.writing_known_spelling_checks enable row level security;
alter table public.writing_known_spelling_findings enable row level security;
revoke all on public.writing_known_spelling_batches,public.writing_known_spelling_checks,public.writing_known_spelling_findings,
  public.writing_known_spelling_current_checks,public.writing_known_spelling_current_findings,
  public.writing_known_spelling_observability,public.writing_known_spelling_pair_histories from public,anon,authenticated;
grant all on public.writing_known_spelling_batches,public.writing_known_spelling_checks,public.writing_known_spelling_findings to service_role;
grant select on public.writing_known_spelling_current_checks,public.writing_known_spelling_current_findings,
  public.writing_known_spelling_observability,public.writing_known_spelling_pair_histories to service_role;
revoke all on function public.apply_whole_writing_occurrence_lineage(),
  public.protect_writing_correction_attempt_fact(),
  public.persist_writing_shadow_result_with_known_errors(uuid,uuid,jsonb),
  public.materialize_writing_known_error_review_candidates(integer) from public,anon,authenticated;
grant execute on function public.persist_writing_shadow_result_with_known_errors(uuid,uuid,jsonb),
  public.materialize_writing_known_error_review_candidates(integer) to service_role;

notify pgrst,'reload schema';
