-- E1: durable enrichment operations over the existing Phase B, S4 and shadow-run authorities.
create table public.writing_enrichment_controls (
  environment_key text primary key check(environment_key in ('local','staging','production')),
  inventory_enabled boolean not null default false,
  generation_enabled boolean not null default false,
  replay_enabled boolean not null default false
);
insert into public.writing_enrichment_controls(environment_key) values('local'),('staging'),('production');

create table public.writing_enrichment_cohorts (
  environment_key text not null references public.writing_enrichment_controls(environment_key),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  primary key(environment_key,child_id),
  unique(environment_key,parent_user_id,child_id)
);

create table public.writing_enrichment_inventory_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null check(length(btrim(run_key)) between 1 and 160),
  environment_key text not null references public.writing_enrichment_controls(environment_key),
  corpus_scope jsonb not null check(jsonb_typeof(corpus_scope)='object'),
  inventory_version text not null,
  gap_key_version text not null,
  input_fingerprint text not null,
  identity_fingerprint text not null,
  relationship_fingerprint text not null,
  scanned_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(environment_key,run_key)
);
create table public.writing_enrichment_inventory_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.writing_enrichment_inventory_runs(id),
  gap_key text not null,
  gap_type text not null check(gap_type in ('missing_canonical_identity','missing_governed_relationship','unapproved_relationship','curriculum_zero_coverage','mapping_authority_gap')),
  normalized_form text,
  dialect text,
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id),
  micro_skill_key text references public.micro_skill_catalog(micro_skill_key),
  occurrence_count integer not null check(occurrence_count>=0),
  submission_count integer not null check(submission_count>=0),
  priority integer not null check(priority>=0),
  route text not null check(route in ('teaching_dictionary','s4_review','authority_reconciliation')),
  reasons jsonb not null check(jsonb_typeof(reasons)='array'),
  source_authorities jsonb not null check(jsonb_typeof(source_authorities)='array'),
  unique(run_id,gap_key)
);
create table public.writing_enrichment_inventory_occurrences (
  entry_id uuid not null references public.writing_enrichment_inventory_entries(id),
  occurrence_id text not null references public.writing_occurrences(id),
  primary key(entry_id,occurrence_id)
);
create index writing_enrichment_entry_priority_idx on public.writing_enrichment_inventory_entries(run_id,priority desc,gap_key);
create index writing_enrichment_inventory_occurrence_idx on public.writing_enrichment_inventory_occurrences(occurrence_id,entry_id);

