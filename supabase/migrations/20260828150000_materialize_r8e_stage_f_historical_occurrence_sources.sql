-- R8E compatibility: materialise modern governed occurrence sources from the
-- seven exact, immutable Stage-F admin/canonical authority chains identified by
-- the accepted historical audit. This is deliberately not a general intake
-- path and does not alter the released R8B, R8C, or R8D functions.

begin;

create function public.materialize_r8e_stage_f_historical_occurrence_source(
  p_source_misspelling_instance_id uuid,
  p_expected_parent_user_id uuid,
  p_expected_child_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_manifest record;
  v_issue public.writing_issues%rowtype;
  v_misspelling public.misspelling_instances%rowtype;
  v_case public.spelling_catalog_review_cases%rowtype;
  v_decision public.spelling_catalog_review_case_decisions%rowtype;
  v_mapping public.spelling_canonical_mappings%rowtype;
  v_candidate public.parent_verified_spelling_candidate_mappings%rowtype;
  v_verification_id uuid;
  v_candidate_id uuid;
  v_source_submission_id uuid;
  v_source_provenance text;
  v_source_entity_id text;
  v_misspelling_normalized text;
  v_correct_spelling_normalized text;
  v_authority_count integer;
  v_now timestamptz := timezone('utc', now());
begin
  -- Even if an ACL is accidentally widened later, a signed-in parent cannot
  -- turn this operator-only compatibility function into an intake alternative.
  if auth.uid() is not null then
    raise exception 'R8E Stage-F compatibility is service repair only.';
  end if;

  select manifest.*
  into v_manifest
  from (
    values
      (
        'a38d85fc-ea0f-4190-b87c-4a0a24420037'::uuid,
        '10823fc2-ed52-468a-919b-0090cb872816'::uuid,
        'a28d4885-8328-4853-ba11-6c676619b9ea'::uuid,
        'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid,
        'imergrants'::text,
        'immigrants'::text,
        'D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX'::text,
        'a444a17b-8258-4451-833c-6acfdefc2f95'::uuid,
        'a6107f26-4834-43d6-9dd5-19ac8dea8ef6'::uuid,
        '4b869f34-64fb-4390-b0c8-94debf8f0d92'::uuid
      ),
      (
        '852e2923-9622-4668-b659-923c2d018530'::uuid,
        '1b33ccec-eb97-4a37-9d89-513f4b870530'::uuid,
        'a28d4885-8328-4853-ba11-6c676619b9ea'::uuid,
        'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid,
        'goviment'::text,
        'government'::text,
        'D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX'::text,
        'de68beb3-110b-4e08-a3fb-4730558c3f6a'::uuid,
        '2abea965-3709-42fc-9682-57c8666283ca'::uuid,
        '343b55d5-46e9-4006-82e5-8bf927e1f89f'::uuid
      ),
      (
        'a659de3f-ab82-481b-9b2f-2a4fefb1385f'::uuid,
        '32616f9c-2597-4cf7-8d93-81f16d86cf00'::uuid,
        'a28d4885-8328-4853-ba11-6c676619b9ea'::uuid,
        'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid,
        'summery'::text,
        'summary'::text,
        'D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS'::text,
        '56a40a7b-6189-4509-9bfd-ce5a0178dfab'::uuid,
        '9aec2d88-ddc1-4f39-9a7f-2202f95e4ccf'::uuid,
        'c81a3880-0c8e-4798-8b72-c9a4b10322f4'::uuid
      ),
      (
        '76a6e7fc-7460-4f4f-b8b5-7a5e65c77f2d'::uuid,
        '66e76e5c-21d3-4957-8ba7-83cee076a10d'::uuid,
        'a28d4885-8328-4853-ba11-6c676619b9ea'::uuid,
        'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid,
        'browny'::text,
        'brownie'::text,
        'D4_PG_LONG_EE_IE'::text,
        '4e9fdb05-77de-499b-a3a9-87da60b5b063'::uuid,
        '02dffedf-5e48-4c83-9f21-5cea6f348654'::uuid,
        '8db6f7bd-0283-4456-85df-bce62cf59df6'::uuid
      ),
      (
        '3ebb3ecb-ad41-4461-b571-db340373ed9e'::uuid,
        '7f13d192-d03d-461e-8eb7-a1d0cd270ef3'::uuid,
        'a28d4885-8328-4853-ba11-6c676619b9ea'::uuid,
        'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid,
        'ether'::text,
        'either'::text,
        'D4_PG_LONG_EE_EI'::text,
        '143231fd-e793-4fc7-a010-0bb9ed960ce3'::uuid,
        '101ab10b-b564-41a8-90cc-b9dbd79ae434'::uuid,
        '7a6cca4d-3fb9-4b8a-8e46-6a3f84d71199'::uuid
      ),
      (
        '5e6bc904-d0c3-431b-a9aa-004650454e81'::uuid,
        '89a8348a-9c5d-4c55-a0e6-5f057f04d836'::uuid,
        'a28d4885-8328-4853-ba11-6c676619b9ea'::uuid,
        'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid,
        'diebieties'::text,
        'diabetes'::text,
        'D4_MOR_ROOTS_COMMON_GREEK_ROOTS'::text,
        '3626643a-1bcf-485a-bb0d-642cfc2dc34e'::uuid,
        '0277d456-74d2-4298-b5fb-1e5138b07b89'::uuid,
        '5a14271c-df0e-4308-944f-907c656d6643'::uuid
      ),
      (
        '9b306e4f-e3c6-4699-9de0-59c4934b927e'::uuid,
        'b746ed11-eb20-47ee-8d39-cf0676424bb6'::uuid,
        'a28d4885-8328-4853-ba11-6c676619b9ea'::uuid,
        'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid,
        'dierbeties'::text,
        'diabetes'::text,
        'D4_MOR_ROOTS_SCIENCE_MATH_ROOTS'::text,
        '5dc04750-7750-448d-9229-ed36cad19564'::uuid,
        '739eb12f-d825-4c44-9e93-414abce418f5'::uuid,
        '5ccf3db6-3213-49ba-bf24-dfaad5efd02c'::uuid
      )
  ) as manifest(
    occurrence_id,
    writing_issue_id,
    parent_user_id,
    child_id,
    misspelling_normalized,
    correct_spelling_normalized,
    micro_skill_key,
    admin_case_id,
    admin_decision_id,
    canonical_mapping_id
  )
  where manifest.occurrence_id = p_source_misspelling_instance_id;

  if not found then
    raise exception 'Occurrence is not in the exact R8E Stage-F compatibility manifest.';
  end if;

  if p_expected_parent_user_id is distinct from v_manifest.parent_user_id
    or p_expected_child_id is distinct from v_manifest.child_id
  then
    raise exception 'R8E Stage-F learner or governing-parent identity disagrees with the compatibility manifest.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat('r8e-stage-f-occurrence:', p_source_misspelling_instance_id::text),
      0
    )
  );

  select issue.*
  into v_issue
  from public.writing_issues issue
  where issue.id = v_manifest.writing_issue_id
    and issue.parent_user_id = v_manifest.parent_user_id
    and issue.child_id = v_manifest.child_id
    and issue.source_misspelling_instance_id = v_manifest.occurrence_id
  for update;

  if not found then
    raise exception 'The exact Stage-F writing issue authority no longer exists.';
  end if;

  select misspelling.*
  into v_misspelling
  from public.misspelling_instances misspelling
  where misspelling.id = v_manifest.occurrence_id
    and misspelling.parent_user_id = v_manifest.parent_user_id
    and misspelling.child_id = v_manifest.child_id
  for update;

  if not found then
    raise exception 'The exact Stage-F misspelling occurrence authority no longer exists.';
  end if;

  v_misspelling_normalized := lower(btrim(coalesce(
    nullif(v_issue.observed_text, ''),
    v_misspelling.misspelled_word
  )));
  v_correct_spelling_normalized := lower(btrim(coalesce(
    nullif(v_issue.approved_replacement, ''),
    nullif(v_issue.suggested_replacement, '')
  )));

  if v_issue.issue_status <> 'finalised'
    or v_issue.final_classification not in (
      'fragile_knowledge', 'concept_gap', 'transfer_failure'
    )
  then
    raise exception 'The Stage-F occurrence no longer has a final learning decision.';
  end if;

  if v_misspelling_normalized is distinct from v_manifest.misspelling_normalized
    or v_correct_spelling_normalized is distinct from v_manifest.correct_spelling_normalized
    or v_issue.micro_skill_key is distinct from v_manifest.micro_skill_key
  then
    raise exception 'The Stage-F word or micro-skill identity changed from the accepted R8E audit.';
  end if;

  if not exists (
    select 1
    from public.micro_skill_catalog catalog
    where catalog.micro_skill_key = v_issue.micro_skill_key
      and catalog.mastery_domain_key = 'D4'
      and catalog.is_active = true
      and catalog.is_assignable = true
  ) then
    raise exception 'The Stage-F micro-skill is not an active assignable D4 route.';
  end if;

  -- The replay receipt is historical provenance, not a caller assertion. All
  -- three IDs must resolve to the same terminal admin/canonical chain below.
  if coalesce(v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'action', '')
      <> 'attached_verified_route'
    or coalesce(v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'route_source', '')
      <> 'canonical_mapping'
    or coalesce(
      (v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'dry_run_first')::boolean,
      false
    ) is not true
    or coalesce(v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'admin_case_id', '')
      <> v_manifest.admin_case_id::text
    or coalesce(v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'admin_decision_id', '')
      <> v_manifest.admin_decision_id::text
    or coalesce(v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'canonical_mapping_id', '')
      <> v_manifest.canonical_mapping_id::text
    or coalesce(v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'replayed_at', '') = ''
  then
    raise exception 'The immutable Stage-F replay provenance is absent or disagrees with the accepted authority.';
  end if;

  select review_case.*
  into v_case
  from public.spelling_catalog_review_cases review_case
  where review_case.id = v_manifest.admin_case_id
    and review_case.parent_user_id = v_manifest.parent_user_id
    and review_case.child_id = v_manifest.child_id
    and review_case.source_misspelling_instance_id = v_manifest.occurrence_id
    and review_case.misspelling_normalized = v_manifest.misspelling_normalized
    and review_case.correct_spelling_normalized = v_manifest.correct_spelling_normalized
    and review_case.case_status = 'add_canonical_mapping'
  for update;
  if not found then
    raise exception 'The terminal Stage-F admin case no longer agrees with the occurrence.';
  end if;

  select decision.*
  into v_decision
  from public.spelling_catalog_review_case_decisions decision
  where decision.id = v_manifest.admin_decision_id
    and decision.case_id = v_case.id
    and decision.decision_type = 'add_canonical_mapping'
    and decision.previous_status = 'open'
    and decision.new_status = 'add_canonical_mapping'
    and decision.linked_micro_skill_key = v_manifest.micro_skill_key
    and decision.canonical_mapping_id = v_manifest.canonical_mapping_id
  for update;
  if not found then
    raise exception 'The Stage-F admin decision no longer supplies exact canonical authority.';
  end if;

  select mapping.*
  into v_mapping
  from public.spelling_canonical_mappings mapping
  where mapping.id = v_manifest.canonical_mapping_id
    and mapping.source_case_id = v_case.id
    and mapping.source_decision_id = v_decision.id
    and mapping.misspelling_normalized = v_manifest.misspelling_normalized
    and mapping.correct_spelling_normalized = v_manifest.correct_spelling_normalized
    and mapping.micro_skill_key = v_manifest.micro_skill_key
    and mapping.mapping_status = 'active'
    and mapping.resolver_visibility_status = 'visible'
    and exists (
      select 1
      from public.spelling_canonical_mapping_events event
      where event.mapping_id = mapping.id
        and event.event_type = 'resolver_visibility_enabled'
        and event.new_resolver_visibility_status = 'visible'
    )
  for update;
  if not found then
    raise exception 'The Stage-F canonical mapping is not active, visible, and exact.';
  end if;

  select count(*)::integer
  into v_authority_count
  from public.spelling_catalog_review_cases review_case
  join public.spelling_catalog_review_case_decisions decision
    on decision.case_id = review_case.id
  join public.spelling_canonical_mappings mapping
    on mapping.id = decision.canonical_mapping_id
  where review_case.parent_user_id = v_manifest.parent_user_id
    and review_case.child_id = v_manifest.child_id
    and review_case.source_misspelling_instance_id = v_manifest.occurrence_id
    and review_case.case_status = 'add_canonical_mapping'
    and decision.decision_type = 'add_canonical_mapping'
    and decision.new_status = 'add_canonical_mapping'
    and decision.linked_micro_skill_key = v_manifest.micro_skill_key
    and mapping.source_case_id = review_case.id
    and mapping.misspelling_normalized = v_manifest.misspelling_normalized
    and mapping.correct_spelling_normalized = v_manifest.correct_spelling_normalized
    and mapping.micro_skill_key = v_manifest.micro_skill_key
    and mapping.mapping_status = 'active';
  if v_authority_count <> 1 then
    raise exception 'The Stage-F occurrence has ambiguous historical canonical authority.';
  end if;

  if exists (
    select 1
    from public.spelling_canonical_mappings conflict
    where conflict.misspelling_normalized = v_mapping.misspelling_normalized
      and conflict.dialect_code = v_mapping.dialect_code
      and conflict.normalization_version = v_mapping.normalization_version
      and conflict.mapping_status = 'active'
      and conflict.resolver_visibility_status = 'visible'
      and (
        conflict.correct_spelling_normalized <> v_mapping.correct_spelling_normalized
        or conflict.micro_skill_key <> v_mapping.micro_skill_key
      )
  ) then
    raise exception 'The Stage-F occurrence has conflicting governed canonical authority.';
  end if;

  select candidate.*
  into v_candidate
  from public.parent_verified_spelling_candidate_mappings candidate
  where candidate.parent_user_id = v_manifest.parent_user_id
    and candidate.child_id = v_manifest.child_id
    and candidate.source_misspelling_instance_id = v_manifest.occurrence_id
  order by candidate.created_at, candidate.id
  limit 1
  for update;

  if v_candidate.id is not null then
    if v_candidate.candidate_status not in (
        'parent_local_promoted', 'global_canonical_promoted'
      )
      or v_candidate.misspelling_normalized <> v_manifest.misspelling_normalized
      or v_candidate.correct_spelling_normalized <> v_manifest.correct_spelling_normalized
      or v_candidate.micro_skill_key <> v_manifest.micro_skill_key
      or coalesce(v_candidate.metadata ->> 'route_authority', '')
        <> 'historical_stage_f_canonical_reconstruction'
      or coalesce(v_candidate.metadata -> 'r8e_stage_f_reconstruction' ->> 'compatibility_version', '')
        <> '1'
      or coalesce(v_candidate.metadata -> 'r8e_stage_f_reconstruction' ->> 'writing_issue_id', '')
        <> v_manifest.writing_issue_id::text
      or coalesce(v_candidate.metadata -> 'r8e_stage_f_reconstruction' ->> 'admin_case_id', '')
        <> v_manifest.admin_case_id::text
      or coalesce(v_candidate.metadata -> 'r8e_stage_f_reconstruction' ->> 'admin_decision_id', '')
        <> v_manifest.admin_decision_id::text
      or coalesce(v_candidate.metadata -> 'r8e_stage_f_reconstruction' ->> 'canonical_mapping_id', '')
        <> v_manifest.canonical_mapping_id::text
    then
      raise exception 'The occurrence is already represented by a different governed source.';
    end if;

    if exists (
      select 1
      from public.parent_verified_spelling_candidate_mappings duplicate
      where duplicate.parent_user_id = v_manifest.parent_user_id
        and duplicate.child_id = v_manifest.child_id
        and duplicate.source_misspelling_instance_id = v_manifest.occurrence_id
        and duplicate.id <> v_candidate.id
    ) then
      raise exception 'The Stage-F occurrence has more than one governed source row.';
    end if;

    return jsonb_build_object(
      'action', 'reused',
      'candidate_mapping_id', v_candidate.id,
      'parent_verification_id', v_candidate.parent_verification_id,
      'source_misspelling_instance_id', v_manifest.occurrence_id,
      'canonical_mapping_id', v_manifest.canonical_mapping_id,
      'route_authority', 'historical_stage_f_canonical_reconstruction'
    );
  end if;

  select attempt.task_submission_id
  into v_source_submission_id
  from public.writing_issue_correction_attempts attempt
  join public.task_submissions attempt_submission
    on attempt_submission.id = attempt.task_submission_id
  join public.task_submissions issue_submission
    on issue_submission.id = v_issue.task_submission_id
  where attempt.writing_issue_id = v_issue.id
    and attempt.parent_user_id = v_manifest.parent_user_id
    and attempt.child_id = v_manifest.child_id
    and attempt_submission.parent_user_id = v_manifest.parent_user_id
    and attempt_submission.child_id = v_manifest.child_id
    and attempt_submission.task_id = issue_submission.task_id
  order by attempt.created_at desc, attempt.id desc
  limit 1;
  if v_source_submission_id is null then
    raise exception 'The Stage-F occurrence has no exact returned-correction task-thread evidence.';
  end if;

  v_source_provenance := case
    when v_issue.metadata ->> 'source_kind' = 'parent_authored_missed_word'
      or coalesce((v_issue.metadata ->> 'parent_authored_missed_word')::boolean, false)
      then 'lesson_submission_parent_added_missed_word'
    else 'lesson_submission_existing_output'
  end;

  v_source_entity_id := case
    when v_misspelling.position_start is not null
      and v_misspelling.position_end is not null
      and v_misspelling.position_end > v_misspelling.position_start
      then concat_ws(
        '::',
        'authentic_writing',
        v_issue.task_submission_id::text,
        coalesce(v_misspelling.writing_sample_id::text, 'no_sample'),
        concat(v_misspelling.position_start, '-', v_misspelling.position_end),
        v_manifest.misspelling_normalized,
        v_manifest.correct_spelling_normalized
      )
    else concat('spelling_occurrence::', v_manifest.occurrence_id::text)
  end;

  if exists (
    select 1
    from public.parent_verifications verification
    where verification.parent_user_id = v_manifest.parent_user_id
      and verification.child_id = v_manifest.child_id
      and verification.domain_module = 'spelling'
      and verification.source_type = 'authentic_writing'
      and verification.source_entity_id = v_source_entity_id
  ) then
    raise exception 'The Stage-F reconstruction has a conflicting pre-existing parent verification.';
  end if;

  insert into public.parent_verifications (
    child_id,
    parent_user_id,
    domain_module,
    source_type,
    source_entity_id,
    task_submission_id,
    writing_sample_id,
    suggested_micro_skill_key,
    suggestion_payload,
    decision,
    verified_micro_skill_key,
    verification_notes,
    metadata,
    verified_at,
    created_at,
    updated_at
  ) values (
    v_manifest.child_id,
    v_manifest.parent_user_id,
    'spelling',
    'authentic_writing',
    v_source_entity_id,
    v_issue.task_submission_id,
    v_misspelling.writing_sample_id,
    v_manifest.micro_skill_key,
    jsonb_build_object(
      'observed_text', v_manifest.misspelling_normalized,
      'suggested_replacement', v_manifest.correct_spelling_normalized,
      'source_misspelling_instance_id', v_manifest.occurrence_id
    ),
    'overridden',
    v_manifest.micro_skill_key,
    'Governed reconstruction from immutable Stage-F admin/canonical authority.',
    jsonb_build_object(
      'r8e_stage_f_compatibility_version', 1,
      'historical_reconstruction', true,
      'writing_issue_id', v_manifest.writing_issue_id,
      'source_misspelling_instance_id', v_manifest.occurrence_id,
      'admin_case_id', v_manifest.admin_case_id,
      'admin_decision_id', v_manifest.admin_decision_id,
      'canonical_mapping_id', v_manifest.canonical_mapping_id,
      'reconstructed_at', v_now
    ),
    v_now,
    v_now,
    v_now
  ) returning id into v_verification_id;

  insert into public.parent_verified_spelling_candidate_mappings (
    parent_user_id,
    child_id,
    parent_verification_id,
    task_submission_id,
    writing_sample_id,
    source_suggestion_id,
    source_misspelling_instance_id,
    source_provenance,
    reviewed_event_source_entity_id,
    original_child_spelling,
    original_correct_spelling,
    misspelling_normalized,
    correct_spelling_normalized,
    micro_skill_key,
    candidate_status,
    promotion_scope,
    canonical_intake_handoff_state,
    metadata,
    created_at,
    updated_at
  ) values (
    v_manifest.parent_user_id,
    v_manifest.child_id,
    v_verification_id,
    v_source_submission_id,
    v_misspelling.writing_sample_id,
    v_issue.source_suggestion_id,
    v_manifest.occurrence_id,
    v_source_provenance,
    v_source_entity_id,
    v_manifest.misspelling_normalized,
    v_manifest.correct_spelling_normalized,
    v_manifest.misspelling_normalized,
    v_manifest.correct_spelling_normalized,
    v_manifest.micro_skill_key,
    'parent_local_promoted',
    'parent_local',
    'awaiting_r8c_exact_id_handoff',
    jsonb_build_object(
      'r8e_stage_f_compatibility_version', 1,
      'route_authority', 'historical_stage_f_canonical_reconstruction',
      'r8b_handoff_state', 'awaiting_r8c_exact_id_handoff',
      'known_canonical_mapping_id', v_manifest.canonical_mapping_id,
      'final_classification', v_issue.final_classification,
      'r8e_stage_f_reconstruction', jsonb_build_object(
        'compatibility_version', 1,
        'reconstructed_at', v_now,
        'writing_issue_id', v_manifest.writing_issue_id,
        'source_misspelling_instance_id', v_manifest.occurrence_id,
        'admin_case_id', v_manifest.admin_case_id,
        'admin_decision_id', v_manifest.admin_decision_id,
        'canonical_mapping_id', v_manifest.canonical_mapping_id,
        'stage_f_replayed_at',
          v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'replayed_at'
      )
    ),
    v_now,
    v_now
  ) returning id into v_candidate_id;

  return jsonb_build_object(
    'action', 'materialized',
    'candidate_mapping_id', v_candidate_id,
    'parent_verification_id', v_verification_id,
    'source_misspelling_instance_id', v_manifest.occurrence_id,
    'canonical_mapping_id', v_manifest.canonical_mapping_id,
    'route_authority', 'historical_stage_f_canonical_reconstruction'
  );
end;
$$;

revoke all on function public.materialize_r8e_stage_f_historical_occurrence_source(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.materialize_r8e_stage_f_historical_occurrence_source(
  uuid, uuid, uuid
) to service_role;

commit;
