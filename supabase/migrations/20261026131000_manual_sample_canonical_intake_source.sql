begin;

-- A parent-authored manual sample is an independent, authentic source. Keep
-- its sample and spelling occurrence IDs instead of manufacturing a lesson
-- submission or an ADLE review session.
alter table public.parent_verified_spelling_candidate_mappings
  drop constraint parent_verified_spelling_candidate_mappings_source_provenance_c;
alter table public.parent_verified_spelling_candidate_mappings
  add constraint parent_verified_spelling_candidate_mappings_source_provenance_c check (
    source_provenance in (
      'lesson_submission_existing_output',
      'lesson_submission_parent_added_missed_word',
      'adle_review_submitted_writing_parent_identified',
      'manual_writing_sample_parent_verified'
    )
  ),
  add constraint parent_verified_spelling_candidate_mappings_manual_source_check check (
    source_provenance <> 'manual_writing_sample_parent_verified'
    or (
      task_submission_id is null
      and source_adle_review_session_id is null
      and writing_sample_id is not null
      and source_misspelling_instance_id is not null
    )
  );

alter table public.adle_canonical_intake_candidates
  add column source_writing_sample_id uuid
    references public.writing_samples(id) on delete restrict;
alter table public.adle_canonical_intake_candidates
  drop constraint adle_canonical_intake_candidates_one_source_check;
alter table public.adle_canonical_intake_candidates
  add constraint adle_canonical_intake_candidates_one_source_check check (
    num_nonnulls(
      source_submission_id, source_adle_review_session_id,
      source_writing_sample_id
    ) = 1
  );
create index adle_canonical_intake_candidates_manual_sample_idx
  on public.adle_canonical_intake_candidates(source_writing_sample_id)
  where source_writing_sample_id is not null;

-- Existing candidate SQL is the authority for blocked, seeded and ready
-- states. Extend only its source anchor; all content and release checks stay
-- in those original functions.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.adle_seed_canonical_intake_candidate_r8b_delegate(uuid,text,text,text,text,text)'::regprocedure,
    'public.adle_record_canonical_intake_blocked_r8b_delegate(uuid,text,uuid,text,text,text,text,text,jsonb,text,text,text)'::regprocedure,
    'public.adle_persist_canonical_intake_r8b_delegate(uuid,uuid,text,uuid,uuid,text,text,text,date,text,text,uuid,uuid,text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_updated := regexp_replace(
      v_definition,
      'num_nonnulls\(v_source\.task_submission_id, v_source\.source_adle_review_session_id\) <> 1',
      'num_nonnulls(v_source.task_submission_id, v_source.source_adle_review_session_id, case when v_source.source_provenance = ''manual_writing_sample_parent_verified'' then v_source.writing_sample_id end) <> 1',
      'gi'
    );
    if v_updated = v_definition then
      raise exception 'Manual source guard preflight failed for %', v_signature;
    end if;
    v_definition := v_updated;
    v_updated := regexp_replace(
      v_definition,
      'source_candidate_mapping_id\s*,\s*source_submission_id\s*,\s*source_adle_review_session_id\s*,\s*child_id',
      'source_candidate_mapping_id, source_submission_id, source_adle_review_session_id, source_writing_sample_id, child_id',
      'gi'
    );
    if v_updated = v_definition then
      raise exception 'Manual source column preflight failed for %', v_signature;
    end if;
    v_definition := v_updated;
    v_updated := regexp_replace(
      v_definition,
      'p_candidate_mapping_id\s*,\s*v_source\.task_submission_id\s*,\s*v_source\.source_adle_review_session_id\s*,\s*(v_source\.child_id|p_child_id)',
      'p_candidate_mapping_id, v_source.task_submission_id, v_source.source_adle_review_session_id, case when v_source.source_provenance = ''manual_writing_sample_parent_verified'' then v_source.writing_sample_id end, \1',
      'gi'
    );
    if v_updated = v_definition then
      raise exception 'Manual source value preflight failed for %', v_signature;
    end if;
    execute v_updated;
  end loop;
end;
$$;