create table public.writing_enrichment_attempts (
  id uuid primary key default gen_random_uuid(),
  attempt_key text not null unique check(length(btrim(attempt_key)) between 1 and 180),
  inventory_entry_id uuid not null references public.writing_enrichment_inventory_entries(id),
  environment_key text not null references public.writing_enrichment_controls(environment_key),
  generator_version text not null,
  generation_method text not null check(generation_method in ('existing_authority','deterministic_candidate','batch_ai_candidate')),
  primary_source_kind text not null,
  source_fingerprint text not null,
  authority_references jsonb not null check(jsonb_typeof(authority_references)='array'),
  dictionary_fingerprint text not null,
  relationship_fingerprint text not null,
  candidate jsonb,
  findings jsonb not null check(jsonb_typeof(findings)='array'),
  outcome text not null check(outcome in ('reconciled_existing_authority','candidate','blocked','suppressed_rejection','suppressed_withdrawal')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check((outcome='candidate')=(candidate is not null))
);
create table public.writing_enrichment_attempt_packages (
  attempt_id uuid primary key references public.writing_enrichment_attempts(id),
  package_id uuid not null references public.adle_word_skill_candidate_packages(id),
  candidate_index integer not null check(candidate_index>=0),
  linked_at timestamptz not null default now(),
  unique(package_id,candidate_index)
);

create table public.adle_word_skill_pair_review_annotations (
  package_id uuid not null references public.adle_word_skill_package_reviews(package_id),
  candidate_index integer not null check(candidate_index>=0),
  rejection_reason text check(length(btrim(rejection_reason)) between 1 and 2000),
  primary key(package_id,candidate_index)
);
create table public.adle_word_skill_review_metrics (
  package_id uuid primary key references public.adle_word_skill_package_reviews(package_id),
  curator_active_seconds integer check(curator_active_seconds>=0),
  recorded_at timestamptz not null default now()
);

create table public.writing_enrichment_authority_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  environment_key text not null references public.writing_enrichment_controls(environment_key),
  event_kind text not null check(event_kind in ('s4_publication','s4_withdrawal','teaching_dictionary_release')),
  authority_reference text not null,
  release_id uuid references public.adle_reviewed_word_skill_releases(id),
  affected_word_ids uuid[] not null check(cardinality(affected_word_ids)>0),
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique(event_kind,authority_reference)
);
create table public.writing_enrichment_event_progress (
  event_id uuid primary key references public.writing_enrichment_authority_events(id),
  discovery_cursor text,
  discovery_complete boolean not null default false,
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create table public.writing_enrichment_replay_targets (
  event_id uuid not null references public.writing_enrichment_authority_events(id),
  occurrence_id text not null references public.writing_occurrences(id),
  snapshot_id uuid not null references public.writing_source_snapshots(id),
  run_id uuid references public.writing_shadow_runs(id),
  discovered_at timestamptz not null default now(),
  primary key(event_id,occurrence_id)
);
create index writing_enrichment_unscheduled_target_idx on public.writing_enrichment_replay_targets(event_id,snapshot_id,occurrence_id) where run_id is null;
create table public.writing_shadow_run_enrichment_scopes (
  run_id uuid primary key references public.writing_shadow_runs(id) on delete cascade,
  event_id uuid not null references public.writing_enrichment_authority_events(id),
  event_sequence bigint not null,
  environment_key text not null check(environment_key in ('local','staging','production')),
  created_at timestamptz not null default now(),
  unique(event_id,run_id)
);
create table public.writing_shadow_run_occurrences (
  run_id uuid not null references public.writing_shadow_run_enrichment_scopes(run_id) on delete cascade,
  occurrence_id text not null references public.writing_occurrences(id),
  primary key(run_id,occurrence_id)
);

alter table public.writing_enrichment_replay_work add column run_id uuid references public.writing_shadow_runs(id);

create trigger writing_enrichment_inventory_run_immutable before update on public.writing_enrichment_inventory_runs
  for each row execute function public.reject_writing_fact_update();
create trigger writing_enrichment_inventory_entry_immutable before update on public.writing_enrichment_inventory_entries
  for each row execute function public.reject_writing_fact_update();
create trigger writing_enrichment_inventory_occurrence_immutable before update on public.writing_enrichment_inventory_occurrences
  for each row execute function public.reject_writing_fact_update();
create trigger writing_enrichment_attempt_immutable before update on public.writing_enrichment_attempts
  for each row execute function public.reject_writing_fact_update();
create trigger writing_enrichment_attempt_package_immutable before update on public.writing_enrichment_attempt_packages
  for each row execute function public.reject_writing_fact_update();
create trigger word_skill_review_annotation_immutable before update on public.adle_word_skill_pair_review_annotations
  for each row execute function public.reject_writing_fact_update();
create trigger word_skill_review_metric_immutable before update on public.adle_word_skill_review_metrics
  for each row execute function public.reject_writing_fact_update();
create trigger writing_enrichment_authority_event_immutable before update on public.writing_enrichment_authority_events
  for each row execute function public.reject_writing_fact_update();
create trigger writing_shadow_run_enrichment_scope_immutable before update on public.writing_shadow_run_enrichment_scopes
  for each row execute function public.reject_writing_fact_update();
create trigger writing_shadow_run_occurrence_immutable before update on public.writing_shadow_run_occurrences
  for each row execute function public.reject_writing_fact_update();

create function public.persist_writing_enrichment_inventory(
  p_key text,p_environment text,p_report jsonb,p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.writing_enrichment_inventory_runs%rowtype; v_run uuid; entry jsonb; v_entry uuid; occurrence jsonb;
begin
  if not exists(select 1 from writing_enrichment_controls where environment_key=p_environment and inventory_enabled)
    then raise exception 'WRITING_ENRICHMENT_INVENTORY_DISABLED'; end if;
  if jsonb_typeof(p_report) is distinct from 'object' or p_report->>'version'<>'WRITING_ENRICHMENT_INVENTORY_V1'
    or p_report->>'gapKeyVersion'<>'WRITING_ENRICHMENT_GAP_KEY_V1' or jsonb_typeof(p_report->'entries') is distinct from 'array'
    then raise exception 'WRITING_ENRICHMENT_INVENTORY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('writing-enrichment-inventory:'||p_environment||':'||p_key,0));
  select * into existing from writing_enrichment_inventory_runs where environment_key=p_environment and run_key=p_key;
  if existing.id is not null then
    if existing.input_fingerprint<>p_report->>'inputFingerprint' or existing.created_by<>p_actor then
      raise exception 'WRITING_ENRICHMENT_INVENTORY_CONFLICT'; end if;
    return existing.id;
  end if;
  insert into writing_enrichment_inventory_runs(run_key,environment_key,corpus_scope,inventory_version,gap_key_version,input_fingerprint,
    identity_fingerprint,relationship_fingerprint,scanned_at,created_by)
  values(p_key,p_environment,jsonb_build_object('name',p_report->>'corpusScope'),p_report->>'version',p_report->>'gapKeyVersion',
    p_report->>'inputFingerprint',p_report->>'identityFingerprint',p_report->>'relationshipFingerprint',(p_report->>'scannedAt')::timestamptz,p_actor)
  returning id into v_run;
  for entry in select value from jsonb_array_elements(p_report->'entries') loop
    if jsonb_typeof(entry->'occurrenceIds') is distinct from 'array' or (entry->>'occurrenceCount')::integer<>jsonb_array_length(entry->'occurrenceIds')
      then raise exception 'WRITING_ENRICHMENT_MEMBERSHIP_COUNT_MISMATCH'; end if;
    insert into writing_enrichment_inventory_entries(run_id,gap_key,gap_type,normalized_form,dialect,canonical_word_id,micro_skill_key,
      occurrence_count,submission_count,priority,route,reasons,source_authorities)
    values(v_run,entry->>'gapKey',entry->>'gapType',nullif(entry->>'normalizedForm',''),nullif(entry->>'dialect',''),
      nullif(entry->>'canonicalWordId','')::uuid,nullif(entry->>'microSkillKey',''),(entry->>'occurrenceCount')::integer,
      (entry->>'submissionCount')::integer,(entry->>'priority')::integer,entry->>'route',entry->'reasons',entry->'sourceAuthorities')
    returning id into v_entry;
    for occurrence in select value from jsonb_array_elements(entry->'occurrenceIds') loop
      if not exists(
        select 1 from writing_occurrences o join writing_source_snapshots s on s.id=o.snapshot_id
        join writing_enrichment_cohorts c on c.child_id=s.child_id and c.parent_user_id=s.parent_user_id
          and c.environment_key=p_environment and c.enabled
        where o.id=occurrence#>>'{}'
      ) then raise exception 'WRITING_ENRICHMENT_OCCURRENCE_OUTSIDE_COHORT'; end if;
      insert into writing_enrichment_inventory_occurrences(entry_id,occurrence_id) values(v_entry,occurrence#>>'{}');
    end loop;
  end loop;
  return v_run;
end $$;

create function public.record_writing_enrichment_authority_event(
  p_environment text,p_kind text,p_reference text,p_release uuid,p_word_ids uuid[],p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event uuid;
begin
  if p_kind not in ('s4_publication','s4_withdrawal','teaching_dictionary_release') or nullif(btrim(p_reference),'') is null
    or cardinality(p_word_ids)<1 then raise exception 'WRITING_ENRICHMENT_EVENT_INVALID'; end if;
  insert into writing_enrichment_authority_events(environment_key,event_kind,authority_reference,release_id,affected_word_ids,recorded_by)
    values(p_environment,p_kind,p_reference,p_release,(select array_agg(distinct value order by value) from unnest(p_word_ids) value),p_actor)
    on conflict(event_kind,authority_reference) do nothing returning id into v_event;
  if v_event is null then
    select id into v_event from writing_enrichment_authority_events where event_kind=p_kind and authority_reference=p_reference;
    if not exists(select 1 from writing_enrichment_authority_events where id=v_event and environment_key=p_environment
      and release_id is not distinct from p_release and affected_word_ids=(select array_agg(distinct value order by value) from unnest(p_word_ids) value))
      then raise exception 'WRITING_ENRICHMENT_EVENT_CONFLICT'; end if;
  end if;
  insert into writing_enrichment_event_progress(event_id) values(v_event) on conflict do nothing;
  return v_event;
end $$;

create function public.record_writing_enrichment_dictionary_release(
  p_environment text,p_batch uuid,p_source_version text,p_word_ids uuid[],p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare batch public.canonical_teaching_dictionary_import_batches%rowtype;
begin
  select * into batch from canonical_teaching_dictionary_import_batches where id=p_batch and batch_status='applied';
  if batch.id is null or p_source_version not in (coalesce(batch.source_commit,''),coalesce(batch.source_folder_sha256,''))
    or exists(select 1 from unnest(p_word_ids) word_id where not exists(select 1 from canonical_teaching_dictionary_words w
      where w.id=word_id and w.import_batch_id=p_batch and w.row_status='active'))
    then raise exception 'WRITING_ENRICHMENT_DICTIONARY_RELEASE_UNVERIFIED'; end if;
  return record_writing_enrichment_authority_event(p_environment,'teaching_dictionary_release',
    'teaching-dictionary:'||p_batch::text||':'||p_source_version,null,p_word_ids,p_actor);
end $$;

-- Replace the S4 publisher only to swap unbounded snapshot fan-out for an atomic event receipt.
create or replace function public.publish_reviewed_word_skill_release(p_release_key text,p_environment_key text,p_manifest jsonb,p_reviewed_by uuid,p_review_note text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_release_id uuid; existing public.adle_reviewed_word_skill_releases%rowtype; pair jsonb; v_words uuid[];
begin
  if jsonb_typeof(p_manifest) is distinct from 'object' or jsonb_typeof(p_manifest->'approvedPairs') is distinct from 'array'
    or jsonb_array_length(p_manifest->'approvedPairs') not between 1 and 1000 then raise exception 'reviewed_manifest_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('reviewed-word-skill:'||p_release_key,0));
  select * into existing from adle_reviewed_word_skill_releases where release_key=p_release_key;
  if existing.id is not null then
    if existing.candidate_manifest<>p_manifest or existing.environment_key<>p_environment_key or existing.reviewed_by<>p_reviewed_by or existing.review_note<>p_review_note
      then raise exception 'reviewed_release_conflict'; end if;
    select array_agg(distinct canonical_word_id order by canonical_word_id) into v_words from adle_reviewed_word_skill_pairs where release_id=existing.id;
    perform record_writing_enrichment_authority_event(p_environment_key,'s4_publication','reviewed-release:'||existing.id::text,existing.id,v_words,p_reviewed_by);
    return existing.id;
  end if;
  insert into adle_reviewed_word_skill_releases(release_key,environment_key,candidate_manifest,reviewed_by,review_note)
  values(p_release_key,p_environment_key,p_manifest,p_reviewed_by,p_review_note) returning id into v_release_id;
  for pair in select value from jsonb_array_elements(p_manifest->'approvedPairs') loop
    if pair->>'decision' is distinct from 'approved' then raise exception 'reviewed_pair_not_approved'; end if;
    if not exists(select 1 from canonical_teaching_dictionary_words where id=(pair->>'canonicalWordId')::uuid and row_status='active')
      or not exists(select 1 from micro_skill_catalog where micro_skill_key=pair->>'microSkillKey' and is_active)
      then raise exception 'reviewed_pair_identity_invalid'; end if;
    insert into adle_reviewed_word_skill_pairs(release_id,canonical_word_id,micro_skill_key,relationship_role,source_reference,licence_reference)
    values(v_release_id,(pair->>'canonicalWordId')::uuid,pair->>'microSkillKey',pair->>'relationshipRole',pair->>'sourceReference',pair->>'licenceReference');
  end loop;
  select array_agg(distinct canonical_word_id order by canonical_word_id) into v_words from adle_reviewed_word_skill_pairs where release_id=v_release_id;
  perform record_writing_enrichment_authority_event(p_environment_key,'s4_publication','reviewed-release:'||v_release_id::text,v_release_id,v_words,p_reviewed_by);
  return v_release_id;
end $$;

create function public.capture_writing_enrichment_withdrawal_event() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare release adle_reviewed_word_skill_releases%rowtype; v_words uuid[];
begin
  select * into release from adle_reviewed_word_skill_releases where id=new.release_id;
  select array_agg(distinct canonical_word_id order by canonical_word_id) into v_words from adle_reviewed_word_skill_pairs where release_id=new.release_id;
  perform record_writing_enrichment_authority_event(release.environment_key,'s4_withdrawal','reviewed-withdrawal:'||new.release_id::text,
    new.release_id,v_words,new.reviewed_by);
  return new;
end $$;
create trigger writing_enrichment_withdrawal_event after insert on public.adle_reviewed_word_skill_withdrawals
  for each row execute function public.capture_writing_enrichment_withdrawal_event();

create function public.discover_writing_enrichment_targets(p_limit integer default 500)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare chosen record; target record; n integer:=0; bounded integer:=greatest(1,least(coalesce(p_limit,500),1000)); last_id text;
begin
  select e.*,p.discovery_cursor into chosen from writing_enrichment_authority_events e
  join writing_enrichment_event_progress p on p.event_id=e.id
  join writing_enrichment_controls c on c.environment_key=e.environment_key and c.replay_enabled
  where not p.discovery_complete order by e.event_sequence limit 1 for update of p skip locked;
  if chosen.id is null then return 0; end if;
  for target in
    select o.id,o.snapshot_id from writing_occurrences o
    where (chosen.discovery_cursor is null or o.id>chosen.discovery_cursor)
      and exists(select 1 from writing_occurrence_interpretations i
        left join canonical_teaching_dictionary_words w on w.id=any(chosen.affected_word_ids)
        where i.occurrence_id=o.id and (i.canonical_word_id=any(chosen.affected_word_ids)
          or (w.id is not null and w.normalised_word=i.normalized_form and w.dialect_code=i.dialect)))
    order by o.id limit bounded
  loop
    insert into writing_enrichment_replay_targets(event_id,occurrence_id,snapshot_id)
      values(chosen.id,target.id,target.snapshot_id) on conflict do nothing;
    last_id:=target.id; n:=n+1;
  end loop;
  update writing_enrichment_event_progress set discovery_cursor=coalesce(last_id,discovery_cursor),
    discovery_complete=(n<bounded),updated_at=now(),completed_at=case when n<bounded then now() else null end where event_id=chosen.id;
  return n;
end $$;

-- A source interpretation that arrives after the bounded scan is added to every relevant event idempotently.
create function public.converge_writing_enrichment_target() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_snapshot uuid;
begin
  select snapshot_id into v_snapshot from writing_occurrences where id=new.occurrence_id;
  insert into writing_enrichment_replay_targets(event_id,occurrence_id,snapshot_id)
  select e.id,new.occurrence_id,v_snapshot from writing_enrichment_authority_events e
  join writing_enrichment_controls c on c.environment_key=e.environment_key and c.replay_enabled
  where new.canonical_word_id=any(e.affected_word_ids) or exists(select 1 from canonical_teaching_dictionary_words w
    where w.id=any(e.affected_word_ids) and w.normalised_word=new.normalized_form and w.dialect_code=new.dialect)
  on conflict do nothing;
  return new;
end $$;
create trigger writing_enrichment_late_interpretation after insert on public.writing_occurrence_interpretations
  for each row execute function public.converge_writing_enrichment_target();

create function public.schedule_writing_enrichment_event_replays(p_limit integer default 20)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare group_row record; target record; v_run uuid; n integer:=0; bounded integer:=greatest(1,least(coalesce(p_limit,20),20));
begin
  for group_row in
    select t.event_id,t.snapshot_id,e.event_sequence,e.environment_key from writing_enrichment_replay_targets t
    join writing_enrichment_authority_events e on e.id=t.event_id
    join writing_enrichment_controls ec on ec.environment_key=e.environment_key and ec.replay_enabled
    join writing_source_snapshots s on s.id=t.snapshot_id
    join writing_enrichment_cohorts cohort on cohort.environment_key=e.environment_key and cohort.child_id=s.child_id
      and cohort.parent_user_id=s.parent_user_id and cohort.enabled
    join writing_shadow_controls wc on wc.child_id=s.child_id and wc.parent_user_id=s.parent_user_id and wc.processing_enabled
    where t.run_id is null group by t.event_id,t.snapshot_id,e.event_sequence,e.environment_key
    order by e.event_sequence,t.snapshot_id limit bounded
  loop
    perform pg_advisory_xact_lock(hashtextextended('writing-enrichment-schedule:'||group_row.event_id::text||':'||group_row.snapshot_id::text,0));
    if not exists(select 1 from writing_enrichment_replay_targets where event_id=group_row.event_id and snapshot_id=group_row.snapshot_id and run_id is null)
      then continue; end if;
    insert into writing_shadow_runs(snapshot_id,replay_key)
      values(group_row.snapshot_id,'enrichment-event:'||group_row.event_id::text)
      on conflict(snapshot_id,analysis_version,replay_key) do nothing;
    select id into v_run from writing_shadow_runs where snapshot_id=group_row.snapshot_id and analysis_version='WRITING_SHADOW_V1'
      and replay_key='enrichment-event:'||group_row.event_id::text;
    insert into writing_shadow_run_enrichment_scopes(run_id,event_id,event_sequence,environment_key)
      values(v_run,group_row.event_id,group_row.event_sequence,group_row.environment_key) on conflict do nothing;
    for target in select occurrence_id from writing_enrichment_replay_targets where event_id=group_row.event_id
      and snapshot_id=group_row.snapshot_id and run_id is null order by occurrence_id loop
      insert into writing_shadow_run_occurrences(run_id,occurrence_id) values(v_run,target.occurrence_id) on conflict do nothing;
    end loop;
    update writing_enrichment_replay_targets set run_id=v_run where event_id=group_row.event_id and snapshot_id=group_row.snapshot_id and run_id is null;
    n:=n+1;
  end loop;
  return n;
end $$;

-- Preserve baseline work rows without claiming they succeeded; new event work shares the same run queue.
create or replace function public.schedule_writing_enrichment_replays(p_limit integer default 20)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare work record; n integer:=0; v_run uuid; bounded integer:=greatest(1,least(coalesce(p_limit,20),20));
begin
  perform discover_writing_enrichment_targets(500);
  for work in select w.* from writing_enrichment_replay_work w
    join writing_source_snapshots s on s.id=w.snapshot_id
    join writing_shadow_controls c on c.child_id=s.child_id and c.parent_user_id=s.parent_user_id and c.processing_enabled
    where w.scheduled_at is null order by w.release_id,w.snapshot_id limit bounded for update of w skip locked loop
    perform enqueue_writing_shadow_replay(array[work.snapshot_id],'reviewed-release:'||work.release_id::text);
    select id into v_run from writing_shadow_runs where snapshot_id=work.snapshot_id and analysis_version='WRITING_SHADOW_V1'
      and replay_key='reviewed-release:'||work.release_id::text;
    update writing_enrichment_replay_work set scheduled_at=now(),run_id=v_run where snapshot_id=work.snapshot_id and release_id=work.release_id;
    n:=n+1;
  end loop;
  if n<bounded then n:=n+schedule_writing_enrichment_event_replays(bounded-n); end if;
  return n;
end $$;

create view public.writing_enrichment_replay_status as
select e.id event_id,e.event_sequence,e.environment_key,e.event_kind,e.authority_reference,p.discovery_complete,
  count(t.occurrence_id)::bigint target_count,count(t.run_id)::bigint scheduled_target_count,
  count(*) filter(where r.status='completed')::bigint completed_target_count,
  count(*) filter(where r.status='failed' and r.attempt_count=8)::bigint exhausted_target_count,
  count(*) filter(where r.status='failed' and r.attempt_count<8)::bigint failed_target_count
from writing_enrichment_authority_events e join writing_enrichment_event_progress p on p.event_id=e.id
left join writing_enrichment_replay_targets t on t.event_id=e.id left join writing_shadow_runs r on r.id=t.run_id
group by e.id,e.event_sequence,e.environment_key,e.event_kind,e.authority_reference,p.discovery_complete;

create view public.writing_enrichment_metrics as
select a.environment_key,a.generation_method,a.primary_source_kind,count(*)::bigint candidate_attempts,
  count(l.package_id)::bigint packaged_candidates,
  count(*) filter(where pr.release_id is not null)::bigint published_candidates,
  count(*) filter(where rev.decisions->>l.candidate_index='approved')::bigint approved_candidates,
  count(*) filter(where rev.decisions->>l.candidate_index='rejected')::bigint rejected_candidates,
  coalesce(sum(m.curator_active_seconds) filter(where l.candidate_index=0),0)::bigint curator_active_seconds,
  0::bigint ai_calls,0::bigint ai_tokens,0::numeric ai_cost
from writing_enrichment_attempts a left join writing_enrichment_attempt_packages l on l.attempt_id=a.id
left join adle_word_skill_package_reviews rev on rev.package_id=l.package_id
left join adle_word_skill_package_publications pr on pr.package_id=l.package_id
left join adle_word_skill_review_metrics m on m.package_id=l.package_id
group by a.environment_key,a.generation_method,a.primary_source_kind;

-- Per-occurrence authority sequence prevents an older replay finishing late from becoming current.
create view public.writing_current_occurrence_interpretations as
select distinct on(i.occurrence_id) i.*,coalesce(scope.event_sequence,0) authority_event_sequence
from writing_occurrence_interpretations i join writing_shadow_runs r on r.id=i.run_id and r.status='completed'
left join writing_shadow_run_enrichment_scopes scope on scope.run_id=r.id
order by i.occurrence_id,coalesce(scope.event_sequence,0) desc,r.completed_at desc,r.id desc,i.id desc;

create view public.writing_enrichment_event_resolution_metrics as
select e.id event_id,e.event_kind,e.environment_key,count(t.occurrence_id)::bigint affected_occurrences,
  count(*) filter(where before_i.resolution_status<>'resolved' and after_i.resolution_status='resolved')::bigint identity_resolutions,
  count(*) filter(where (case when jsonb_typeof(before_i.interpretation->'relationships')='array' then jsonb_array_length(before_i.interpretation->'relationships') else 0 end)=0
    and (case when jsonb_typeof(after_i.interpretation->'relationships')='array' then jsonb_array_length(after_i.interpretation->'relationships') else 0 end)>0)::bigint relationship_resolutions,
  count(*) filter(where (case when jsonb_typeof(before_i.interpretation->'relationships')='array' then jsonb_array_length(before_i.interpretation->'relationships') else 0 end)>0
    and (case when jsonb_typeof(after_i.interpretation->'relationships')='array' then jsonb_array_length(after_i.interpretation->'relationships') else 0 end)=0)::bigint relationship_withdrawals
from writing_enrichment_authority_events e left join writing_enrichment_replay_targets t on t.event_id=e.id
left join lateral (
  select i.* from writing_occurrence_interpretations i join writing_shadow_runs r on r.id=i.run_id and r.status='completed'
  left join writing_shadow_run_enrichment_scopes s on s.run_id=r.id
  where i.occurrence_id=t.occurrence_id and coalesce(s.event_sequence,0)<e.event_sequence
  order by coalesce(s.event_sequence,0) desc,r.completed_at desc,r.id desc,i.id desc limit 1
) before_i on true
left join lateral (
  select i.* from writing_occurrence_interpretations i join writing_shadow_runs r on r.id=i.run_id and r.status='completed'
  join writing_shadow_run_enrichment_scopes s on s.run_id=r.id and s.event_sequence=e.event_sequence
  where i.occurrence_id=t.occurrence_id
  order by r.completed_at desc,r.id desc,i.id desc limit 1
) after_i on true
group by e.id,e.event_kind,e.environment_key;

create view public.writing_enrichment_rejection_metrics as
select p.environment_key,a.rejection_reason,count(*)::bigint rejection_count
from adle_word_skill_pair_review_annotations a join adle_word_skill_candidate_packages p on p.id=a.package_id
group by p.environment_key,a.rejection_reason;

-- Compose with either the S2 or S5 result writer. Scope validation belongs in
-- triggers so E1 never replaces the evidence persistence authority.
create function public.validate_writing_enrichment_interpretation_scope() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if exists(select 1 from writing_shadow_run_enrichment_scopes where run_id=new.run_id)
    and not exists(select 1 from writing_shadow_run_occurrences where run_id=new.run_id and occurrence_id=new.occurrence_id)
    then raise exception 'writing_enrichment_scope_invalid'; end if;
  return new;
end $$;
create trigger writing_enrichment_interpretation_scope before insert on public.writing_occurrence_interpretations
  for each row execute function public.validate_writing_enrichment_interpretation_scope();

create function public.validate_writing_enrichment_run_completion() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='completed' and old.status<>'completed'
    and exists(select 1 from writing_shadow_run_enrichment_scopes where run_id=new.id)
    and (select count(*) from writing_occurrence_interpretations where run_id=new.id)<>
      (select count(*) from writing_shadow_run_occurrences where run_id=new.id)
    then raise exception 'writing_enrichment_scope_incomplete'; end if;
  return new;
end $$;
create trigger writing_enrichment_run_completion before update on public.writing_shadow_runs
  for each row execute function public.validate_writing_enrichment_run_completion();

-- S5 may have been applied concurrently. Its snapshot-level current view would
-- hide unaffected occurrences after a partial E1 replay, so compose a
-- per-occurrence view when those S5 tables exist.
do $$ begin
  if to_regclass('public.writing_shadow_occurrence_evidence_receipts') is not null then
    execute $view$
      create or replace view public.writing_shadow_current_occurrence_evidence
      with (security_invoker=true) as
      select distinct on(e.occurrence_id) e.*
      from public.writing_shadow_occurrence_evidence_receipts e
      join public.writing_shadow_projection_batches b on b.id=e.batch_id
      join public.writing_shadow_runs r on r.id=b.run_id and r.status='completed'
      left join public.writing_shadow_run_enrichment_scopes s on s.run_id=r.id
      order by e.occurrence_id,coalesce(s.event_sequence,0) desc,r.completed_at desc,r.id desc,e.id desc
    $view$;
  end if;
end $$;

alter table public.writing_enrichment_controls enable row level security;
alter table public.writing_enrichment_cohorts enable row level security;
alter table public.writing_enrichment_inventory_runs enable row level security;
alter table public.writing_enrichment_inventory_entries enable row level security;
alter table public.writing_enrichment_inventory_occurrences enable row level security;
alter table public.writing_enrichment_attempts enable row level security;
alter table public.writing_enrichment_attempt_packages enable row level security;
alter table public.adle_word_skill_pair_review_annotations enable row level security;
alter table public.adle_word_skill_review_metrics enable row level security;
alter table public.writing_enrichment_authority_events enable row level security;
alter table public.writing_enrichment_event_progress enable row level security;
alter table public.writing_enrichment_replay_targets enable row level security;
alter table public.writing_shadow_run_enrichment_scopes enable row level security;
alter table public.writing_shadow_run_occurrences enable row level security;

revoke all on public.writing_enrichment_controls,public.writing_enrichment_cohorts,public.writing_enrichment_inventory_runs,
  public.writing_enrichment_inventory_entries,public.writing_enrichment_inventory_occurrences,public.writing_enrichment_attempts,
  public.writing_enrichment_attempt_packages,public.adle_word_skill_pair_review_annotations,public.adle_word_skill_review_metrics,
  public.writing_enrichment_authority_events,public.writing_enrichment_event_progress,public.writing_enrichment_replay_targets,
  public.writing_shadow_run_enrichment_scopes,public.writing_shadow_run_occurrences from anon,authenticated;
grant select,update on public.writing_enrichment_controls,public.writing_enrichment_cohorts to service_role;
grant select on public.writing_enrichment_inventory_runs,public.writing_enrichment_inventory_entries,public.writing_enrichment_inventory_occurrences,
  public.writing_enrichment_attempts,public.writing_enrichment_attempt_packages,public.adle_word_skill_pair_review_annotations,
  public.adle_word_skill_review_metrics,public.writing_enrichment_authority_events,public.writing_enrichment_event_progress,
  public.writing_enrichment_replay_targets,public.writing_shadow_run_enrichment_scopes,public.writing_shadow_run_occurrences,
  public.writing_enrichment_replay_status,public.writing_enrichment_metrics,public.writing_current_occurrence_interpretations,
  public.writing_enrichment_event_resolution_metrics,public.writing_enrichment_rejection_metrics to service_role;

create function public.record_writing_enrichment_attempt(
  p_key text,p_entry uuid,p_environment text,p_generator_version text,p_method text,p_source_kind text,p_source_fingerprint text,
  p_authority_references jsonb,p_dictionary_fingerprint text,p_relationship_fingerprint text,p_candidate jsonb,p_findings jsonb,p_outcome text,p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.writing_enrichment_attempts%rowtype; v_id uuid;
begin
  if not exists(select 1 from writing_enrichment_controls where environment_key=p_environment and generation_enabled)
    then raise exception 'WRITING_ENRICHMENT_GENERATION_DISABLED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('writing-enrichment-attempt:'||p_key,0));
  select * into existing from writing_enrichment_attempts where attempt_key=p_key;
  if existing.id is not null then
    if existing.inventory_entry_id<>p_entry or existing.source_fingerprint<>p_source_fingerprint or existing.candidate is distinct from p_candidate
      then raise exception 'WRITING_ENRICHMENT_ATTEMPT_CONFLICT'; end if;
    return existing.id;
  end if;
  insert into writing_enrichment_attempts(attempt_key,inventory_entry_id,environment_key,generator_version,generation_method,
    primary_source_kind,source_fingerprint,authority_references,dictionary_fingerprint,relationship_fingerprint,candidate,findings,outcome,created_by)
  values(p_key,p_entry,p_environment,p_generator_version,p_method,p_source_kind,p_source_fingerprint,p_authority_references,
    p_dictionary_fingerprint,p_relationship_fingerprint,p_candidate,p_findings,p_outcome,p_actor) returning id into v_id;
  return v_id;
end $$;

create function public.create_writing_enrichment_candidate_package(
  p_attempts uuid[],p_package_key text,p_environment text,p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_package uuid; v_candidates jsonb; candidate_count integer; row record; v_candidate_index integer:=0;
begin
  candidate_count:=cardinality(p_attempts);
  if candidate_count not between 1 and 25 then raise exception 'WRITING_ENRICHMENT_BATCH_SIZE_INVALID'; end if;
  if candidate_count<>(select count(distinct id) from writing_enrichment_attempts where id=any(p_attempts)
    and environment_key=p_environment and outcome='candidate' and candidate is not null)
    then raise exception 'WRITING_ENRICHMENT_ATTEMPT_SET_INVALID'; end if;
  select jsonb_agg(candidate order by primary_source_kind,(candidate->>'microSkillKey'),(candidate->>'canonicalWordId'),id)
    into v_candidates from writing_enrichment_attempts where id=any(p_attempts);
  v_package:=create_word_skill_candidate_package(p_package_key,p_environment,v_candidates,p_actor);
  for row in select id from writing_enrichment_attempts where id=any(p_attempts)
    order by primary_source_kind,(candidate->>'microSkillKey'),(candidate->>'canonicalWordId'),id loop
    if exists(select 1 from writing_enrichment_attempt_packages where attempt_id=row.id
      and (package_id<>v_package or candidate_index<>v_candidate_index))
      then raise exception 'WRITING_ENRICHMENT_PACKAGE_LINK_CONFLICT'; end if;
    insert into writing_enrichment_attempt_packages(attempt_id,package_id,candidate_index)
      values(row.id,v_package,v_candidate_index) on conflict(attempt_id) do nothing;
    v_candidate_index:=v_candidate_index+1;
  end loop;
  return v_package;
end $$;

create function public.review_word_skill_candidate_package_with_metrics(
  p_package uuid,p_environment text,p_decisions jsonb,p_rejection_reasons jsonb,p_actor uuid,p_note text,p_active_seconds integer default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; item_index integer:=0;
begin
  if p_active_seconds is not null and p_active_seconds<0 then raise exception 'WORD_SKILL_REVIEW_TIME_INVALID'; end if;
  if jsonb_typeof(p_rejection_reasons) is distinct from 'array' or jsonb_array_length(p_rejection_reasons)<>jsonb_array_length(p_decisions)
    then raise exception 'WORD_SKILL_REJECTION_REASONS_INVALID'; end if;
  perform review_word_skill_candidate_package(p_package,p_environment,p_decisions,p_actor,p_note);
  for item in select value from jsonb_array_elements(p_rejection_reasons) loop
    if p_decisions->>item_index='rejected' and nullif(btrim(item#>>'{}'),'') is null then raise exception 'WORD_SKILL_REJECTION_REASON_REQUIRED'; end if;
    if p_decisions->>item_index='approved' and nullif(btrim(item#>>'{}'),'') is not null then raise exception 'WORD_SKILL_APPROVED_REASON_INVALID'; end if;
    if p_decisions->>item_index='rejected' then
      if exists(select 1 from adle_word_skill_pair_review_annotations where package_id=p_package and candidate_index=item_index
        and rejection_reason<>btrim(item#>>'{}')) then raise exception 'WORD_SKILL_REJECTION_REASON_CONFLICT'; end if;
      insert into adle_word_skill_pair_review_annotations(package_id,candidate_index,rejection_reason)
        values(p_package,item_index,btrim(item#>>'{}')) on conflict do nothing;
    end if;
    item_index:=item_index+1;
  end loop;
  if exists(select 1 from adle_word_skill_review_metrics where package_id=p_package
    and curator_active_seconds is distinct from p_active_seconds) then raise exception 'WORD_SKILL_REVIEW_TIME_CONFLICT'; end if;
  insert into adle_word_skill_review_metrics(package_id,curator_active_seconds) values(p_package,p_active_seconds) on conflict do nothing;
end $$;

revoke all on function public.persist_writing_enrichment_inventory(text,text,jsonb,uuid),
  public.record_writing_enrichment_attempt(text,uuid,text,text,text,text,text,jsonb,text,text,jsonb,jsonb,text,uuid),
  public.create_writing_enrichment_candidate_package(uuid[],text,text,uuid),
  public.review_word_skill_candidate_package_with_metrics(uuid,text,jsonb,jsonb,uuid,text,integer),
  public.record_writing_enrichment_authority_event(text,text,text,uuid,uuid[],uuid),
  public.record_writing_enrichment_dictionary_release(text,uuid,text,uuid[],uuid),
  public.discover_writing_enrichment_targets(integer),public.schedule_writing_enrichment_event_replays(integer),
  public.capture_writing_enrichment_withdrawal_event(),public.converge_writing_enrichment_target(),
  public.validate_writing_enrichment_interpretation_scope(),public.validate_writing_enrichment_run_completion()
  from public,anon,authenticated;
grant execute on function public.persist_writing_enrichment_inventory(text,text,jsonb,uuid),
  public.record_writing_enrichment_attempt(text,uuid,text,text,text,text,text,jsonb,text,text,jsonb,jsonb,text,uuid),
  public.create_writing_enrichment_candidate_package(uuid[],text,text,uuid),
  public.review_word_skill_candidate_package_with_metrics(uuid,text,jsonb,jsonb,uuid,text,integer),
  public.record_writing_enrichment_dictionary_release(text,uuid,text,uuid[],uuid),
  public.discover_writing_enrichment_targets(integer),public.schedule_writing_enrichment_event_replays(integer) to service_role;
