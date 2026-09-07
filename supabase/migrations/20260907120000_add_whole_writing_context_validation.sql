-- Whole-writing S8: independently versioned, append-only contextual-use
-- analysis and a family-gated adapter into the existing parent review.
-- No context result writes learning, rewards, proficiency, Authentic Use,
-- review schedules, or retirement authorities.

alter table public.writing_shadow_controls
  add column context_processing_enabled boolean not null default false,
  add column context_retrospective_enabled boolean not null default false,
  add column context_review_enabled boolean not null default false;

create table public.writing_context_family_releases (
  id uuid primary key,
  release_key text not null unique,
  family_key text not null check(family_key in ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS')),
  registry_version text not null,
  analyser_version text not null,
  corpus_version text not null,
  members text[] not null check(cardinality(members)>=2),
  manifest jsonb not null check(jsonb_typeof(manifest)='object'),
  manifest_fingerprint text not null,
  created_at timestamptz not null default clock_timestamp()
);

create table public.writing_context_family_selection_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  environment_key text not null check(environment_key in ('local','staging','production')),
  family_key text not null check(family_key in ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS')),
  release_id uuid not null references public.writing_context_family_releases(id),
  action text not null check(action in ('selected','withdrawn')),
  authority_reference text not null,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp(),
  unique(environment_key,family_key,authority_reference)
);

create view public.writing_context_current_family_selections
with (security_invoker=true) as
select distinct on(environment_key,family_key)
  id selection_event_id,event_sequence,environment_key,family_key,release_id,action,authority_reference,recorded_at
from public.writing_context_family_selection_events
order by environment_key,family_key,event_sequence desc,id desc;

create table public.writing_context_family_approval_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  environment_key text not null check(environment_key in ('local','staging','production')),
  family_key text not null check(family_key in ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS')),
  release_id uuid not null references public.writing_context_family_releases(id),
  action text not null check(action in ('approved','withdrawn')),
  corpus_version text not null,
  evaluation_fingerprint text not null,
  quality_limits jsonb not null check(jsonb_typeof(quality_limits)='object'),
  evaluation_metrics jsonb not null check(jsonb_typeof(evaluation_metrics)='object'),
  authority_reference text not null,
  approved_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp(),
  unique(environment_key,family_key,authority_reference)
);

create view public.writing_context_current_family_approvals
with (security_invoker=true) as
select distinct on(environment_key,family_key)
  id approval_event_id,event_sequence,environment_key,family_key,release_id,action,corpus_version,
  evaluation_fingerprint,quality_limits,evaluation_metrics,authority_reference,approved_by,recorded_at
from public.writing_context_family_approval_events
order by environment_key,family_key,event_sequence desc,id desc;

create function public.assert_writing_context_family_event_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.writing_context_family_releases release
    where release.id=new.release_id and release.family_key=new.family_key)
    then raise exception 'writing_context_family_release_mismatch'; end if;
  if tg_table_name='writing_context_family_approval_events' then
    if not exists(
      select 1 from public.writing_context_family_releases release where release.id=new.release_id
        and release.corpus_version=new.corpus_version)
      then raise exception 'writing_context_approval_corpus_mismatch'; end if;
  end if;
  return new;
end $$;
create trigger writing_context_selection_scope before insert on public.writing_context_family_selection_events
  for each row execute function public.assert_writing_context_family_event_scope();
create trigger writing_context_approval_scope before insert on public.writing_context_family_approval_events
  for each row execute function public.assert_writing_context_family_event_scope();

