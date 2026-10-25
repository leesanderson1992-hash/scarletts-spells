begin;

-- The canonical mapping remains spelling-correction evidence after its
-- word-skill relationship is withdrawn. This service-only read identifies
-- mappings whose skill attribution is currently vetoed in this environment.
-- It returns mapping IDs rather than dictionary rows or learner evidence.
create function public.find_withdrawn_resolver_mapping_ids(
  p_environment_key text,
  p_mapping_ids uuid[]
) returns table (mapping_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_environment_key not in ('local', 'staging', 'production')
    or p_environment_key is null
    or p_mapping_ids is null
    or cardinality(p_mapping_ids) > 1000
    or array_position(p_mapping_ids, null) is not null then
    raise exception 'RESOLVER_PAIR_SCOPE_INVALID';
  end if;

  return query
    select distinct mapping.id
    from public.spelling_canonical_mappings mapping
    join public.canonical_teaching_dictionary_words word
      on word.normalised_word = mapping.correct_spelling_normalized
      and word.dialect_code = mapping.dialect_code
      and word.row_status = 'active'
    join public.teaching_dictionary_pair_latest_decisions decision
      on decision.canonical_word_id = word.id
      and decision.micro_skill_key = mapping.micro_skill_key
      and decision.environment_key = p_environment_key
      and decision.action = 'deassign'
    where mapping.id = any(p_mapping_ids);
end $$;

revoke all on function public.find_withdrawn_resolver_mapping_ids(text, uuid[]) from public, anon, authenticated;
grant execute on function public.find_withdrawn_resolver_mapping_ids(text, uuid[]) to service_role;

-- The old unscoped materializer cannot apply environment-specific withdrawals.
-- Application workers use this scoped entrypoint; retained historical facts
-- remain immutable and can be materialized again if the pair is restored.
create function public.materialize_writing_known_error_review_candidates_scoped(p_limit integer, p_environment_key text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare materialized_count integer;
begin
  if p_limit<1 or p_limit>500 then raise exception 'writing_known_error_materialization_limit_invalid'; end if;
  if p_environment_key is null or p_environment_key not in ('local','staging','production') then
    raise exception 'writing_known_error_materialization_environment_invalid';
  end if;
  with eligible as (
    select f.*,o.observed_text,o.field_path,o.start_utf16,o.end_utf16,b.parent_user_id,b.child_id,b.snapshot_id,
      s.submission_id,ws.id writing_sample_id
    from public.writing_known_spelling_current_findings f
    join public.writing_known_spelling_batches b on b.id=f.batch_id
    left join public.writing_shadow_run_enrichment_scopes scope on scope.run_id=b.run_id
    join public.writing_occurrences o on o.id=f.occurrence_id
    join public.writing_source_snapshots s on s.id=b.snapshot_id
    join public.writing_shadow_controls control on control.child_id=b.child_id and control.parent_user_id=b.parent_user_id
      and control.known_error_review_enabled
    join public.writing_samples ws on ws.task_submission_id=s.submission_id and ws.parent_user_id=b.parent_user_id and ws.child_id=b.child_id
    where not exists(select 1 from public.misspelling_instances m where m.source_writing_occurrence_id=f.occurrence_id)
      -- A stored historical finding can outlive its teaching assignment. Do
      -- not turn it into a new skill-bearing review candidate after withdrawal.
      and not exists (
        select 1
        from unnest(f.micro_skill_keys) as skill(micro_skill_key)
        join public.canonical_teaching_dictionary_words word
          on word.normalised_word=f.intended_normalized
          and word.dialect_code=f.dialect and word.row_status='active'
        join public.teaching_dictionary_pair_latest_decisions decision
          on decision.canonical_word_id=word.id
          and decision.micro_skill_key=skill.micro_skill_key
          and decision.environment_key=coalesce(scope.environment_key,p_environment_key)
          and decision.action='deassign'
      )
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

revoke execute on function public.materialize_writing_known_error_review_candidates(integer) from service_role;
revoke all on function public.materialize_writing_known_error_review_candidates_scoped(integer,text) from public,anon,authenticated;
grant execute on function public.materialize_writing_known_error_review_candidates_scoped(integer,text) to service_role;

commit;
