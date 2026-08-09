-- BW-2A-1: immutable curriculum dependency/release authority and append-only
-- operational activation revisions. This is a dark foundation: existing v1
-- activations and every current route consumer remain unchanged.

begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.adle_canonical_json_text_v1(p_value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_type text := jsonb_typeof(p_value);
  v_result text;
begin
  if v_type = 'object' then
    select '{' || coalesce(string_agg(
      to_jsonb(entry.key)::text || ':' || public.adle_canonical_json_text_v1(entry.value),
      ',' order by entry.key
    ), '') || '}'
      into v_result
      from jsonb_each(p_value) entry;
    return v_result;
  elsif v_type = 'array' then
    select '[' || coalesce(string_agg(
      public.adle_canonical_json_text_v1(entry.value),
      ',' order by entry.ordinality
    ), '') || ']'
      into v_result
      from jsonb_array_elements(p_value) with ordinality entry(value, ordinality);
    return v_result;
  end if;
  return p_value::text;
end;
$$;

create or replace function public.adle_canonical_json_sha256_v1(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      convert_to(public.adle_canonical_json_text_v1(p_value), 'utf8'),
      'sha256'
    ),
    'hex'
  )
$$;

revoke all on function public.adle_canonical_json_text_v1(jsonb) from public, anon, authenticated;
revoke all on function public.adle_canonical_json_sha256_v1(jsonb) from public, anon, authenticated;
grant execute on function public.adle_canonical_json_text_v1(jsonb) to service_role;
grant execute on function public.adle_canonical_json_sha256_v1(jsonb) to service_role;