create table public.writing_context_jobs (
  id uuid primary key default gen_random_uuid(),
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  interpretation_id uuid not null references public.writing_occurrence_interpretations(id) on delete cascade,
  assessment_id uuid not null references public.writing_occurrence_assessments(id) on delete cascade,
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  environment_key text not null check(environment_key in ('local','staging','production')),
  family_key text not null check(family_key in ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS')),
  release_id uuid not null references public.writing_context_family_releases(id),
  status text not null default 'pending' check(status in ('pending','processing','failed','completed')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 8),
  lease_token uuid,
  started_at timestamptz,
  next_retry_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  error_code text check(error_code is null or error_code in ('ANALYSIS_FAILED','LEASE_EXPIRED','SOURCE_INVALID','DEPENDENCY_STALE')),
  created_at timestamptz not null default clock_timestamp(),
  unique(interpretation_id,release_id),
  check(status<>'completed' or completed_at is not null)
);
create index writing_context_jobs_pending_idx on public.writing_context_jobs(environment_key,next_retry_at,created_at)
  where status in ('pending','processing','failed');
create index writing_context_jobs_occurrence_idx on public.writing_context_jobs(occurrence_id,created_at desc,id desc);

create table public.writing_context_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.writing_context_jobs(id) on delete cascade,
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  interpretation_id uuid not null references public.writing_occurrence_interpretations(id) on delete cascade,
  assessment_id uuid not null references public.writing_occurrence_assessments(id) on delete cascade,
  release_id uuid not null references public.writing_context_family_releases(id),
  family_key text not null,
  result_status text not null check(result_status in ('NOT_ASSESSED','VALID','INVALID','UNCERTAIN')),
  observed_canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  alternative_canonical_word_id uuid references public.canonical_teaching_dictionary_words(id),
  observed_member text not null,
  alternative_member text,
  assessed_scope text not null,
  reason_code text not null,
  rule_id text not null,
  analyser_version text not null,
  registry_version text not null,
  corpus_version text not null,
  manifest_fingerprint text not null,
  interpretation_fingerprint text not null,
  mapping_authority_fingerprint text not null,
  context_excerpt text not null,
  excerpt_start_utf16 integer not null check(excerpt_start_utf16>=0),
  excerpt_end_utf16 integer not null check(excerpt_end_utf16>excerpt_start_utf16),
  result_fingerprint text not null,
  created_at timestamptz not null default clock_timestamp(),
  check((result_status='INVALID')=(alternative_canonical_word_id is not null and alternative_member is not null))
);
create index writing_context_results_occurrence_idx on public.writing_context_results(occurrence_id,created_at desc,id desc);
create index writing_context_results_family_idx on public.writing_context_results(family_key,result_status,created_at desc);

create view public.writing_context_current_results
with (security_invoker=true) as
select result.*
from public.writing_context_results result
join public.writing_context_jobs job on job.id=result.job_id and job.status='completed'
join public.writing_current_occurrence_interpretations current_interpretation
  on current_interpretation.id=result.interpretation_id
join public.writing_context_current_family_selections selection
  on selection.environment_key=job.environment_key and selection.family_key=result.family_key
  and selection.action='selected' and selection.release_id=result.release_id;

create table public.writing_context_review_deliveries (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null unique references public.writing_context_results(id),
  occurrence_id text not null unique references public.writing_occurrences(id),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  task_submission_id uuid not null references public.task_submissions(id) on delete cascade,
  writing_sample_id uuid not null references public.writing_samples(id) on delete cascade,
  approval_event_id uuid not null references public.writing_context_family_approval_events(id),
  delivery_fingerprint text not null,
  delivered_at timestamptz not null default clock_timestamp()
);
create index writing_context_review_deliveries_submission_idx
  on public.writing_context_review_deliveries(task_submission_id,delivered_at desc,id desc);

create table public.writing_context_review_decisions (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.writing_context_review_deliveries(id),
  decision text not null check(decision in ('accepted','not_a_learning_issue')),
  misspelling_instance_id uuid references public.misspelling_instances(id),
  writing_issue_suggestion_id uuid references public.writing_issue_suggestions(id),
  writing_issue_id uuid references public.writing_issues(id),
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);

create view public.writing_context_current_review_deliveries
with (security_invoker=true) as
select delivery.*
from public.writing_context_review_deliveries delivery
join public.writing_context_current_results result on result.id=delivery.result_id
join public.writing_context_current_family_approvals approval
  on approval.approval_event_id=delivery.approval_event_id and approval.action='approved'
join public.writing_shadow_controls control
  on control.parent_user_id=delivery.parent_user_id and control.child_id=delivery.child_id
  and control.context_review_enabled
where not exists(
  select 1 from public.writing_context_review_decisions decision where decision.delivery_id=delivery.id
);

create function public.assert_writing_context_job_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(
    select 1 from public.writing_occurrences occurrence
    join public.writing_occurrence_interpretations interpretation
      on interpretation.id=new.interpretation_id and interpretation.occurrence_id=occurrence.id
    join public.writing_occurrence_assessments assessment
      on assessment.id=new.assessment_id and assessment.interpretation_id=interpretation.id
    join public.writing_source_snapshots snapshot on snapshot.id=occurrence.snapshot_id
    join public.children child on child.id=snapshot.child_id and child.parent_user_id=snapshot.parent_user_id
    join public.writing_context_family_releases release
      on release.id=new.release_id and release.family_key=new.family_key
    where occurrence.id=new.occurrence_id and snapshot.id=new.snapshot_id
      and snapshot.parent_user_id=new.parent_user_id and snapshot.child_id=new.child_id
  ) then raise exception 'writing_context_job_scope_invalid'; end if;
  return new;
