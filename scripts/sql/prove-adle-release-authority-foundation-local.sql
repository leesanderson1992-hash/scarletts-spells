\set ON_ERROR_STOP on
begin;

create temporary table bw2a1_receipt (receipt jsonb not null) on commit drop;

do $proof$
declare
  v_batch_id uuid := gen_random_uuid();
  v_word_id uuid := gen_random_uuid();
  v_dictation_id uuid := gen_random_uuid();
  v_closure_id uuid;
  v_replay_closure_id uuid;
  v_family_id uuid;
  v_content_id uuid;
  v_release_id uuid;
  v_replay_release_id uuid;
  v_enabled_revision_id uuid;
  v_replay_revision_id uuid;
  v_paused_revision_id uuid;
  v_revoked_revision_id uuid;
  v_family_projection jsonb := '{"families":[{"familyKey":"proof-family"}],"schemaVersion":1}'::jsonb;
  v_content_projection jsonb := '{"contentVersion":"proof-content-v1","schemaVersion":1}'::jsonb;
  v_closure_manifest jsonb;
  v_closure_fingerprint text;
  v_release_manifest jsonb;
  v_release_sha256 text;
  v_dependency_fingerprint text;
  v_rejected boolean := false;
begin
  if not exists (
    select 1 from public.micro_skill_catalog
    where micro_skill_key = 'D4_MOR_BASE_WORDS_IDENTIFY_BASE'
      and is_active and is_assignable
  ) then raise exception 'BW-2A-1 proof requires the governed Base Word micro-skill catalog row'; end if;

  if public.adle_canonical_json_sha256_v1(
    '{"schemaVersion":2,"releaseKey":"base-word-release-fixture-v1","route":{"routeId":"base_word_lab","routeVersion":"v2","activationRouteKey":"base_word_family_v1","payloadVersion":1},"approvalRefs":["review:architecture","review:curriculum"],"microSkills":[{"microSkillKey":"D4_MOR_BASE_WORDS_IDENTIFY_BASE","dependencies":[{"authorityType":"family_membership","authorityKey":"base-family-identify-v1","authoritySchemaVersion":1,"semanticFingerprint":"1111111111111111111111111111111111111111111111111111111111111111"},{"authorityType":"teaching_content","authorityKey":"base-content-identify-v1","authoritySchemaVersion":1,"semanticFingerprint":"2222222222222222222222222222222222222222222222222222222222222222"},{"authorityType":"teaching_dictionary_closure","authorityKey":"base-dictionary-closure-v1","authoritySchemaVersion":1,"semanticFingerprint":"5555555555555555555555555555555555555555555555555555555555555555"}]},{"microSkillKey":"D4_MOR_BASE_WORDS_PRESERVE_BASE","dependencies":[{"authorityType":"family_membership","authorityKey":"base-family-preserve-v1","authoritySchemaVersion":1,"semanticFingerprint":"3333333333333333333333333333333333333333333333333333333333333333"},{"authorityType":"teaching_content","authorityKey":"base-content-preserve-v1","authoritySchemaVersion":1,"semanticFingerprint":"4444444444444444444444444444444444444444444444444444444444444444"},{"authorityType":"teaching_dictionary_closure","authorityKey":"base-dictionary-closure-v1","authoritySchemaVersion":1,"semanticFingerprint":"5555555555555555555555555555555555555555555555555555555555555555"}]}]}'::jsonb
  ) <> 'b0923845ef3c08656deeab80cb9db1eca7f73000e8156af7e25da314592650ad' then
    raise exception 'PostgreSQL and TypeScript canonical release hashes disagree';
  end if;

  insert into public.canonical_teaching_dictionary_import_batches (
    id, source_folder_path, source_folder_sha256, validator_version,
    validation_summary, row_counts, readiness_summary, import_mode,
    batch_status, source_metadata, imported_by, imported_at,
    release_id, package_type, package_schema_version, workbook_sha256,
    package_sha256, target_environment, importer_version,
    verification_summary, verified_at
  ) values (
    v_batch_id, 'bw2a1_local_transactional_proof', repeat('a', 64),
    'bw2a1_release_authority_proof_v1', '{"errors":0}',
    '{"words":1,"dictation":1}', '{"proof":true}', 'staging_release',
    'applied', '{"proofTag":"bw2a1_release_authority_local_proof"}',
    'BW-2A-1 local proof', timezone('utc', now()),
    'bw2a1-local-proof-release', 'canonical_word_batch_v1', '1',
    repeat('b', 64), repeat('c', 64), 'staging',
    'bw2a1_local_proof_v1', '{"verified":true}', timezone('utc', now())
  );
  insert into public.canonical_teaching_dictionary_words (
    id, import_batch_id, row_status, source_sheet, source_row_number,
    source_row_hash, source_metadata, word_key, normalised_word, display_word,
    dialect_code, source_category, source_name, source_licence,
    source_use_note, confidence, review_status
  ) values (
    v_word_id, v_batch_id, 'active', 'bw2a1-proof.json', 2, repeat('d', 64),
    '{"proofTag":"bw2a1_release_authority_local_proof"}',
    'bw2a1proofword_en_gb', 'bw2a1proofword', 'bw2a1proofword', 'en-GB',
    'internal_reviewed_seed', 'BW-2A-1 local proof', 'internal',
    'Transaction-scoped architecture proof.', 'high', 'approved_for_first_exposure'
  );
  insert into public.canonical_teaching_dictionary_dictation_sentences (
    id, import_batch_id, canonical_word_id, row_status, source_sheet,
    source_row_number, source_row_hash, source_metadata, dictation_sentence,
    dictation_target_token_index, audio_text, source_category, source_name,
    source_licence, source_use_note, confidence, review_status, reviewed_by,
    reviewed_at
  ) values (
    v_dictation_id, v_batch_id, v_word_id, 'active', 'bw2a1-proof.json', 2,
    repeat('e', 64), '{"proofTag":"bw2a1_release_authority_local_proof"}',
    'Please spell bw2a1proofword.', 2, 'Please spell bw2a1proofword.',
    'internal_reviewed_seed', 'BW-2A-1 local proof', 'internal',
    'Transaction-scoped architecture proof.', 'high',
    'approved_for_first_exposure', 'BW-2A-1 local proof', timezone('utc', now())
  );

  v_closure_manifest := jsonb_build_object(
    'schemaVersion', 1,
    'authorityKey', 'bw2a1-dictionary-closure-local-proof-v1',
    'approvalRefs', jsonb_build_array('review:bw2a1-local-proof'),
    'capabilities', jsonb_build_array('canonical_word_identity_display', 'canonical_dictation'),
    'words', jsonb_build_array(jsonb_build_object(
      'wordKey', 'bw2a1proofword_en_gb',
      'normalisedWord', 'bw2a1proofword',
      'displayWord', 'bw2a1proofword',
      'dialectCode', 'en-GB',
      'dictationSentence', 'Please spell bw2a1proofword.',
      'dictationTargetTokenIndex', 2,
      'audioText', 'Please spell bw2a1proofword.'
    ))
  );
  v_closure_id := public.publish_adle_teaching_dictionary_closure_v1(
    v_closure_manifest, repeat('f', 64),
    jsonb_build_array(jsonb_build_object(
      'wordKey', 'bw2a1proofword_en_gb',
      'canonicalWordId', v_word_id,
      'dictationSentenceId', v_dictation_id
    )),
    'release_ledger', 'BW-2A-1 local proof'
  );
  v_replay_closure_id := public.publish_adle_teaching_dictionary_closure_v1(
    v_closure_manifest, repeat('f', 64),
    jsonb_build_array(jsonb_build_object(
      'wordKey', 'bw2a1proofword_en_gb',
      'canonicalWordId', v_word_id,
      'dictationSentenceId', v_dictation_id
    )),
    'release_ledger', 'BW-2A-1 local proof'
  );
  if v_replay_closure_id <> v_closure_id then raise exception 'closure replay was not idempotent'; end if;
  select semantic_fingerprint into strict v_closure_fingerprint
  from public.adle_curriculum_dependency_authorities where id = v_closure_id;
  if (select display_word from public.adle_teaching_dictionary_closure_words
      where authority_id = v_closure_id and word_key = 'bw2a1proofword_en_gb') <> 'bw2a1proofword'
  then raise exception 'closure did not freeze the reviewed display word'; end if;

  update public.canonical_teaching_dictionary_words
  set display_word = 'mutated-source-value' where id = v_word_id;
  if (select display_word from public.adle_teaching_dictionary_closure_words
      where authority_id = v_closure_id and word_key = 'bw2a1proofword_en_gb') <> 'bw2a1proofword'
  then raise exception 'published closure changed with mutable source row'; end if;
  begin
    perform public.publish_adle_teaching_dictionary_closure_v1(
      jsonb_set(v_closure_manifest, '{authorityKey}', '"bw2a1-dictionary-closure-local-proof-v2"'),
      repeat('1', 64), jsonb_build_array(jsonb_build_object(
        'wordKey', 'bw2a1proofword_en_gb', 'canonicalWordId', v_word_id,
        'dictationSentenceId', v_dictation_id
      )), 'release_ledger', 'BW-2A-1 local proof'
    );
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'new closure accepted a stale semantic projection'; end if;

  insert into public.adle_curriculum_dependency_authorities (
    authority_key, authority_type, schema_version, source_classification,
    manifest_file_sha256, authority_manifest, authority_manifest_sha256,
    semantic_projection, semantic_fingerprint, source_provenance,
    approval_refs, published_by
  ) values
  (
    'bw2a1-family-authority-local-proof-v1', 'family_membership', 1,
    'release_ledger', repeat('2', 64), '{"schemaVersion":1,"authorityKey":"bw2a1-family-authority-local-proof-v1"}',
    public.adle_canonical_json_sha256_v1('{"schemaVersion":1,"authorityKey":"bw2a1-family-authority-local-proof-v1"}'),
    v_family_projection, public.adle_canonical_json_sha256_v1(v_family_projection),
    '{"proofTag":"bw2a1_release_authority_local_proof"}', '["review:bw2a1-local-proof"]',
    'BW-2A-1 local proof'
  ) returning id into v_family_id;
  insert into public.adle_curriculum_dependency_authorities (
    authority_key, authority_type, schema_version, source_classification,
    manifest_file_sha256, authority_manifest, authority_manifest_sha256,
    semantic_projection, semantic_fingerprint, source_provenance,
    approval_refs, published_by
  ) values (
    'bw2a1-content-authority-local-proof-v1', 'teaching_content', 1,
    'release_ledger', repeat('3', 64), '{"schemaVersion":1,"authorityKey":"bw2a1-content-authority-local-proof-v1"}',
    public.adle_canonical_json_sha256_v1('{"schemaVersion":1,"authorityKey":"bw2a1-content-authority-local-proof-v1"}'),
    v_content_projection, public.adle_canonical_json_sha256_v1(v_content_projection),
    '{"proofTag":"bw2a1_release_authority_local_proof"}', '["review:bw2a1-local-proof"]',
    'BW-2A-1 local proof'
  ) returning id into v_content_id;

  v_release_manifest := jsonb_build_object(
    'schemaVersion', 2,
    'releaseKey', 'bw2a1-route-release-local-proof-v1',
    'route', jsonb_build_object(
      'routeId', 'base_word_lab', 'routeVersion', 'v2',
      'activationRouteKey', 'base_word_family_v1', 'payloadVersion', 1
    ),
    'approvalRefs', jsonb_build_array('review:bw2a1-local-proof'),
    'microSkills', jsonb_build_array(jsonb_build_object(
      'microSkillKey', 'D4_MOR_BASE_WORDS_IDENTIFY_BASE',
      'dependencies', jsonb_build_array(
        jsonb_build_object('authorityType', 'family_membership', 'authorityKey', 'bw2a1-family-authority-local-proof-v1', 'authoritySchemaVersion', 1, 'semanticFingerprint', public.adle_canonical_json_sha256_v1(v_family_projection)),
        jsonb_build_object('authorityType', 'teaching_content', 'authorityKey', 'bw2a1-content-authority-local-proof-v1', 'authoritySchemaVersion', 1, 'semanticFingerprint', public.adle_canonical_json_sha256_v1(v_content_projection)),
        jsonb_build_object('authorityType', 'teaching_dictionary_closure', 'authorityKey', 'bw2a1-dictionary-closure-local-proof-v1', 'authoritySchemaVersion', 1, 'semanticFingerprint', v_closure_fingerprint)
      )
    ))
  );
  v_release_id := public.publish_adle_curriculum_release_v2(
    v_release_manifest, repeat('4', 64), 'BW-2A-1 local proof'
  );
  v_replay_release_id := public.publish_adle_curriculum_release_v2(
    v_release_manifest, repeat('4', 64), 'BW-2A-1 local proof'
  );
  if v_replay_release_id <> v_release_id then raise exception 'release replay was not idempotent'; end if;
  select release_manifest_sha256, dependency_fingerprint
  into strict v_release_sha256, v_dependency_fingerprint
  from public.adle_curriculum_release_manifests where id = v_release_id;

  v_enabled_revision_id := public.set_adle_route_activation_revision_v2(
    v_release_sha256, 'D4_MOR_BASE_WORDS_IDENTIFY_BASE', 'local', 'enabled',
    'allow_existing', '{"proof":true}', null,
    'BW-2A-1 local proof', 'initial proof enable'
  );
  v_replay_revision_id := public.set_adle_route_activation_revision_v2(
    v_release_sha256, 'D4_MOR_BASE_WORDS_IDENTIFY_BASE', 'local', 'enabled',
    'allow_existing', '{"proof":true}', v_enabled_revision_id,
    'BW-2A-1 local proof', 'initial proof enable'
  );
  if v_replay_revision_id <> v_enabled_revision_id then raise exception 'activation replay was not idempotent'; end if;
  if not public.adle_route_activation_revision_is_current_v2(
    v_enabled_revision_id, v_release_id, v_release_sha256, v_dependency_fingerprint
  ) then raise exception 'exact enabled activation authority was not accepted'; end if;
  if public.adle_route_activation_revision_is_current_v2(
    v_enabled_revision_id, v_release_id, repeat('0', 64), v_dependency_fingerprint
  ) then raise exception 'mismatched release authority was accepted'; end if;

  v_paused_revision_id := public.set_adle_route_activation_revision_v2(
    v_release_sha256, 'D4_MOR_BASE_WORDS_IDENTIFY_BASE', 'local', 'paused',
    'allow_existing', '{"proof":true}', v_enabled_revision_id,
    'BW-2A-1 local proof', 'normal pause permits existing assignments'
  );
  if public.adle_route_activation_revision_is_current_v2(
    v_enabled_revision_id, v_release_id, v_release_sha256, v_dependency_fingerprint
  ) then raise exception 'superseded activation revision remained valid for new work'; end if;
  if public.adle_incomplete_assignment_runtime_policy_v2(v_enabled_revision_id) <> 'allow_existing'
  then raise exception 'normal pause blocked an already-created assignment'; end if;

  v_rejected := false;
  begin
    perform public.set_adle_route_activation_revision_v2(
      v_release_sha256, 'D4_MOR_BASE_WORDS_IDENTIFY_BASE', 'local', 'enabled',
      'allow_existing', '{"proof":true}', v_enabled_revision_id,
      'BW-2A-1 local proof', 'stale compare and swap'
    );
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'stale activation revision compare-and-swap was accepted'; end if;

  v_revoked_revision_id := public.set_adle_route_activation_revision_v2(
    v_release_sha256, 'D4_MOR_BASE_WORDS_IDENTIFY_BASE', 'local', 'safety_revoked',
    'block_incomplete', '{"proof":true}', v_paused_revision_id,
    'BW-2A-1 local proof', 'safety withdrawal blocks incomplete assignments'
  );
  if public.adle_incomplete_assignment_runtime_policy_v2(v_enabled_revision_id) <> 'block_incomplete'
  then raise exception 'safety revocation did not block an incomplete historical assignment'; end if;

  v_rejected := false;
  begin
    update public.adle_curriculum_release_manifests
    set release_key = 'mutated' where id = v_release_id;
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'immutable release manifest accepted an update'; end if;

  if not public.adle_lesson_route_metadata_is_valid_v2(jsonb_build_object(
    'metadataSchemaVersion', 2,
    'route', jsonb_build_object('routeId', 'base_word_lab', 'routeVersion', 'v2'),
    'recipe', jsonb_build_object('recipeKey', 'base_word_family', 'recipeVersion', 'v1'),
    'payload', jsonb_build_object('kind', 'base_word_family_snapshot_v1', 'version', 1),
    'curriculumRelease', jsonb_build_object(
      'activationRevisionId', v_enabled_revision_id,
      'releaseManifestId', v_release_id,
      'releaseKey', 'bw2a1-route-release-local-proof-v1',
      'releaseManifestSha256', v_release_sha256,
      'dependencyFingerprint', v_dependency_fingerprint
    )
  )) then raise exception 'valid route metadata v2 was rejected'; end if;
  if not public.adle_lesson_route_metadata_is_valid_v1(
    '{"metadataSchemaVersion":1,"route":{"routeId":"generic_composer","routeVersion":"v1"},"recipe":{"recipeKey":"generic_first_exposure","recipeVersion":"v1"},"payload":{"kind":"composed_daily_plan","version":1}}'
  ) then raise exception 'route metadata v1 compatibility was broken'; end if;

  insert into bw2a1_receipt(receipt) values (jsonb_build_object(
    'proofTag', 'bw2a1_release_authority_local_proof',
    'canonicalHashParity', true,
    'semanticClosureFrozen', true,
    'closureReplayIdempotent', true,
    'releaseReplayIdempotent', true,
    'activationReplayIdempotent', true,
    'exactRevisionConsistency', true,
    'normalPausePolicy', 'allow_existing',
    'safetyRevocationPolicy', 'block_incomplete',
    'legacyMetadataV1Accepted', true,
    'releaseMetadataV2Accepted', true,
    'cleanup', 'transaction_rollback'
  ));
end;
$proof$;

select 'BW2A1_RECEIPT:' || receipt::text from bw2a1_receipt;
rollback;