create table public.adle_curriculum_dependency_authorities (
  id uuid primary key default gen_random_uuid(),
  authority_key text not null,
  authority_type text not null,
  schema_version integer not null,
  source_classification text not null,
  manifest_file_sha256 text not null,
  authority_manifest jsonb not null,
  authority_manifest_sha256 text not null,
  semantic_projection jsonb not null,
  semantic_fingerprint text not null,
  source_provenance jsonb not null,
  approval_refs jsonb not null,
  published_by text not null,
  published_at timestamptz not null default timezone('utc', now()),
  constraint adle_curriculum_dependency_authorities_key_check
    check (btrim(authority_key) <> ''),
  constraint adle_curriculum_dependency_authorities_type_check
    check (authority_type in ('family_membership', 'teaching_content', 'teaching_dictionary_closure')),
  constraint adle_curriculum_dependency_authorities_schema_check
    check (schema_version > 0),
  constraint adle_curriculum_dependency_authorities_source_check
    check (source_classification in ('release_ledger', 'legacy_pre_release_ledger_projection')),
  constraint adle_curriculum_dependency_authorities_hash_check check (
    manifest_file_sha256 ~ '^[a-f0-9]{64}$'
    and authority_manifest_sha256 ~ '^[a-f0-9]{64}$'
    and semantic_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint adle_curriculum_dependency_authorities_json_check check (
    jsonb_typeof(authority_manifest) = 'object'
    and jsonb_typeof(semantic_projection) in ('object', 'array')
    and jsonb_typeof(source_provenance) = 'object'
    and jsonb_typeof(approval_refs) = 'array'
    and jsonb_array_length(approval_refs) > 0
  ),
  constraint adle_curriculum_dependency_authorities_publisher_check
    check (btrim(published_by) <> ''),
  unique (authority_type, authority_key),
  constraint adle_curriculum_dependency_authorities_manifest_hash_check
    check (authority_manifest_sha256 = public.adle_canonical_json_sha256_v1(authority_manifest)),
  constraint adle_curriculum_dependency_authorities_semantic_hash_check
    check (semantic_fingerprint = public.adle_canonical_json_sha256_v1(semantic_projection))
);

create table public.adle_teaching_dictionary_closure_words (
  authority_id uuid not null references public.adle_curriculum_dependency_authorities(id) on delete restrict,
  word_key text not null,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  canonical_word_import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  canonical_word_source_row_hash text not null,
  canonical_word_release_id text,
  canonical_word_package_sha256 text,
  dictation_sentence_id uuid not null references public.canonical_teaching_dictionary_dictation_sentences(id) on delete restrict,
  dictation_import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  dictation_source_row_hash text not null,
  dictation_release_id text,
  dictation_package_sha256 text,
  normalised_word text not null,
  display_word text not null,
  dialect_code text not null,
  dictation_sentence text not null,
  dictation_target_token_index integer not null,
  audio_text text not null,
  semantic_fingerprint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (authority_id, word_key),
  constraint adle_teaching_dictionary_closure_words_values_check check (
    btrim(word_key) <> ''
    and btrim(canonical_word_source_row_hash) <> ''
    and btrim(dictation_source_row_hash) <> ''
    and btrim(normalised_word) <> ''
    and normalised_word = lower(normalised_word)
    and btrim(display_word) <> ''
    and btrim(dialect_code) <> ''
    and btrim(dictation_sentence) <> ''
    and dictation_target_token_index >= 0
    and btrim(audio_text) <> ''
  ),
  constraint adle_teaching_dictionary_closure_words_hash_check
    check (semantic_fingerprint ~ '^[a-f0-9]{64}$')
);

create table public.adle_curriculum_release_manifests (
  id uuid primary key default gen_random_uuid(),
  release_key text not null,
  schema_version integer not null,
  manifest_file_sha256 text not null,
  manifest_payload jsonb not null,
  release_manifest_sha256 text not null,
  dependency_fingerprint text not null,
  route_id text not null,
  route_version text not null,
  activation_route_key text not null,
  payload_version integer not null,
  approval_refs jsonb not null,
  published_by text not null,
  published_at timestamptz not null default timezone('utc', now()),
  constraint adle_curriculum_release_manifests_key_check check (btrim(release_key) <> ''),
  constraint adle_curriculum_release_manifests_schema_check check (schema_version = 2),
  constraint adle_curriculum_release_manifests_hash_check check (
    manifest_file_sha256 ~ '^[a-f0-9]{64}$'
    and release_manifest_sha256 ~ '^[a-f0-9]{64}$'
    and dependency_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint adle_curriculum_release_manifests_route_check check (
    btrim(route_id) <> '' and btrim(route_version) <> ''
    and btrim(activation_route_key) <> '' and payload_version > 0
  ),
  constraint adle_curriculum_release_manifests_json_check check (
    jsonb_typeof(manifest_payload) = 'object'
    and jsonb_typeof(approval_refs) = 'array'
    and jsonb_array_length(approval_refs) > 0
  ),
  constraint adle_curriculum_release_manifests_publisher_check check (btrim(published_by) <> ''),
  constraint adle_curriculum_release_manifests_payload_hash_check
    check (release_manifest_sha256 = public.adle_canonical_json_sha256_v1(manifest_payload)),
  unique (release_key),
  unique (release_manifest_sha256)
);

create table public.adle_curriculum_release_dependencies (
  release_manifest_id uuid not null references public.adle_curriculum_release_manifests(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  authority_type text not null,
  authority_key text not null,
  authority_schema_version integer not null,
  semantic_fingerprint text not null,
  authority_id uuid not null references public.adle_curriculum_dependency_authorities(id) on delete restrict,
  primary key (release_manifest_id, micro_skill_key, authority_type),
  constraint adle_curriculum_release_dependencies_type_check
    check (authority_type in ('family_membership', 'teaching_content', 'teaching_dictionary_closure')),
  constraint adle_curriculum_release_dependencies_key_check check (btrim(authority_key) <> ''),
  constraint adle_curriculum_release_dependencies_schema_check check (authority_schema_version > 0),
  constraint adle_curriculum_release_dependencies_hash_check
    check (semantic_fingerprint ~ '^[a-f0-9]{64}$')
);

create table public.adle_route_activation_revisions (
  id uuid primary key default gen_random_uuid(),
  environment_key text not null,
  release_manifest_id uuid not null references public.adle_curriculum_release_manifests(id) on delete restrict,
  release_manifest_sha256 text not null,
  dependency_fingerprint text not null,
  route_id text not null,
  route_version text not null,
  activation_route_key text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  activation_status text not null,
  incomplete_assignment_policy text not null,
  readiness_report jsonb not null,
  previous_revision_id uuid references public.adle_route_activation_revisions(id) on delete restrict,
  change_reason text not null,
  changed_by text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_route_activation_revisions_environment_check
    check (environment_key in ('local', 'staging', 'production')),
  constraint adle_route_activation_revisions_hash_check check (
    release_manifest_sha256 ~ '^[a-f0-9]{64}$'
    and dependency_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint adle_route_activation_revisions_route_check check (
    btrim(route_id) <> '' and btrim(route_version) <> '' and btrim(activation_route_key) <> ''
  ),
  constraint adle_route_activation_revisions_status_check
    check (activation_status in ('enabled', 'paused', 'safety_revoked')),
  constraint adle_route_activation_revisions_policy_check check (
    (activation_status in ('enabled', 'paused') and incomplete_assignment_policy = 'allow_existing')
    or (activation_status = 'safety_revoked' and incomplete_assignment_policy = 'block_incomplete')
  ),
  constraint adle_route_activation_revisions_report_check
    check (jsonb_typeof(readiness_report) = 'object'),
  constraint adle_route_activation_revisions_actor_check
    check (btrim(change_reason) <> '' and btrim(changed_by) <> ''),
  unique (previous_revision_id)
);

create table public.adle_route_activation_heads (
  environment_key text not null,
  route_id text not null,
  route_version text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  current_revision_id uuid not null references public.adle_route_activation_revisions(id) on delete restrict,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (environment_key, route_id, route_version, micro_skill_key),
  constraint adle_route_activation_heads_environment_check
    check (environment_key in ('local', 'staging', 'production')),
  constraint adle_route_activation_heads_route_check
    check (btrim(route_id) <> '' and btrim(route_version) <> '')
);

create index adle_curriculum_release_dependencies_authority_idx
  on public.adle_curriculum_release_dependencies(authority_id);
create index adle_route_activation_revisions_release_idx
  on public.adle_route_activation_revisions(release_manifest_id, micro_skill_key);
create index adle_route_activation_revisions_status_idx
  on public.adle_route_activation_revisions(environment_key, activation_status, route_id, micro_skill_key);

create or replace function public.prevent_adle_release_authority_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is immutable; publish a new authority, release, or activation revision', tg_table_name;
end;
$$;

create trigger adle_curriculum_dependency_authorities_immutable
before update or delete on public.adle_curriculum_dependency_authorities
for each row execute function public.prevent_adle_release_authority_mutation();
create trigger adle_teaching_dictionary_closure_words_immutable
before update or delete on public.adle_teaching_dictionary_closure_words
for each row execute function public.prevent_adle_release_authority_mutation();
create trigger adle_curriculum_release_manifests_immutable
before update or delete on public.adle_curriculum_release_manifests
for each row execute function public.prevent_adle_release_authority_mutation();
create trigger adle_curriculum_release_dependencies_immutable
before update or delete on public.adle_curriculum_release_dependencies
for each row execute function public.prevent_adle_release_authority_mutation();
create trigger adle_route_activation_revisions_immutable
before update or delete on public.adle_route_activation_revisions
for each row execute function public.prevent_adle_release_authority_mutation();

alter table public.adle_curriculum_dependency_authorities enable row level security;
alter table public.adle_teaching_dictionary_closure_words enable row level security;
alter table public.adle_curriculum_release_manifests enable row level security;
alter table public.adle_curriculum_release_dependencies enable row level security;
alter table public.adle_route_activation_revisions enable row level security;
alter table public.adle_route_activation_heads enable row level security;

revoke all on table public.adle_curriculum_dependency_authorities from public, anon, authenticated, service_role;
revoke all on table public.adle_teaching_dictionary_closure_words from public, anon, authenticated, service_role;
revoke all on table public.adle_curriculum_release_manifests from public, anon, authenticated, service_role;
revoke all on table public.adle_curriculum_release_dependencies from public, anon, authenticated, service_role;
revoke all on table public.adle_route_activation_revisions from public, anon, authenticated, service_role;
revoke all on table public.adle_route_activation_heads from public, anon, authenticated, service_role;
grant select on table public.adle_curriculum_dependency_authorities to service_role;
grant select on table public.adle_teaching_dictionary_closure_words to service_role;
grant select on table public.adle_curriculum_release_manifests to service_role;
grant select on table public.adle_curriculum_release_dependencies to service_role;
grant select on table public.adle_route_activation_revisions to service_role;
grant select on table public.adle_route_activation_heads to service_role;
revoke all on function public.prevent_adle_release_authority_mutation()
  from public, anon, authenticated, service_role;

create or replace function public.publish_adle_teaching_dictionary_closure_v1(
  p_manifest jsonb,
  p_manifest_file_sha256 text,
  p_source_bindings jsonb,
  p_source_classification text,
  p_published_by text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_authority_id uuid;
  v_projection jsonb;
  v_semantic_fingerprint text;
  v_manifest_sha256 text;
  v_word jsonb;
  v_binding jsonb;
  v_word_row public.canonical_teaching_dictionary_words%rowtype;
  v_dictation_row public.canonical_teaching_dictionary_dictation_sentences%rowtype;
  v_word_batch public.canonical_teaching_dictionary_import_batches%rowtype;
  v_dictation_batch public.canonical_teaching_dictionary_import_batches%rowtype;
  v_word_projection jsonb;
  v_legacy_cutoff constant timestamptz := '2026-07-26 00:00:00+00'::timestamptz;
begin
  if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$'
     or p_source_classification not in ('release_ledger', 'legacy_pre_release_ledger_projection')
     or nullif(btrim(p_published_by), '') is null
     or jsonb_typeof(p_manifest) <> 'object'
     or (select count(*) from jsonb_object_keys(p_manifest)) <> 5
     or p_manifest->>'schemaVersion' <> '1'
     or nullif(btrim(p_manifest->>'authorityKey'), '') is null
     or p_manifest->'capabilities' <> '["canonical_word_identity_display","canonical_dictation"]'::jsonb
     or jsonb_typeof(p_manifest->'approvalRefs') <> 'array'
     or jsonb_array_length(p_manifest->'approvalRefs') = 0
     or jsonb_typeof(p_manifest->'words') <> 'array'
     or jsonb_array_length(p_manifest->'words') = 0
     or jsonb_typeof(p_source_bindings) <> 'array'
     or jsonb_array_length(p_source_bindings) <> jsonb_array_length(p_manifest->'words') then
    raise exception 'invalid Teaching Dictionary closure manifest';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_manifest->'words') with ordinality current_word(value, ordinality)
    left join jsonb_array_elements(p_manifest->'words') with ordinality prior_word(value, ordinality)
      on prior_word.ordinality = current_word.ordinality - 1
    where jsonb_typeof(current_word.value) <> 'object'
       or (select count(*) from jsonb_object_keys(current_word.value)) <> 7
       or nullif(btrim(current_word.value->>'wordKey'), '') is null
       or (prior_word.value is not null and prior_word.value->>'wordKey' >= current_word.value->>'wordKey')
  ) then raise exception 'closure words must be uniquely sorted by wordKey'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_manifest->'approvalRefs') with ordinality current_ref(value, ordinality)
    left join jsonb_array_elements(p_manifest->'approvalRefs') with ordinality prior_ref(value, ordinality)
      on prior_ref.ordinality = current_ref.ordinality - 1
    where jsonb_typeof(current_ref.value) <> 'string'
       or nullif(btrim(current_ref.value#>>'{}'), '') is null
       or (prior_ref.value is not null and prior_ref.value#>>'{}' >= current_ref.value#>>'{}')
  ) then raise exception 'closure approval refs must be uniquely sorted'; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_source_bindings) with ordinality current_binding(value, ordinality)
    left join jsonb_array_elements(p_source_bindings) with ordinality prior_binding(value, ordinality)
      on prior_binding.ordinality = current_binding.ordinality - 1
    where jsonb_typeof(current_binding.value) <> 'object'
       or (select count(*) from jsonb_object_keys(current_binding.value)) <> 3
       or nullif(btrim(current_binding.value->>'wordKey'), '') is null
       or nullif(current_binding.value->>'canonicalWordId', '') is null
       or nullif(current_binding.value->>'dictationSentenceId', '') is null
       or (prior_binding.value is not null
           and prior_binding.value->>'wordKey' >= current_binding.value->>'wordKey')
  ) then
    raise exception 'closure source bindings must be exact and uniquely sorted';
  end if;

  v_projection := jsonb_build_object(
    'schemaVersion', 1,
    'capabilities', p_manifest->'capabilities',
    'words', p_manifest->'words'
  );
  v_manifest_sha256 := public.adle_canonical_json_sha256_v1(p_manifest);
  v_semantic_fingerprint := public.adle_canonical_json_sha256_v1(v_projection);

  insert into public.adle_curriculum_dependency_authorities (
    authority_key, authority_type, schema_version, source_classification,
    manifest_file_sha256, authority_manifest, authority_manifest_sha256,
    semantic_projection, semantic_fingerprint, source_provenance, approval_refs,
    published_by
  ) values (
    p_manifest->>'authorityKey', 'teaching_dictionary_closure', 1, p_source_classification,
    p_manifest_file_sha256, p_manifest, v_manifest_sha256,
    v_projection, v_semantic_fingerprint,
    jsonb_build_object(
      'legacyCutoff', v_legacy_cutoff,
      'sourceBindings', p_source_bindings
    ),
    p_manifest->'approvalRefs', p_published_by
  ) on conflict (authority_type, authority_key) do nothing
  returning id into v_authority_id;

  if v_authority_id is null then
    select id into v_authority_id
    from public.adle_curriculum_dependency_authorities
    where authority_type = 'teaching_dictionary_closure'
      and authority_key = p_manifest->>'authorityKey'
      and authority_manifest = p_manifest
      and manifest_file_sha256 = p_manifest_file_sha256
      and semantic_fingerprint = v_semantic_fingerprint
      and source_classification = p_source_classification
      and source_provenance->'sourceBindings' = p_source_bindings;
    if v_authority_id is null then
      raise exception 'Teaching Dictionary closure key already names different immutable authority';
    end if;
    return v_authority_id;
  end if;

  for v_word in select value from jsonb_array_elements(p_manifest->'words') loop
    select value into v_binding
    from jsonb_array_elements(p_source_bindings)
    where value->>'wordKey' = v_word->>'wordKey';
    if v_binding is null
       or nullif(v_binding->>'canonicalWordId', '') is null
       or nullif(v_binding->>'dictationSentenceId', '') is null then
      raise exception 'closure source binding missing for %', v_word->>'wordKey';
    end if;

    select * into v_word_row
    from public.canonical_teaching_dictionary_words
    where id = (v_binding->>'canonicalWordId')::uuid
      and word_key = v_word->>'wordKey'
      and row_status = 'active'
      and review_status = 'approved_for_first_exposure'
    for share;
    if not found then raise exception 'closure canonical word is not active and approved: %', v_word->>'wordKey'; end if;

    select * into v_dictation_row
    from public.canonical_teaching_dictionary_dictation_sentences
    where id = (v_binding->>'dictationSentenceId')::uuid
      and canonical_word_id = v_word_row.id
      and row_status = 'active'
      and review_status = 'approved_for_first_exposure'
    for share;
    if not found then raise exception 'closure dictation is not active and approved: %', v_word->>'wordKey'; end if;

    if v_word_row.normalised_word <> v_word->>'normalisedWord'
       or v_word_row.display_word <> v_word->>'displayWord'
       or v_word_row.dialect_code <> v_word->>'dialectCode'
       or v_dictation_row.dictation_sentence <> v_word->>'dictationSentence'
       or v_dictation_row.dictation_target_token_index <> (v_word->>'dictationTargetTokenIndex')::integer
       or v_dictation_row.audio_text <> v_word->>'audioText' then
      raise exception 'closure semantic projection disagrees with reviewed source rows: %', v_word->>'wordKey';
    end if;

    select * into v_word_batch from public.canonical_teaching_dictionary_import_batches
    where id = v_word_row.import_batch_id for share;
    select * into v_dictation_batch from public.canonical_teaching_dictionary_import_batches
    where id = v_dictation_row.import_batch_id for share;
    if v_word_batch.batch_status <> 'applied' or v_dictation_batch.batch_status <> 'applied' then
      raise exception 'closure source batches must be applied: %', v_word->>'wordKey';
    end if;
    if p_source_classification = 'release_ledger' and (
      v_word_batch.release_id is null or v_word_batch.package_sha256 is null or v_word_batch.verified_at is null
      or v_dictation_batch.release_id is null or v_dictation_batch.package_sha256 is null or v_dictation_batch.verified_at is null
    ) then raise exception 'release-ledger closure requires verified release provenance: %', v_word->>'wordKey'; end if;
    if p_source_classification = 'legacy_pre_release_ledger_projection' and (
      v_word_batch.release_id is not null or v_dictation_batch.release_id is not null
      or v_word_batch.created_at >= v_legacy_cutoff or v_dictation_batch.created_at >= v_legacy_cutoff
    ) then raise exception 'legacy closure is restricted to pre-ledger source batches: %', v_word->>'wordKey'; end if;

    v_word_projection := jsonb_build_object(
      'wordKey', v_word->>'wordKey',
      'normalisedWord', v_word->>'normalisedWord',
      'displayWord', v_word->>'displayWord',
      'dialectCode', v_word->>'dialectCode',
      'dictationSentence', v_word->>'dictationSentence',
      'dictationTargetTokenIndex', (v_word->>'dictationTargetTokenIndex')::integer,
      'audioText', v_word->>'audioText'
    );
    insert into public.adle_teaching_dictionary_closure_words (
      authority_id, word_key, canonical_word_id, canonical_word_import_batch_id,
      canonical_word_source_row_hash, canonical_word_release_id,
      canonical_word_package_sha256, dictation_sentence_id,
      dictation_import_batch_id, dictation_source_row_hash,
      dictation_release_id, dictation_package_sha256, normalised_word,
      display_word, dialect_code, dictation_sentence,
      dictation_target_token_index, audio_text, semantic_fingerprint
    ) values (
      v_authority_id, v_word_row.word_key, v_word_row.id, v_word_row.import_batch_id,
      v_word_row.source_row_hash, v_word_batch.release_id, v_word_batch.package_sha256,
      v_dictation_row.id, v_dictation_row.import_batch_id,
      v_dictation_row.source_row_hash, v_dictation_batch.release_id,
      v_dictation_batch.package_sha256, v_word_row.normalised_word,
      v_word_row.display_word, v_word_row.dialect_code, v_dictation_row.dictation_sentence,
      v_dictation_row.dictation_target_token_index, v_dictation_row.audio_text,
      public.adle_canonical_json_sha256_v1(v_word_projection)
    );
  end loop;

  return v_authority_id;
end;
$$;

revoke all on function public.publish_adle_teaching_dictionary_closure_v1(jsonb,text,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.publish_adle_teaching_dictionary_closure_v1(jsonb,text,jsonb,text,text)
  to service_role;

create or replace function public.publish_adle_curriculum_release_v2(
  p_manifest jsonb,
  p_manifest_file_sha256 text,
  p_published_by text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_release_id uuid;
  v_release_sha256 text;
  v_dependency_fingerprint text;
  v_skill jsonb;
  v_dependency jsonb;
  v_authority_id uuid;
begin
  if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$'
     or nullif(btrim(p_published_by), '') is null
     or jsonb_typeof(p_manifest) <> 'object'
     or (select count(*) from jsonb_object_keys(p_manifest)) <> 5
     or p_manifest->>'schemaVersion' <> '2'
     or nullif(btrim(p_manifest->>'releaseKey'), '') is null
     or jsonb_typeof(p_manifest->'route') <> 'object'
     or (select count(*) from jsonb_object_keys(p_manifest->'route')) <> 4
     or nullif(btrim(p_manifest#>>'{route,routeId}'), '') is null
     or nullif(btrim(p_manifest#>>'{route,routeVersion}'), '') is null
     or nullif(btrim(p_manifest#>>'{route,activationRouteKey}'), '') is null
     or coalesce((p_manifest#>>'{route,payloadVersion}')::integer, 0) <= 0
     or jsonb_typeof(p_manifest->'approvalRefs') <> 'array'
     or jsonb_array_length(p_manifest->'approvalRefs') = 0
     or jsonb_typeof(p_manifest->'microSkills') <> 'array'
     or jsonb_array_length(p_manifest->'microSkills') = 0 then
    raise exception 'invalid ADLE curriculum release manifest';
  end if;
  if p_manifest#>>'{route,routeId}' <> 'base_word_lab'
     or p_manifest#>>'{route,routeVersion}' <> 'v2'
     or p_manifest#>>'{route,activationRouteKey}' <> 'base_word_family_v1'
     or (p_manifest#>>'{route,payloadVersion}')::integer <> 1 then
    raise exception 'route is not yet governed by ADLE release authority v2';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_manifest->'microSkills') with ordinality current_skill(value, ordinality)
    left join jsonb_array_elements(p_manifest->'microSkills') with ordinality prior_skill(value, ordinality)
      on prior_skill.ordinality = current_skill.ordinality - 1
    where jsonb_typeof(current_skill.value) <> 'object'
       or (select count(*) from jsonb_object_keys(current_skill.value)) <> 2
       or nullif(btrim(current_skill.value->>'microSkillKey'), '') is null
       or (prior_skill.value is not null and prior_skill.value->>'microSkillKey' >= current_skill.value->>'microSkillKey')
  ) then raise exception 'release micro-skills must be uniquely sorted'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_manifest->'approvalRefs') with ordinality current_ref(value, ordinality)
    left join jsonb_array_elements(p_manifest->'approvalRefs') with ordinality prior_ref(value, ordinality)
      on prior_ref.ordinality = current_ref.ordinality - 1
    where jsonb_typeof(current_ref.value) <> 'string'
       or nullif(btrim(current_ref.value#>>'{}'), '') is null
       or (prior_ref.value is not null and prior_ref.value#>>'{}' >= current_ref.value#>>'{}')
  ) then raise exception 'release approval refs must be uniquely sorted'; end if;

  for v_skill in select value from jsonb_array_elements(p_manifest->'microSkills') loop
    if jsonb_typeof(v_skill->'dependencies') <> 'array'
       or jsonb_array_length(v_skill->'dependencies') <> 3
       or (select array_agg(value->>'authorityType' order by ordinality)
           from jsonb_array_elements(v_skill->'dependencies') with ordinality) <>
          array['family_membership','teaching_content','teaching_dictionary_closure'] then
      raise exception 'release requires three canonical dependencies for %', v_skill->>'microSkillKey';
    end if;
    if v_skill->>'microSkillKey' not in (
      'D4_MOR_BASE_WORDS_IDENTIFY_BASE',
      'D4_MOR_BASE_WORDS_PRESERVE_BASE'
    ) then raise exception 'micro-skill is not yet governed by ADLE release authority v2'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_skill->'dependencies') dependency
      where jsonb_typeof(dependency.value) <> 'object'
         or (select count(*) from jsonb_object_keys(dependency.value)) <> 4
         or nullif(btrim(dependency.value->>'authorityKey'), '') is null
         or dependency.value->>'authoritySchemaVersion' <> '1'
         or dependency.value->>'semanticFingerprint' !~ '^[a-f0-9]{64}$'
    ) then raise exception 'release dependency projection is malformed for %', v_skill->>'microSkillKey'; end if;
    if not exists (
      select 1 from public.micro_skill_catalog
      where micro_skill_key = v_skill->>'microSkillKey' and is_active and is_assignable
    ) then raise exception 'release micro-skill is not active and assignable: %', v_skill->>'microSkillKey'; end if;
    for v_dependency in select value from jsonb_array_elements(v_skill->'dependencies') loop
      select id into v_authority_id
      from public.adle_curriculum_dependency_authorities
      where authority_type = v_dependency->>'authorityType'
        and authority_key = v_dependency->>'authorityKey'
        and schema_version = (v_dependency->>'authoritySchemaVersion')::integer
        and semantic_fingerprint = v_dependency->>'semanticFingerprint';
      if v_authority_id is null then
        raise exception 'release dependency authority is unavailable or mismatched: %/%',
          v_skill->>'microSkillKey', v_dependency->>'authorityType';
      end if;
    end loop;
  end loop;

  v_release_sha256 := public.adle_canonical_json_sha256_v1(p_manifest);
  v_dependency_fingerprint := public.adle_canonical_json_sha256_v1(p_manifest->'microSkills');
  insert into public.adle_curriculum_release_manifests (
    release_key, schema_version, manifest_file_sha256, manifest_payload,
    release_manifest_sha256, dependency_fingerprint, route_id, route_version,
    activation_route_key, payload_version, approval_refs, published_by
  ) values (
    p_manifest->>'releaseKey', 2, p_manifest_file_sha256, p_manifest,
    v_release_sha256, v_dependency_fingerprint, p_manifest#>>'{route,routeId}',
    p_manifest#>>'{route,routeVersion}', p_manifest#>>'{route,activationRouteKey}',
    (p_manifest#>>'{route,payloadVersion}')::integer, p_manifest->'approvalRefs', p_published_by
  ) on conflict (release_key) do nothing returning id into v_release_id;
  if v_release_id is null then
    select id into v_release_id from public.adle_curriculum_release_manifests
    where release_key = p_manifest->>'releaseKey'
      and manifest_payload = p_manifest
      and manifest_file_sha256 = p_manifest_file_sha256
      and release_manifest_sha256 = v_release_sha256
      and dependency_fingerprint = v_dependency_fingerprint;
    if v_release_id is null then raise exception 'release key already names a different immutable manifest'; end if;
    return v_release_id;
  end if;

  for v_skill in select value from jsonb_array_elements(p_manifest->'microSkills') loop
    for v_dependency in select value from jsonb_array_elements(v_skill->'dependencies') loop
      select id into strict v_authority_id
      from public.adle_curriculum_dependency_authorities
      where authority_type = v_dependency->>'authorityType'
        and authority_key = v_dependency->>'authorityKey'
        and schema_version = (v_dependency->>'authoritySchemaVersion')::integer
        and semantic_fingerprint = v_dependency->>'semanticFingerprint';
      insert into public.adle_curriculum_release_dependencies (
        release_manifest_id, micro_skill_key, authority_type, authority_key,
        authority_schema_version, semantic_fingerprint, authority_id
      ) values (
        v_release_id, v_skill->>'microSkillKey', v_dependency->>'authorityType',
        v_dependency->>'authorityKey', (v_dependency->>'authoritySchemaVersion')::integer,
        v_dependency->>'semanticFingerprint', v_authority_id
      );
    end loop;
  end loop;
  return v_release_id;
end;
$$;

revoke all on function public.publish_adle_curriculum_release_v2(jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.publish_adle_curriculum_release_v2(jsonb,text,text)
  to service_role;

create or replace function public.set_adle_route_activation_revision_v2(
  p_release_manifest_sha256 text,
  p_micro_skill_key text,
  p_environment_key text,
  p_activation_status text,
  p_incomplete_assignment_policy text,
  p_readiness_report jsonb,
  p_expected_current_revision_id uuid,
  p_changed_by text,
  p_change_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release public.adle_curriculum_release_manifests%rowtype;
  v_current_revision_id uuid;
  v_current public.adle_route_activation_revisions%rowtype;
  v_revision_id uuid;
begin
  if p_environment_key not in ('local', 'staging', 'production')
     or p_activation_status not in ('enabled', 'paused', 'safety_revoked')
     or (p_activation_status in ('enabled', 'paused') and p_incomplete_assignment_policy <> 'allow_existing')
     or (p_activation_status = 'safety_revoked' and p_incomplete_assignment_policy <> 'block_incomplete')
     or jsonb_typeof(p_readiness_report) <> 'object'
     or (p_activation_status = 'enabled' and p_readiness_report = '{}'::jsonb)
     or nullif(btrim(p_changed_by), '') is null
     or nullif(btrim(p_change_reason), '') is null then
    raise exception 'invalid ADLE activation revision';
  end if;
  select * into v_release from public.adle_curriculum_release_manifests
  where release_manifest_sha256 = p_release_manifest_sha256;
  if not found then raise exception 'ADLE curriculum release is unavailable'; end if;
  if not exists (
    select 1 from public.adle_curriculum_release_dependencies
    where release_manifest_id = v_release.id and micro_skill_key = p_micro_skill_key
    group by release_manifest_id, micro_skill_key having count(*) = 3
  ) then raise exception 'ADLE curriculum release does not bind the requested micro-skill'; end if;
  if exists (
    select 1 from public.adle_curriculum_release_dependencies dependency
    left join public.adle_curriculum_dependency_authorities authority
      on authority.id = dependency.authority_id
     and authority.authority_type = dependency.authority_type
     and authority.authority_key = dependency.authority_key
     and authority.schema_version = dependency.authority_schema_version
     and authority.semantic_fingerprint = dependency.semantic_fingerprint
    where dependency.release_manifest_id = v_release.id
      and dependency.micro_skill_key = p_micro_skill_key
      and authority.id is null
  ) then raise exception 'ADLE curriculum release dependency authority is unavailable or mismatched'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_environment_key || ':' || v_release.route_id || ':' || v_release.route_version || ':' || p_micro_skill_key,
    0
  ));
  select current_revision_id into v_current_revision_id
  from public.adle_route_activation_heads
  where environment_key = p_environment_key
    and route_id = v_release.route_id
    and route_version = v_release.route_version
    and micro_skill_key = p_micro_skill_key
  for update;
  if v_current_revision_id is distinct from p_expected_current_revision_id then
    raise exception 'ADLE activation revision compare-and-swap failed';
  end if;
  if v_current_revision_id is not null then
    select * into strict v_current from public.adle_route_activation_revisions
    where id = v_current_revision_id;
    if v_current.release_manifest_id = v_release.id
       and v_current.activation_status = p_activation_status
       and v_current.incomplete_assignment_policy = p_incomplete_assignment_policy
       and v_current.readiness_report = p_readiness_report then
      return v_current.id;
    end if;
  end if;

  insert into public.adle_route_activation_revisions (
    environment_key, release_manifest_id, release_manifest_sha256,
    dependency_fingerprint, route_id, route_version, activation_route_key,
    micro_skill_key, activation_status, incomplete_assignment_policy,
    readiness_report, previous_revision_id, change_reason, changed_by
  ) values (
    p_environment_key, v_release.id, v_release.release_manifest_sha256,
    v_release.dependency_fingerprint, v_release.route_id, v_release.route_version,
    v_release.activation_route_key, p_micro_skill_key, p_activation_status,
    p_incomplete_assignment_policy, p_readiness_report, v_current_revision_id,
    p_change_reason, p_changed_by
  ) returning id into v_revision_id;
  insert into public.adle_route_activation_heads (
    environment_key, route_id, route_version, micro_skill_key,
    current_revision_id, updated_at
  ) values (
    p_environment_key, v_release.route_id, v_release.route_version,
    p_micro_skill_key, v_revision_id, timezone('utc', now())
  ) on conflict (environment_key, route_id, route_version, micro_skill_key)
  do update set current_revision_id = excluded.current_revision_id,
                updated_at = excluded.updated_at;
  return v_revision_id;
end;
$$;

revoke all on function public.set_adle_route_activation_revision_v2(text,text,text,text,text,jsonb,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.set_adle_route_activation_revision_v2(text,text,text,text,text,jsonb,uuid,text,text)
  to service_role;

create or replace function public.adle_route_activation_revision_is_current_v2(
  p_activation_revision_id uuid,
  p_release_manifest_id uuid,
  p_release_manifest_sha256 text,
  p_dependency_fingerprint text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.adle_route_activation_revisions revision
    join public.adle_route_activation_heads head
      on head.current_revision_id = revision.id
    join public.adle_curriculum_release_manifests release
      on release.id = revision.release_manifest_id
    where revision.id = p_activation_revision_id
      and revision.release_manifest_id = p_release_manifest_id
      and revision.release_manifest_sha256 = p_release_manifest_sha256
      and revision.dependency_fingerprint = p_dependency_fingerprint
      and revision.activation_status = 'enabled'
      and release.release_manifest_sha256 = revision.release_manifest_sha256
      and release.dependency_fingerprint = revision.dependency_fingerprint
      and not exists (
        select 1
        from public.adle_curriculum_release_dependencies dependency
        left join public.adle_curriculum_dependency_authorities authority
          on authority.id = dependency.authority_id
         and authority.authority_type = dependency.authority_type
         and authority.authority_key = dependency.authority_key
         and authority.schema_version = dependency.authority_schema_version
         and authority.semantic_fingerprint = dependency.semantic_fingerprint
        where dependency.release_manifest_id = release.id
          and dependency.micro_skill_key = revision.micro_skill_key
          and authority.id is null
      )
  )
$$;

revoke all on function public.adle_route_activation_revision_is_current_v2(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.adle_route_activation_revision_is_current_v2(uuid,uuid,text,text)
  to service_role;

create or replace function public.adle_incomplete_assignment_runtime_policy_v2(
  p_activation_revision_id uuid
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when current_revision.activation_status = 'safety_revoked'
      then 'block_incomplete'
    else 'allow_existing'
  end
  from public.adle_route_activation_revisions original_revision
  join public.adle_route_activation_heads head
    on head.environment_key = original_revision.environment_key
   and head.route_id = original_revision.route_id
   and head.route_version = original_revision.route_version
   and head.micro_skill_key = original_revision.micro_skill_key
  join public.adle_route_activation_revisions current_revision
    on current_revision.id = head.current_revision_id
  where original_revision.id = p_activation_revision_id
$$;

revoke all on function public.adle_incomplete_assignment_runtime_policy_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.adle_incomplete_assignment_runtime_policy_v2(uuid)
  to service_role;

commit;