end $$;
create trigger writing_context_job_scope before insert on public.writing_context_jobs
  for each row execute function public.assert_writing_context_job_scope();

create function public.protect_writing_context_job() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if old.status='completed' then raise exception 'writing_context_job_immutable'; end if;
  if new.occurrence_id<>old.occurrence_id or new.interpretation_id<>old.interpretation_id
    or new.assessment_id<>old.assessment_id or new.snapshot_id<>old.snapshot_id
    or new.parent_user_id<>old.parent_user_id or new.child_id<>old.child_id
    or new.environment_key<>old.environment_key or new.family_key<>old.family_key
    or new.release_id<>old.release_id then raise exception 'writing_context_job_identity_immutable'; end if;
  return new;
end $$;
create trigger writing_context_job_protection before update on public.writing_context_jobs
  for each row execute function public.protect_writing_context_job();

create function public.discover_writing_context_jobs(p_environment text,p_limit integer default 500)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare discovered integer;
begin
  if p_environment not in ('local','staging','production') or p_limit<1 or p_limit>1000
    then raise exception 'writing_context_discovery_invalid'; end if;
  with eligible as (
    select interpretation.occurrence_id,interpretation.id interpretation_id,assessment.id assessment_id,
      occurrence.snapshot_id,snapshot.parent_user_id,snapshot.child_id,selection.family_key,release.id release_id
    from public.writing_current_occurrence_interpretations interpretation
    join public.writing_occurrences occurrence on occurrence.id=interpretation.occurrence_id
    join public.writing_source_snapshots snapshot on snapshot.id=occurrence.snapshot_id
    join public.writing_shadow_controls control on control.child_id=snapshot.child_id
      and control.parent_user_id=snapshot.parent_user_id and control.context_processing_enabled
    join public.canonical_teaching_dictionary_words word on word.id=interpretation.canonical_word_id
    join public.writing_context_current_family_selections selection
      on selection.environment_key=p_environment and selection.action='selected'
    join public.writing_context_family_releases release on release.id=selection.release_id
      and replace(replace(lower(word.normalised_word),'’',''''),'ʼ','''')=any(release.members)
    join lateral (
      select candidate.id from public.writing_occurrence_assessments candidate
      where candidate.interpretation_id=interpretation.id order by candidate.created_at,candidate.id limit 1
    ) assessment on true
    where interpretation.resolution_status='resolved' and occurrence.provenance='learner_response'
      and (control.context_retrospective_enabled or snapshot.captured_at>=control.updated_at)
    order by snapshot.captured_at,interpretation.occurrence_id,selection.family_key
    limit p_limit
  )
  insert into public.writing_context_jobs(
    occurrence_id,interpretation_id,assessment_id,snapshot_id,parent_user_id,child_id,
    environment_key,family_key,release_id
  ) select occurrence_id,interpretation_id,assessment_id,snapshot_id,parent_user_id,child_id,
      p_environment,family_key,release_id from eligible
    on conflict(interpretation_id,release_id) do nothing;
  get diagnostics discovered=row_count;
  return discovered;
end $$;

create function public.claim_writing_context_jobs(p_environment text,p_limit integer default 20)
returns setof public.writing_context_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_environment not in ('local','staging','production') then raise exception 'writing_context_environment_invalid'; end if;
  update public.writing_context_jobs set status='failed',lease_token=null,error_code='LEASE_EXPIRED',next_retry_at=clock_timestamp()
    where environment_key=p_environment and status='processing' and started_at<clock_timestamp()-interval '10 minutes';
  return query with selected as (
    select job.id from public.writing_context_jobs job
    join public.writing_current_occurrence_interpretations current_interpretation
      on current_interpretation.id=job.interpretation_id
    join public.writing_context_current_family_selections selection
      on selection.environment_key=job.environment_key and selection.family_key=job.family_key
      and selection.action='selected' and selection.release_id=job.release_id
    where job.environment_key=p_environment and job.status in ('pending','failed')
      and job.attempt_count<8 and job.next_retry_at<=clock_timestamp()
    order by job.created_at,job.id limit greatest(1,least(coalesce(p_limit,20),20))
    for update of job skip locked
  ) update public.writing_context_jobs job set status='processing',attempt_count=job.attempt_count+1,
      lease_token=gen_random_uuid(),started_at=clock_timestamp(),error_code=null
    from selected where job.id=selected.id returning job.*;
end $$;

create function public.finish_writing_context_job(
  p_job_id uuid,p_lease_token uuid,p_result jsonb default null,p_error_code text default null
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.writing_context_jobs%rowtype; interpretation public.writing_occurrence_interpretations%rowtype;
  release public.writing_context_family_releases%rowtype; affected integer;
begin
  if (p_result is null)=(p_error_code is null) then raise exception 'writing_context_result_invalid'; end if;
  if p_error_code is not null and p_error_code not in ('ANALYSIS_FAILED','SOURCE_INVALID','DEPENDENCY_STALE')
    then raise exception 'writing_context_error_invalid'; end if;
  select * into job from public.writing_context_jobs where id=p_job_id and status='processing' and lease_token=p_lease_token for update;
  if job.id is null then return false; end if;
  if p_result is not null then
    select * into interpretation from public.writing_occurrence_interpretations where id=job.interpretation_id;
    select * into release from public.writing_context_family_releases where id=job.release_id;
    if not exists(select 1 from public.writing_current_occurrence_interpretations current where current.id=job.interpretation_id)
      then p_result:=null;p_error_code:='DEPENDENCY_STALE';
    elsif p_result->>'familyKey' is distinct from job.family_key
      or p_result->>'analyserVersion' is distinct from release.analyser_version
      or p_result->>'registryVersion' is distinct from release.registry_version
      or p_result->>'corpusVersion' is distinct from release.corpus_version
      or p_result->>'manifestFingerprint' is distinct from release.manifest_fingerprint
      or p_result->>'observedCanonicalWordId' is distinct from interpretation.canonical_word_id::text
      then raise exception 'writing_context_dependency_invalid';
    else
      insert into public.writing_context_results(
        job_id,occurrence_id,interpretation_id,assessment_id,release_id,family_key,result_status,
        observed_canonical_word_id,alternative_canonical_word_id,observed_member,alternative_member,
        assessed_scope,reason_code,rule_id,analyser_version,registry_version,corpus_version,
        manifest_fingerprint,interpretation_fingerprint,mapping_authority_fingerprint,
        context_excerpt,excerpt_start_utf16,excerpt_end_utf16,result_fingerprint
      ) values(
        job.id,job.occurrence_id,job.interpretation_id,job.assessment_id,job.release_id,job.family_key,
        p_result->>'status',(p_result->>'observedCanonicalWordId')::uuid,
        nullif(p_result->>'alternativeCanonicalWordId','')::uuid,p_result->>'observedMember',
        nullif(p_result->>'alternativeMember',''),p_result->>'assessedScope',p_result->>'reasonCode',
        p_result->>'ruleId',p_result->>'analyserVersion',p_result->>'registryVersion',
        p_result->>'corpusVersion',p_result->>'manifestFingerprint',p_result->>'interpretationFingerprint',
        p_result->>'mappingAuthorityFingerprint',p_result->>'contextExcerpt',
        (p_result->>'excerptStartUtf16')::integer,(p_result->>'excerptEndUtf16')::integer,
        p_result->>'resultFingerprint'
      );
    end if;
  end if;
  update public.writing_context_jobs set status=case when p_error_code is null then 'completed' else 'failed' end,
    lease_token=null,error_code=p_error_code,completed_at=case when p_error_code is null then clock_timestamp() else null end,
    next_retry_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,greatest(0,attempt_count-1)))::integer)
    where id=job.id;
  get diagnostics affected=row_count;
  return affected=1;