-- The service-only continuation validator must recognise the same exact
-- manual occurrence. Its existing lesson and ADLE-review branches are kept.
do $$
declare
  v_definition text;
  v_updated text;
  v_branch text := $branch$
  elsif v_source.source_provenance = 'manual_writing_sample_parent_verified' then
    if v_source.task_submission_id is not null
      or v_source.source_adle_review_session_id is not null
      or v_source.source_misspelling_instance_id is null
      or v_verification.source_type <> 'manual_writing_sample_parent_verified'
      or v_verification.writing_sample_id is distinct from v_source.writing_sample_id
      or not exists (
        select 1 from public.writing_samples sample
        join public.misspelling_instances occurrence
          on occurrence.writing_sample_id = sample.id
        where sample.id = v_source.writing_sample_id
          and sample.parent_user_id = p_expected_parent_user_id
          and sample.child_id = p_expected_child_id
          and sample.task_submission_id is null
          and occurrence.id = v_source.source_misspelling_instance_id
          and occurrence.parent_user_id = p_expected_parent_user_id
          and occurrence.child_id = p_expected_child_id
          and lower(btrim(occurrence.misspelled_word)) = v_source.misspelling_normalized
          and lower(btrim(occurrence.corrected_word)) = v_source.correct_spelling_normalized
          and occurrence.position_start is not null
          and occurrence.position_end = occurrence.position_start
            + char_length(occurrence.misspelled_word)
          and substr(sample.sample_text, occurrence.position_start + 1,
            char_length(occurrence.misspelled_word)) = occurrence.misspelled_word
      )
    then
      raise exception 'The manual sample lacks exact parent-verified occurrence authority.';
    end if;
  else
  $branch$;
