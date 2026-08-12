-- CW-3B-2: transfer canonical-intake ownership to the already-published,
-- environment-neutral Compound Word v2 release authority. This migration
-- creates no activation, learning item, assignment, evidence, or schedule.

begin;

create or replace function public.adle_micro_skill_owns_compound_word_lab_v2(
  p_micro_skill_key text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.micro_skill_catalog skill
    where skill.micro_skill_key = p_micro_skill_key
      and skill.skill_cluster_key = 'D4_MOR_COMPOUND_WORDS'
  );
$$;

revoke all on function public.adle_micro_skill_owns_compound_word_lab_v2(text)
  from public, anon, authenticated;
grant execute on function public.adle_micro_skill_owns_compound_word_lab_v2(text)
  to service_role;

create or replace function public.adle_compound_word_release_is_intake_ready_v2(
  p_release_manifest_id uuid,
  p_release_manifest_sha256 text,
  p_dependency_fingerprint text,
  p_micro_skill_key text,
  p_canonical_word_id uuid,
  p_correct_spelling_normalized text
) returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.adle_curriculum_release_manifests release
    join public.micro_skill_catalog skill
      on skill.micro_skill_key = p_micro_skill_key
    join public.canonical_teaching_dictionary_words word
      on word.id = p_canonical_word_id
    where release.id = p_release_manifest_id
      and release.release_manifest_sha256 = p_release_manifest_sha256
      and release.dependency_fingerprint = p_dependency_fingerprint
      and release.route_id = 'compound_word_lab'
      and release.route_version = 'v2'
      and release.activation_route_key = 'compound_word_lab:v2'
      and release.payload_version = 2
      and jsonb_array_length(release.manifest_payload->'microSkills') = 1
      and release.manifest_payload#>>'{microSkills,0,microSkillKey}' = p_micro_skill_key
      and skill.mastery_domain_key = 'D4'
      and skill.skill_cluster_key = 'D4_MOR_COMPOUND_WORDS'
      and skill.is_active and skill.is_assignable
      and word.normalised_word = lower(btrim(p_correct_spelling_normalized))
      and word.row_status = 'active'
      and word.review_status = 'approved_for_first_exposure'
      and (
        select count(*) = 3
          and count(*) filter (where dependency.authority_type = 'compound_structure') = 1
          and count(*) filter (where dependency.authority_type = 'teaching_content') = 1
          and count(*) filter (where dependency.authority_type = 'teaching_dictionary_closure') = 1
        from public.adle_curriculum_release_dependencies dependency
        join public.adle_curriculum_dependency_authorities authority
          on authority.id = dependency.authority_id
         and authority.authority_type = dependency.authority_type
         and authority.authority_key = dependency.authority_key
         and authority.schema_version = dependency.authority_schema_version
         and authority.semantic_fingerprint = dependency.semantic_fingerprint
        where dependency.release_manifest_id = release.id
          and dependency.micro_skill_key = p_micro_skill_key
      )
      and exists (
        select 1
        from public.adle_curriculum_release_dependencies dependency
        join public.adle_curriculum_dependency_authorities authority
          on authority.id = dependency.authority_id
        join public.canonical_teaching_dictionary_compound_structures_v2 structure
          on structure.canonical_word_id = p_canonical_word_id
         and structure.micro_skill_key = p_micro_skill_key
         and structure.source_metadata->>'dependencyAuthorityId' = authority.id::text
        where dependency.release_manifest_id = release.id
          and dependency.micro_skill_key = p_micro_skill_key
          and dependency.authority_type = 'compound_structure'
          and structure.assignment_eligible
          and structure.row_status = 'active'
          and structure.review_status = 'approved_for_first_exposure'
          and exists (
            select 1
            from jsonb_array_elements(authority.semantic_projection->'structures') projected
            where projected->>'wholeCanonicalWordId' = p_canonical_word_id::text
              and projected->>'microSkillKey' = p_micro_skill_key
              and projected->>'displayForm' = word.display_word
              and projected->>'assignmentEligible' = 'true'
              and jsonb_array_length(projected->'components') >= 2
              and jsonb_array_length(projected->'joins') = jsonb_array_length(projected->'components') - 1
          )
          and (select count(*) from public.canonical_teaching_dictionary_compound_components_v2 component
               where component.structure_id = structure.id) >= 2
          and (select count(*) from public.canonical_teaching_dictionary_compound_joins_v2 compound_join
               where compound_join.structure_id = structure.id)
              = (select count(*) - 1 from public.canonical_teaching_dictionary_compound_components_v2 component
                 where component.structure_id = structure.id)
          and (select string_agg(
              case component.component_ordinal when 1 then '' else case prior_join.join_kind
                when 'space' then ' ' when 'hyphen' then '-' else '' end end || component.display_surface,
              '' order by component.component_ordinal)
            from public.canonical_teaching_dictionary_compound_components_v2 component
            left join public.canonical_teaching_dictionary_compound_joins_v2 prior_join
              on prior_join.structure_id = component.structure_id
             and prior_join.join_ordinal = component.component_ordinal - 1
            where component.structure_id = structure.id) = word.display_word
      )
      and exists (
        select 1
        from public.adle_curriculum_release_dependencies dependency
        join public.adle_curriculum_dependency_authorities authority
          on authority.id = dependency.authority_id
        where dependency.release_manifest_id = release.id
          and dependency.micro_skill_key = p_micro_skill_key
          and dependency.authority_type = 'teaching_content'
          and authority.semantic_projection->>'microSkillKey' = p_micro_skill_key
      )
      and exists (
        select 1
        from public.adle_curriculum_release_dependencies dependency
        join public.adle_teaching_dictionary_closure_words closure_word
          on closure_word.authority_id = dependency.authority_id
         and closure_word.canonical_word_id = p_canonical_word_id
        join public.adle_curriculum_release_dependencies structure_dependency
          on structure_dependency.release_manifest_id = dependency.release_manifest_id
         and structure_dependency.micro_skill_key = dependency.micro_skill_key
         and structure_dependency.authority_type = 'compound_structure'
        join public.adle_curriculum_dependency_authorities structure_authority
          on structure_authority.id = structure_dependency.authority_id
        cross join lateral (
          select projected
          from jsonb_array_elements(structure_authority.semantic_projection->'structures') projected
          where projected->>'wholeCanonicalWordId' = p_canonical_word_id::text
            and projected->>'microSkillKey' = p_micro_skill_key
        ) exact_structure
        where dependency.release_manifest_id = release.id
          and dependency.micro_skill_key = p_micro_skill_key
          and dependency.authority_type = 'teaching_dictionary_closure'
          and closure_word.display_word = word.display_word
          and closure_word.dictation_sentence = exact_structure.projected#>>'{dictation,sentence}'
          and closure_word.dictation_target_token_index = (exact_structure.projected#>>'{dictation,targetStart}')::integer
          and closure_word.dictation_target_end_exclusive = (exact_structure.projected#>>'{dictation,targetEndExclusive}')::integer
          and closure_word.exact_governed_answer = exact_structure.projected#>>'{dictation,exactGovernedAnswer}'
      )
  );
$$;

revoke all on function public.adle_compound_word_release_is_intake_ready_v2(uuid,text,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.adle_compound_word_release_is_intake_ready_v2(uuid,text,text,text,uuid,text)
  to service_role;

alter table public.adle_canonical_intake_candidates
  drop constraint adle_canonical_intake_candidates_release_authority_check,
  add constraint adle_canonical_intake_candidates_release_authority_check check (
    (route_activation_revision_id is null and curriculum_release_manifest_id is null
      and curriculum_release_manifest_sha256 is null and curriculum_dependency_fingerprint is null)
    or
    (route_id = 'base_word_lab' and route_version = 'v2'
      and route_activation_revision_id is not null and curriculum_release_manifest_id is not null
      and curriculum_release_manifest_sha256 ~ '^[a-f0-9]{64}$'
      and curriculum_dependency_fingerprint ~ '^[a-f0-9]{64}$')
    or
    (route_id = 'compound_word_lab' and route_version = 'v2'
      and route_activation_revision_id is null and curriculum_release_manifest_id is not null
      and curriculum_release_manifest_sha256 ~ '^[a-f0-9]{64}$'
      and curriculum_dependency_fingerprint ~ '^[a-f0-9]{64}$')
  );

do $migration$
declare
  v_signature constant text :=
    'public.adle_persist_canonical_intake(uuid,uuid,text,uuid,uuid,text,text,text,date,text,text,uuid,uuid,text,text)';
  v_definition text;
  v_compound_branch text;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null
     or v_definition not like '%v_is_base_word boolean := public.adle_micro_skill_owns_base_word_lab_v2(p_micro_skill_key);%'
     or v_definition like '%v_is_compound_word boolean :=%' then
    raise exception 'canonical-intake persistence RPC differs from the reviewed predecessor';
  end if;

  v_definition := replace(
    v_definition,
    'v_is_base_word boolean := public.adle_micro_skill_owns_base_word_lab_v2(p_micro_skill_key);',
    'v_is_base_word boolean := public.adle_micro_skill_owns_base_word_lab_v2(p_micro_skill_key);' || E'\n  ' ||
    'v_is_compound_word boolean := public.adle_micro_skill_owns_compound_word_lab_v2(p_micro_skill_key);'
  );

  v_compound_branch := $branch$if v_is_compound_word then
    if p_route_id <> 'compound_word_lab' or p_route_version <> 'v2' then
      raise exception 'Compound Word candidate must request compound_word_lab:v2';
    end if;
    if p_route_activation_id is not null or p_release_manifest_id is null
       or p_release_manifest_sha256 !~ '^[a-f0-9]{64}$'
       or p_dependency_fingerprint !~ '^[a-f0-9]{64}$' then
      raise exception 'Compound Word candidate requires exact environment-neutral release authority without activation';
    end if;
    if not public.adle_compound_word_release_is_intake_ready_v2(
      p_release_manifest_id, p_release_manifest_sha256, p_dependency_fingerprint,
      p_micro_skill_key, p_canonical_word_id, p_correct_spelling_normalized
    ) then raise exception 'Compound Word candidate is outside its exact published release authority'; end if;
    select * into v_existing_candidate from public.adle_canonical_intake_candidates
    where source_candidate_mapping_id = p_candidate_mapping_id for update;
    if found and v_existing_candidate.curriculum_release_manifest_id is not null and (
      v_existing_candidate.route_activation_revision_id is not null
      or v_existing_candidate.curriculum_release_manifest_id <> p_release_manifest_id
      or v_existing_candidate.curriculum_release_manifest_sha256 <> p_release_manifest_sha256
      or v_existing_candidate.curriculum_dependency_fingerprint <> p_dependency_fingerprint
    ) then raise exception 'canonical intake candidate already retains different immutable release provenance'; end if;
    v_route_id := 'compound_word_lab'; v_route_version := 'v2';
  elsif v_is_base_word then$branch$;
  if position(E'\n  if v_is_base_word then\n' in v_definition) = 0 then
    raise exception 'canonical-intake route branch anchor is unavailable';
  end if;
  v_definition := replace(v_definition, E'\n  if v_is_base_word then\n', E'\n  ' || v_compound_branch || E'\n');
  v_definition := replace(v_definition,
    'case when v_is_base_word then p_release_manifest_id else null end',
    'case when v_is_base_word or v_is_compound_word then p_release_manifest_id else null end');
  v_definition := replace(v_definition,
    'case when v_is_base_word then p_release_manifest_sha256 else null end',
    'case when v_is_base_word or v_is_compound_word then p_release_manifest_sha256 else null end');
  v_definition := replace(v_definition,
    'case when v_is_base_word then p_dependency_fingerprint else null end',
    'case when v_is_base_word or v_is_compound_word then p_dependency_fingerprint else null end');
  if v_definition not like '%v_is_compound_word boolean := public.adle_micro_skill_owns_compound_word_lab_v2(p_micro_skill_key);%'
     or v_definition not like '%Compound Word candidate must request compound_word_lab:v2%'
     or v_definition not like '%case when v_is_base_word or v_is_compound_word then p_release_manifest_id else null end%' then
    raise exception 'canonical-intake Compound Word patch was not exact';
  end if;
  execute v_definition;
end;
$migration$;

do $verification$
begin
  if not public.adle_micro_skill_owns_compound_word_lab_v2('D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS')
     or not public.adle_micro_skill_owns_compound_word_lab_v2('D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED')
     or public.adle_micro_skill_owns_compound_word_lab_v2('D4_MOR_PREFIXES_UN') then
    raise exception 'canonical Compound Word cluster ownership verification failed';
  end if;
end;
$verification$;

comment on function public.adle_micro_skill_owns_compound_word_lab_v2(text) is
  'Canonical Compound Word cluster-to-route ownership predicate. It grants no assignment activation.';
comment on function public.adle_compound_word_release_is_intake_ready_v2(uuid,text,text,text,uuid,text) is
  'Fail-closed exact immutable Compound Word v2 release/structure/content/closure guard for canonical intake only.';

commit;