end $$;

create function public.materialize_writing_context_review_candidates(p_environment text,p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate record; delivered integer:=0;
begin
  if p_environment not in ('local','staging','production') or p_limit<1 or p_limit>500
    then raise exception 'writing_context_materialization_invalid'; end if;
  for candidate in
    select result.*,job.parent_user_id,job.child_id,snapshot.submission_id,sample.id writing_sample_id,
      occurrence.observed_text,occurrence.field_path,approval.approval_event_id,
      mapping.id mapping_id,mapping.micro_skill_key,mapping.authority_reference
    from public.writing_context_current_results result
    join public.writing_context_jobs job on job.id=result.job_id and job.environment_key=p_environment
    join public.writing_source_snapshots snapshot on snapshot.id=job.snapshot_id
    join public.writing_occurrences occurrence on occurrence.id=result.occurrence_id
    join public.writing_samples sample on sample.task_submission_id=snapshot.submission_id
      and sample.parent_user_id=job.parent_user_id and sample.child_id=job.child_id
    join public.writing_shadow_controls control on control.parent_user_id=job.parent_user_id
      and control.child_id=job.child_id and control.context_review_enabled
    join public.writing_context_current_family_approvals approval
      on approval.environment_key=p_environment and approval.family_key=result.family_key
      and approval.action='approved' and approval.release_id=result.release_id
      and approval.corpus_version=result.corpus_version
    join lateral (
      select mapping.id,mapping.micro_skill_key,
        'spelling_canonical_mapping:'||mapping.id::text authority_reference
      from public.spelling_canonical_mappings mapping
      where mapping.mapping_status='active' and mapping.resolver_visibility_status='visible'
        and mapping.dialect_code='en-GB' and mapping.normalization_version='spelling_normalize_v1'
        and mapping.metadata->>'automatic_detection_eligibility'='context_required'
        and mapping.misspelling_normalized=result.observed_member
        and mapping.correct_spelling_normalized=result.alternative_member
        and exists(select 1 from public.spelling_canonical_mapping_events event
          where event.mapping_id=mapping.id and event.event_type='resolver_visibility_enabled'
            and event.new_resolver_visibility_status='visible')
        and exists(select 1 from public.micro_skill_catalog skill where skill.micro_skill_key=mapping.micro_skill_key
          and skill.mastery_domain_key='D4' and skill.is_active and skill.is_assignable)
        and not exists(select 1 from public.spelling_canonical_mappings conflict
          where conflict.id<>mapping.id and conflict.mapping_status='active'
            and conflict.resolver_visibility_status='visible'
            and conflict.metadata->>'automatic_detection_eligibility'='context_required'
            and conflict.misspelling_normalized=mapping.misspelling_normalized
            and conflict.correct_spelling_normalized=mapping.correct_spelling_normalized
            and conflict.micro_skill_key<>mapping.micro_skill_key)
      order by mapping.created_at,mapping.id limit 1
    ) mapping on true
    where result.result_status='INVALID'
      and not exists(
        select 1 from public.writing_context_review_deliveries delivered
        join public.writing_context_results delivered_result on delivered_result.id=delivered.result_id
        where delivered_result.occurrence_id=result.occurrence_id
      )
      and not exists(
        select 1 from public.misspelling_instances existing
        where existing.source_writing_occurrence_id=result.occurrence_id
      )
    order by result.created_at,result.id limit p_limit
  loop
    insert into public.writing_context_review_deliveries(
      result_id,occurrence_id,parent_user_id,child_id,task_submission_id,writing_sample_id,
      approval_event_id,delivery_fingerprint
    ) values(candidate.id,candidate.occurrence_id,candidate.parent_user_id,candidate.child_id,candidate.submission_id,
      candidate.writing_sample_id,candidate.approval_event_id,
      encode(extensions.digest(convert_to(candidate.id::text||':'||candidate.approval_event_id::text,'UTF8'),'sha256'),'hex'))
    on conflict do nothing;
    if found then delivered:=delivered+1; end if;
  end loop;
  return delivered;
end $$;

create function public.resolve_writing_context_review_delivery(p_delivery_id uuid,p_decision text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.writing_context_review_deliveries%rowtype; result public.writing_context_results%rowtype;
  occurrence public.writing_occurrences%rowtype; mapping record; misspelling_id uuid; suggestion_id uuid;
  issue_id uuid; decision_id uuid;
begin
  if p_decision not in ('accepted','not_a_learning_issue') then raise exception 'writing_context_review_decision_invalid'; end if;
  select * into delivery from public.writing_context_review_deliveries where id=p_delivery_id for update;
  if delivery.id is null then raise exception 'writing_context_review_delivery_missing'; end if;
  if exists(select 1 from public.writing_context_review_decisions existing where existing.delivery_id=delivery.id)
    then return (select existing.id from public.writing_context_review_decisions existing where existing.delivery_id=delivery.id); end if;
  select * into result from public.writing_context_results where id=delivery.result_id;
  select * into occurrence from public.writing_occurrences where id=result.occurrence_id;
  if not exists(select 1 from public.writing_context_current_results current where current.id=result.id)
    or not exists(select 1 from public.writing_context_current_family_approvals approval
      where approval.approval_event_id=delivery.approval_event_id and approval.action='approved')
    or not exists(select 1 from public.writing_shadow_controls control where control.parent_user_id=delivery.parent_user_id
      and control.child_id=delivery.child_id and control.context_review_enabled)
    then raise exception 'writing_context_review_delivery_stale'; end if;
  if p_decision='accepted' then
    select candidate.id,candidate.micro_skill_key into mapping
    from public.spelling_canonical_mappings candidate
    where candidate.mapping_status='active' and candidate.resolver_visibility_status='visible'
      and candidate.dialect_code='en-GB' and candidate.normalization_version='spelling_normalize_v1'
      and candidate.metadata->>'automatic_detection_eligibility'='context_required'
      and candidate.misspelling_normalized=result.observed_member
      and candidate.correct_spelling_normalized=result.alternative_member
      and exists(select 1 from public.spelling_canonical_mapping_events event where event.mapping_id=candidate.id
        and event.event_type='resolver_visibility_enabled' and event.new_resolver_visibility_status='visible')
      and not exists(select 1 from public.spelling_canonical_mappings conflict
        where conflict.id<>candidate.id and conflict.mapping_status='active'
          and conflict.resolver_visibility_status='visible'
          and conflict.metadata->>'automatic_detection_eligibility'='context_required'
          and conflict.misspelling_normalized=candidate.misspelling_normalized
          and conflict.correct_spelling_normalized=candidate.correct_spelling_normalized
          and conflict.micro_skill_key<>candidate.micro_skill_key)
      and exists(select 1 from public.micro_skill_catalog skill
        where skill.micro_skill_key=candidate.micro_skill_key and skill.mastery_domain_key='D4'
          and skill.is_active and skill.is_assignable)
    order by candidate.created_at,candidate.id limit 1;
    if mapping.id is null then raise exception 'writing_context_mapping_unavailable'; end if;
    select id into misspelling_id from public.misspelling_instances
      where source_writing_occurrence_id=result.occurrence_id limit 1;
    if misspelling_id is not null and not exists(select 1 from public.misspelling_instances existing
      where existing.id=misspelling_id and lower(btrim(existing.misspelled_word))=result.observed_member
        and lower(btrim(existing.corrected_word))=result.alternative_member)
      then raise exception 'writing_context_occurrence_conflict'; end if;
    if misspelling_id is null then
      insert into public.misspelling_instances(writing_sample_id,child_id,parent_user_id,misspelled_word,
        corrected_word,suggested_word,context_text,position_start,position_end,notes,error_type,
        confidence_score,is_parent_overridden,is_false_positive,source_writing_occurrence_id)
      values(delivery.writing_sample_id,delivery.child_id,delivery.parent_user_id,occurrence.observed_text,
        result.alternative_member,result.alternative_member,result.context_excerpt,null,null,
        jsonb_build_object('detectionSource','whole_writing_context_s8','contextResultId',result.id,
          'contextFamilyKey',result.family_key,'reasonCode',result.reason_code,'ruleId',result.rule_id,
          'sourceWritingOccurrenceId',result.occurrence_id,'sourceFieldPath',occurrence.field_path,
          'canonicalMappingId',mapping.id)::text,'Pattern/rule',1,false,false,result.occurrence_id)
      returning id into misspelling_id;
    end if;
    select id into suggestion_id from public.writing_issue_suggestions
      where parent_user_id=delivery.parent_user_id and task_submission_id=delivery.task_submission_id
        and misspelling_instance_id=misspelling_id order by created_at desc limit 1;
    if suggestion_id is null then
      insert into public.writing_issue_suggestions(child_id,parent_user_id,task_submission_id,writing_sample_id,
        misspelling_instance_id,source_type,suggestion_status,observed_text,suggested_replacement,context_text,
        source_field_key,position_start,position_end,suggested_micro_skill_key,notes,metadata,resolved_at,
        source_writing_occurrence_id)
      values(delivery.child_id,delivery.parent_user_id,delivery.task_submission_id,delivery.writing_sample_id,
        misspelling_id,'misspelling_instance','accepted',occurrence.observed_text,result.alternative_member,
        result.context_excerpt,occurrence.field_path,null,null,mapping.micro_skill_key,
        'Correctly spelled; possibly the wrong word here',jsonb_build_object(
          'detection_source','whole_writing_context_s8','context_result_id',result.id,
          'context_family_key',result.family_key,'reason_code',result.reason_code,
          'source_writing_occurrence_id',result.occurrence_id,'canonical_mapping_id',mapping.id),clock_timestamp(),
        result.occurrence_id)
      returning id into suggestion_id;
    else
      update public.writing_issue_suggestions set suggestion_status='accepted',resolved_at=clock_timestamp()
      where id=suggestion_id and suggestion_status='pending';
    end if;
    select id into issue_id from public.writing_issues
      where parent_user_id=delivery.parent_user_id and task_submission_id=delivery.task_submission_id
        and source_writing_occurrence_id=result.occurrence_id
      order by created_at desc limit 1;
    if issue_id is null then
      insert into public.writing_issues(child_id,parent_user_id,task_submission_id,writing_sample_id,
        source_suggestion_id,source_misspelling_instance_id,issue_status,observed_text,suggested_replacement,
        approved_replacement,context_text,source_field_key,position_start,position_end,micro_skill_key,
        parent_review_note,parent_marked_at,metadata,source_writing_occurrence_id)
      values(delivery.child_id,delivery.parent_user_id,delivery.task_submission_id,delivery.writing_sample_id,
        suggestion_id,misspelling_id,'pending_parent_review',occurrence.observed_text,result.alternative_member,
        result.alternative_member,result.context_excerpt,occurrence.field_path,null,null,mapping.micro_skill_key,
        'Parent confirmed this contextual word-choice suggestion.',clock_timestamp(),jsonb_build_object(
          'source_kind','whole_writing_context_s8','context_result_id',result.id,
          'source_writing_occurrence_id',result.occurrence_id),result.occurrence_id)
      returning id into issue_id;
    end if;
  end if;
  insert into public.writing_context_review_decisions(delivery_id,decision,misspelling_instance_id,
    writing_issue_suggestion_id,writing_issue_id,decided_by,decided_at)
  values(delivery.id,p_decision,misspelling_id,suggestion_id,issue_id,delivery.parent_user_id,clock_timestamp())
  returning id into decision_id;
  return decision_id;
end $$;

create view public.writing_context_observability as
select job.environment_key,job.family_key,job.status,coalesce(result.result_status,'PENDING') result_status,
  coalesce(result.reason_code,job.error_code,'PENDING') reason_code,count(*)::bigint occurrence_count,
  min(job.created_at) oldest_created_at,max(job.attempt_count) max_attempt_count
from public.writing_context_jobs job left join public.writing_context_results result on result.job_id=job.id
group by job.environment_key,job.family_key,job.status,coalesce(result.result_status,'PENDING'),
  coalesce(result.reason_code,job.error_code,'PENDING');

insert into public.writing_context_family_releases(
  id,release_key,family_key,registry_version,analyser_version,corpus_version,members,manifest,manifest_fingerprint
) values
('81000000-0000-4000-8000-000000000001','s8-v1-there-their-theyre','THERE_THEIR_THEYRE','WHOLE_WRITING_CONTEXT_REGISTRY_V1','WHOLE_WRITING_CONTEXT_DETERMINISTIC_V1','WHOLE_WRITING_CONTEXT_CORPUS_V1',array['there','their','they''re'],'{"supportedConstructions":["existential","locative","possessive","they_are_contraction"],"exclusions":["ambiguous_gerund","fragment","quoted_or_reported_intent"]}','50cb8caf24132ae1b57bb5755e16c29a3152427631310483ad72c5dc3fa47df6'),
('81000000-0000-4000-8000-000000000002','s8-v1-to-too-two','TO_TOO_TWO','WHOLE_WRITING_CONTEXT_REGISTRY_V1','WHOLE_WRITING_CONTEXT_DETERMINISTIC_V1','WHOLE_WRITING_CONTEXT_CORPUS_V1',array['to','too','two'],'{"supportedConstructions":["preposition","infinitive","additive","degree","numeral"],"exclusions":["fragment","unresolved_lexical_category","quoted_or_reported_intent"]}','8eb69607aa4d695ea15ee6d32946634b8ddce0bf5ea703faa2fc71a33bb073cd'),
('81000000-0000-4000-8000-000000000003','s8-v1-your-youre','YOUR_YOURE','WHOLE_WRITING_CONTEXT_REGISTRY_V1','WHOLE_WRITING_CONTEXT_DETERMINISTIC_V1','WHOLE_WRITING_CONTEXT_CORPUS_V1',array['your','you''re'],'{"supportedConstructions":["possessive","you_are_contraction"],"exclusions":["ambiguous_gerund","fragment","quoted_or_reported_intent"]}','b3bfc583b6d0c8d6eed86987d4ae4a114591963428d596f9c605ef2370cb9921'),
('81000000-0000-4000-8000-000000000004','s8-v1-its-its','ITS_ITS','WHOLE_WRITING_CONTEXT_REGISTRY_V1','WHOLE_WRITING_CONTEXT_DETERMINISTIC_V1','WHOLE_WRITING_CONTEXT_CORPUS_V1',array['its','it''s'],'{"supportedConstructions":["possessive","it_is_contraction","it_has_contraction"],"exclusions":["fragment","quoted_or_reported_intent"]}','d89c3caf575349dcdd0226fd1c4e7e3740f31a98a227d1b4162ad8d615a21b53');

insert into public.writing_context_family_selection_events(environment_key,family_key,release_id,action,authority_reference)
select environment,family_key,id,'selected','s8-shadow-default:'||release_key
from public.writing_context_family_releases cross join unnest(array['local','staging','production']) environment;

create trigger writing_context_release_immutable before update on public.writing_context_family_releases for each row execute function public.reject_writing_fact_update();
create trigger writing_context_selection_immutable before update on public.writing_context_family_selection_events for each row execute function public.reject_writing_fact_update();
create trigger writing_context_approval_immutable before update on public.writing_context_family_approval_events for each row execute function public.reject_writing_fact_update();
create trigger writing_context_result_immutable before update on public.writing_context_results for each row execute function public.reject_writing_fact_update();
create trigger writing_context_delivery_immutable before update on public.writing_context_review_deliveries for each row execute function public.reject_writing_fact_update();
create trigger writing_context_decision_immutable before update on public.writing_context_review_decisions for each row execute function public.reject_writing_fact_update();

alter table public.writing_context_family_releases enable row level security;
alter table public.writing_context_family_selection_events enable row level security;
alter table public.writing_context_family_approval_events enable row level security;
alter table public.writing_context_jobs enable row level security;
alter table public.writing_context_results enable row level security;
alter table public.writing_context_review_deliveries enable row level security;
alter table public.writing_context_review_decisions enable row level security;

revoke all on public.writing_context_family_releases,public.writing_context_family_selection_events,
  public.writing_context_current_family_selections,public.writing_context_family_approval_events,
  public.writing_context_current_family_approvals,public.writing_context_jobs,public.writing_context_results,
  public.writing_context_current_results,public.writing_context_review_deliveries,
  public.writing_context_review_decisions,public.writing_context_current_review_deliveries,
  public.writing_context_observability from public,anon,authenticated;
grant all on public.writing_context_family_releases,public.writing_context_family_selection_events,
  public.writing_context_family_approval_events,public.writing_context_jobs,public.writing_context_results,
  public.writing_context_review_deliveries,public.writing_context_review_decisions to service_role;
grant select on public.writing_context_current_family_selections,public.writing_context_current_family_approvals,
  public.writing_context_current_results,public.writing_context_current_review_deliveries,
  public.writing_context_observability to service_role;

revoke all on function public.assert_writing_context_family_event_scope(),public.assert_writing_context_job_scope(),
  public.protect_writing_context_job(),public.discover_writing_context_jobs(text,integer),
  public.claim_writing_context_jobs(text,integer),public.finish_writing_context_job(uuid,uuid,jsonb,text),
  public.materialize_writing_context_review_candidates(text,integer),public.resolve_writing_context_review_delivery(uuid,text)
  from public,anon,authenticated;
grant execute on function public.discover_writing_context_jobs(text,integer),public.claim_writing_context_jobs(text,integer),
  public.finish_writing_context_job(uuid,uuid,jsonb,text),public.materialize_writing_context_review_candidates(text,integer)
  to service_role;
grant execute on function public.resolve_writing_context_review_delivery(uuid,text) to service_role;