begin
  select pg_get_functiondef(
    'public.adle_authorize_governed_source_continuation(uuid,uuid,uuid)'::regprocedure
  ) into v_definition;
  v_updated := regexp_replace(v_definition,
    'v_source\.task_submission_id, v_source\.source_adle_review_session_id',
    'v_source.task_submission_id, v_source.source_adle_review_session_id, case when v_source.source_provenance = ''manual_writing_sample_parent_verified'' then v_source.writing_sample_id end',
    'i');
  if v_updated = v_definition then
    raise exception 'Manual continuation source-count preflight failed';
  end if;
  v_definition := v_updated;
  v_updated := regexp_replace(v_definition,
    'else\s+if v_source\.source_provenance <> ''adle_review_submitted_writing_parent_identified''',
    v_branch || E'    if v_source.source_provenance <> ''adle_review_submitted_writing_parent_identified''',
    'i');
  if v_updated = v_definition then
    raise exception 'Manual continuation branch preflight failed';
  end if;
  v_definition := v_updated;
  v_updated := replace(v_definition,
    '''source_adle_review_session_id'', v_source.source_adle_review_session_id,',
    '''source_adle_review_session_id'', v_source.source_adle_review_session_id,' || E'\n    ' ||
      '''writing_sample_id'', case when v_source.source_provenance = ''manual_writing_sample_parent_verified'' then v_source.writing_sample_id end,');
  if v_updated = v_definition then
    raise exception 'Manual continuation receipt preflight failed';
  end if;
  execute v_updated;
end;
$$;

create unique index parent_verifications_manual_sample_occurrence_idx
  on public.parent_verifications(parent_user_id, child_id, source_entity_id)
  where source_type = 'manual_writing_sample_parent_verified';

create or replace function public.validate_manual_sample_candidate_source()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.source_provenance <> 'manual_writing_sample_parent_verified' then
    return new;
  end if;
  if not exists (
    select 1 from public.writing_samples sample
    join public.misspelling_instances occurrence
      on occurrence.writing_sample_id = sample.id
    join public.parent_verifications verification
      on verification.id = new.parent_verification_id
    where sample.id = new.writing_sample_id
      and sample.parent_user_id = new.parent_user_id
      and sample.child_id = new.child_id
      and sample.task_submission_id is null
      and occurrence.id = new.source_misspelling_instance_id
      and occurrence.parent_user_id = new.parent_user_id
      and occurrence.child_id = new.child_id
      and lower(btrim(occurrence.misspelled_word)) = new.misspelling_normalized
      and lower(btrim(occurrence.corrected_word)) = new.correct_spelling_normalized
      and verification.parent_user_id = new.parent_user_id
      and verification.child_id = new.child_id
      and verification.writing_sample_id = sample.id
      and verification.source_type = 'manual_writing_sample_parent_verified'
      and verification.source_entity_id = new.reviewed_event_source_entity_id
      and verification.decision in ('accepted', 'overridden')
      and coalesce(verification.verified_micro_skill_key,
        verification.suggested_micro_skill_key) = new.micro_skill_key
  ) then
    raise exception 'Manual candidate lacks exact parent-verified sample authority.';
  end if;
  return new;
end;
$$;

create trigger parent_candidate_validate_manual_sample_source
before insert or update on public.parent_verified_spelling_candidate_mappings
for each row execute function public.validate_manual_sample_candidate_source();

create or replace function public.validate_manual_intake_candidate_source()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source_writing_sample_id is not null and not exists (
    select 1 from public.parent_verified_spelling_candidate_mappings source
    where source.id = new.source_candidate_mapping_id
      and source.source_provenance = 'manual_writing_sample_parent_verified'
      and source.writing_sample_id = new.source_writing_sample_id
      and source.child_id = new.child_id
      and source.micro_skill_key = new.micro_skill_key
      and source.candidate_status in ('parent_local_promoted', 'global_canonical_promoted')
  ) then
    raise exception 'Manual intake candidate source does not match its approved correction.';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_manual_intake_candidate_source()
  from public, anon, authenticated;
create trigger adle_canonical_intake_validate_manual_sample_source
before insert or update of source_candidate_mapping_id, source_writing_sample_id
on public.adle_canonical_intake_candidates
for each row execute function public.validate_manual_intake_candidate_source();

create or replace function public.capture_parent_manual_sample_spelling_candidate(
  p_writing_sample_id uuid,
  p_observed_text text,
  p_correct_text text,
  p_micro_skill_key text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_id uuid := auth.uid();
  v_sample public.writing_samples%rowtype;
  v_existing public.parent_verified_spelling_candidate_mappings%rowtype;
  v_occurrence_id uuid;
  v_verification_id uuid;
  v_mapping_id uuid;
  v_observed text := btrim(p_observed_text);
  v_correct text := btrim(p_correct_text);
  v_start integer;
  v_end integer;
  v_source_entity_id text;
  v_now timestamptz := clock_timestamp();
begin
  if v_parent_id is null then
    raise exception 'Sign in before reviewing a manual spelling.';
  end if;
  if v_observed !~ '^[[:alpha:]]{1,120}$'
    or v_correct !~ '^[[:alpha:]]{1,120}$'
    or lower(v_observed) = lower(v_correct)
  then
    raise exception 'Enter one misspelled word and a different corrected word.';
  end if;

  select * into v_sample from public.writing_samples
  where id = p_writing_sample_id and parent_user_id = v_parent_id
    and task_submission_id is null and review_completed_at is null
  for update;
  if not found then
    raise exception 'The open manual writing sample is unavailable.';
  end if;
  if not exists (
    select 1 from public.micro_skill_catalog skill
    where skill.micro_skill_key = p_micro_skill_key
      and skill.mastery_domain_key = 'D4'
      and skill.is_active and skill.is_assignable
  ) then
    raise exception 'Choose an active assignable spelling micro-skill.';
  end if;

  v_start := strpos(v_sample.sample_text, v_observed) - 1;
  if v_start < 0
    or strpos(substr(v_sample.sample_text, v_start + char_length(v_observed) + 1), v_observed) > 0
  then
    raise exception 'The misspelling must occur exactly once in the saved sample.';
  end if;
  v_end := v_start + char_length(v_observed);
  if (v_start > 0 and substr(v_sample.sample_text, v_start, 1) ~ '[[:alpha:]]')
    or (v_end < char_length(v_sample.sample_text)
      and substr(v_sample.sample_text, v_end + 1, 1) ~ '[[:alpha:]]')
  then
    raise exception 'Select a complete word from the saved sample.';
  end if;

  v_source_entity_id := concat_ws('::',
    'manual_writing_sample', v_sample.id::text,
    v_start::text || '-' || v_end::text,
    lower(v_observed), lower(v_correct)
  );
  perform pg_advisory_xact_lock(hashtextextended(v_source_entity_id, 0));
  select * into v_existing
  from public.parent_verified_spelling_candidate_mappings mapping
  where mapping.parent_user_id = v_parent_id
    and mapping.child_id = v_sample.child_id
    and mapping.reviewed_event_source_entity_id = v_source_entity_id
  order by mapping.created_at desc limit 1;
  if found then
    if v_existing.micro_skill_key <> p_micro_skill_key
      or v_existing.candidate_status not in ('parent_local_promoted', 'global_canonical_promoted')
    then
      raise exception 'This occurrence has a different or withdrawn review decision.';
    end if;
    return v_existing.id;
  end if;
  if exists (
    select 1 from public.misspelling_instances occurrence
    where occurrence.writing_sample_id = v_sample.id
      and occurrence.position_start = v_start
      and occurrence.position_end = v_end
      and lower(occurrence.misspelled_word) = lower(v_observed)
      and lower(occurrence.corrected_word) <> lower(v_correct)
  ) then
    raise exception 'This occurrence already has a different correction.';
  end if;

  select occurrence.id into v_occurrence_id
  from public.misspelling_instances occurrence
  where occurrence.writing_sample_id = v_sample.id
    and occurrence.parent_user_id = v_parent_id
    and occurrence.child_id = v_sample.child_id
    and occurrence.position_start = v_start
    and occurrence.position_end = v_end
    and lower(occurrence.misspelled_word) = lower(v_observed)
    and lower(occurrence.corrected_word) = lower(v_correct)
  order by occurrence.created_at, occurrence.id limit 1 for update;
  if v_occurrence_id is null then
    insert into public.misspelling_instances(
      writing_sample_id, child_id, parent_user_id, misspelled_word,
      corrected_word, context_text, position_start, position_end, notes,
      is_parent_overridden
    ) values (
      v_sample.id, v_sample.child_id, v_parent_id, v_observed,
      v_correct, v_sample.sample_text, v_start, v_end,
      'Parent verified from manual writing sample.', true
    ) returning id into v_occurrence_id;
  end if;

  insert into public.parent_verifications(
    child_id, parent_user_id, domain_module, source_type, source_entity_id,
    writing_sample_id, suggested_micro_skill_key, decision,
    verified_micro_skill_key, verification_notes, metadata
  ) values (
    v_sample.child_id, v_parent_id, 'spelling',
    'manual_writing_sample_parent_verified', v_source_entity_id,
    v_sample.id, p_micro_skill_key, 'overridden', p_micro_skill_key,
    'Parent confirmed the spelling and micro-skill from a manual sample.',
    jsonb_build_object('source_misspelling_instance_id', v_occurrence_id,
      'position_start', v_start, 'position_end', v_end)
  ) returning id into v_verification_id;

  insert into public.parent_verified_spelling_candidate_mappings(
    parent_user_id, child_id, parent_verification_id, writing_sample_id,
    source_misspelling_instance_id, source_provenance,
    reviewed_event_source_entity_id, original_child_spelling,
    original_correct_spelling, misspelling_normalized,
    correct_spelling_normalized, micro_skill_key, candidate_status,
    promotion_scope, metadata
  ) values (
    v_parent_id, v_sample.child_id, v_verification_id, v_sample.id,
    v_occurrence_id, 'manual_writing_sample_parent_verified',
    v_source_entity_id, v_observed, v_correct,
    lower(v_observed), lower(v_correct), p_micro_skill_key,
    'parent_local_promoted', 'parent_local',
    jsonb_build_object('latest_parent_local_promotion', jsonb_build_object(
      'promotedAt', v_now, 'promotedByParentUserId', v_parent_id,
      'actionSource', 'manual_writing_sample_parent_verified'))
  ) returning id into v_mapping_id;
  return v_mapping_id;
end;
$$;

revoke all on function public.capture_parent_manual_sample_spelling_candidate(uuid,text,text,text)
  from public, anon;
grant execute on function public.capture_parent_manual_sample_spelling_candidate(uuid,text,text,text)
  to authenticated;

commit;
