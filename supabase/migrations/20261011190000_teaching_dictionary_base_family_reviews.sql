-- Reviewed overlays for Base Word Lab. Suggestions are calculated at read time;
-- these rows exist only after an admin accepts an exact relationship.
begin;

create table public.teaching_dictionary_base_family_definitions (
  id uuid primary key default gen_random_uuid(),
  family_key text not null unique check (btrim(family_key) <> ''),
  base_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  base_meaning text not null check (btrim(base_meaning) <> ''),
  etymology_route jsonb not null check (jsonb_typeof(etymology_route) = 'object'),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  unique (base_word_id, base_meaning)
);

create table public.teaching_dictionary_base_family_member_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  definition_id uuid references public.teaching_dictionary_base_family_definitions(id),
  legacy_family_id uuid references public.canonical_teaching_dictionary_base_word_families(id),
  base_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  environment_key text not null check (environment_key in ('local','staging','production')),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  word_skill_release_id uuid not null references public.adle_reviewed_word_skill_releases(id),
  word_sum text not null check (btrim(word_sum) <> ''),
  morphology_parts jsonb not null check (jsonb_typeof(morphology_parts) = 'array' and jsonb_array_length(morphology_parts) > 0),
  morphology_joins jsonb not null check (jsonb_typeof(morphology_joins) = 'array'),
  morphology_transformations jsonb not null default '[]'::jsonb check (jsonb_typeof(morphology_transformations) = 'array'),
  transformation_notes text not null default '',
  child_friendly_meaning text not null check (btrim(child_friendly_meaning) <> ''),
  source_morphology_id uuid references public.canonical_teaching_dictionary_word_morphology(id),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  review_note text not null check (btrim(review_note) <> ''),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  check ((definition_id is null) <> (legacy_family_id is null))
);
create index teaching_base_family_reviews_lookup_idx on public.teaching_dictionary_base_family_member_reviews
  (base_word_id, micro_skill_key, canonical_word_id, reviewed_at desc);
create index teaching_base_family_reviews_definition_idx on public.teaching_dictionary_base_family_member_reviews
  (definition_id, micro_skill_key, reviewed_at desc) where definition_id is not null;
create index teaching_base_family_reviews_legacy_idx on public.teaching_dictionary_base_family_member_reviews
  (legacy_family_id, micro_skill_key, reviewed_at desc) where legacy_family_id is not null;

create table public.teaching_dictionary_base_family_member_withdrawals (
  review_id uuid primary key references public.teaching_dictionary_base_family_member_reviews(id),
  reason text not null check (btrim(reason) <> ''),
  withdrawn_by uuid not null references auth.users(id),
  withdrawn_at timestamptz not null default now()
);

create trigger teaching_base_family_definitions_immutable before update on public.teaching_dictionary_base_family_definitions
  for each row execute function public.reject_writing_fact_update();
create trigger teaching_base_family_reviews_immutable before update on public.teaching_dictionary_base_family_member_reviews
  for each row execute function public.reject_writing_fact_update();
create trigger teaching_base_family_withdrawals_immutable before update on public.teaching_dictionary_base_family_member_withdrawals
  for each row execute function public.reject_writing_fact_update();

alter table public.teaching_dictionary_base_family_definitions enable row level security;
alter table public.teaching_dictionary_base_family_member_reviews enable row level security;
alter table public.teaching_dictionary_base_family_member_withdrawals enable row level security;
revoke all on public.teaching_dictionary_base_family_definitions,
  public.teaching_dictionary_base_family_member_reviews,
  public.teaching_dictionary_base_family_member_withdrawals from anon, authenticated;
grant select on public.teaching_dictionary_base_family_definitions,
  public.teaching_dictionary_base_family_member_reviews,
  public.teaching_dictionary_base_family_member_withdrawals to service_role;

-- Exact source text is reviewed even for a manual link. The morphology part
-- sequence must reconstruct the displayed word and identify the selected base.
create function public.review_teaching_dictionary_base_family_member(
  p_request_id uuid, p_base_word_id uuid, p_word_id uuid, p_legacy_family_id uuid,
  p_base_meaning text, p_environment text, p_skill_key text, p_word_sum text, p_parts jsonb,
  p_joins jsonb, p_transformations jsonb, p_child_meaning text,
  p_morphology_id uuid, p_word_skill_release_id uuid, p_review_note text, p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_base public.canonical_teaching_dictionary_words%rowtype;
  v_word public.canonical_teaching_dictionary_words%rowtype;
  v_legacy public.canonical_teaching_dictionary_base_word_families%rowtype;
  v_definition public.teaching_dictionary_base_family_definitions%rowtype;
  v_morph public.canonical_teaching_dictionary_word_morphology%rowtype;
  v_id uuid;
  v_key text;
  v_parts text;
  v_hash text;
begin
  select id into v_id from public.teaching_dictionary_base_family_member_reviews where request_id=p_request_id;
  if v_id is not null then return v_id; end if;
  if p_request_id is null or p_actor is null or p_word_skill_release_id is null
    or p_environment not in ('local','staging','production')
    or btrim(coalesce(p_base_meaning,''))='' or btrim(coalesce(p_word_sum,''))=''
    or btrim(coalesce(p_child_meaning,''))='' or btrim(coalesce(p_review_note,''))=''
    or jsonb_typeof(p_parts) is distinct from 'array' or jsonb_array_length(p_parts)=0
    or jsonb_typeof(p_joins) is distinct from 'array'
    or jsonb_typeof(p_transformations) is distinct from 'array'
    then raise exception 'BASE_FAMILY_REVIEW_INCOMPLETE'; end if;
  select * into v_base from public.canonical_teaching_dictionary_words where id=p_base_word_id
    and row_status='active' and review_status='approved_for_first_exposure' for share;
  select * into v_word from public.canonical_teaching_dictionary_words where id=p_word_id
    and row_status='active' and review_status='approved_for_first_exposure' for share;
  if v_base.id is null or v_word.id is null or v_base.dialect_code<>v_word.dialect_code
    then raise exception 'BASE_FAMILY_WORD_INVALID'; end if;
  if not exists (select 1 from public.micro_skill_catalog where micro_skill_key=p_skill_key
    and skill_cluster_key='D4_MOR_BASE_WORDS' and is_active and is_assignable)
    then raise exception 'BASE_FAMILY_SKILL_INVALID'; end if;
  if not exists (select 1 from public.adle_reviewed_word_skill_pairs pair
    join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
    where pair.release_id=p_word_skill_release_id and pair.canonical_word_id=p_word_id
      and pair.micro_skill_key=p_skill_key and pair.relationship_role='demonstrates'
      and release.environment_key=p_environment
      and not exists (select 1 from public.adle_reviewed_word_skill_withdrawals withdrawal
        where withdrawal.release_id=release.id))
    then raise exception 'BASE_FAMILY_EXACT_SKILL_APPROVAL_MISSING'; end if;
  select string_agg(part.value->>'surfaceText','' order by part.ordinality) into v_parts
    from jsonb_array_elements(p_parts) with ordinality part(value,ordinality);
  if v_parts is distinct from v_word.display_word
    or not exists (select 1 from jsonb_array_elements(p_parts) part
      where part->>'kind'='base' and lower(part->>'sourceText')=v_base.normalised_word)
    then raise exception 'BASE_FAMILY_MORPHOLOGY_INVALID'; end if;
  if p_morphology_id is not null then
    select * into v_morph from public.canonical_teaching_dictionary_word_morphology
      where id=p_morphology_id and canonical_word_id=p_word_id and row_status='active'
        and review_status='approved_for_first_exposure' and analysis_status='approved' for share;
    if v_morph.id is null or v_morph.morphology_parts<>p_parts or v_morph.morphology_joins<>p_joins
      or v_morph.word_sum<>p_word_sum then raise exception 'BASE_FAMILY_MORPHOLOGY_SOURCE_DRIFT'; end if;
  end if;
  if p_legacy_family_id is not null then
    select * into v_legacy from public.canonical_teaching_dictionary_base_word_families
      where id=p_legacy_family_id and base_word_id=p_base_word_id and row_status='active'
        and review_status='approved_for_first_exposure' for share;
    if v_legacy.id is null or v_legacy.base_meaning<>p_base_meaning
      then raise exception 'BASE_FAMILY_LEGACY_IDENTITY_INVALID'; end if;
  else
    if exists (select 1 from public.canonical_teaching_dictionary_base_word_families
      where base_word_id=p_base_word_id and base_meaning=p_base_meaning
        and row_status='active' and review_status='approved_for_first_exposure')
      then raise exception 'BASE_FAMILY_EXISTING_FAMILY_USE_REQUIRED'; end if;
    perform pg_advisory_xact_lock(hashtextextended('teaching-base-family:'||p_base_word_id::text||':'||p_base_meaning,0));
    select * into v_definition from public.teaching_dictionary_base_family_definitions
      where base_word_id=p_base_word_id and base_meaning=p_base_meaning for share;
    if v_definition.id is null then
      v_id:=gen_random_uuid();
      v_key:=regexp_replace(v_base.normalised_word,'[^[:alnum:]]+','_','g')||'_family';
      if exists (select 1 from public.teaching_dictionary_base_family_definitions where family_key=v_key)
        or exists (select 1 from public.canonical_teaching_dictionary_base_word_families where base_family_key=v_key)
        then v_key:=v_key||'_'||left(replace(v_id::text,'-',''),8); end if;
      v_hash:=public.adle_canonical_json_sha256_v1(jsonb_build_object('key',v_key,'baseWordId',p_base_word_id,
        'baseMeaning',p_base_meaning,'reviewNote',p_review_note));
      insert into public.teaching_dictionary_base_family_definitions
        (id,family_key,base_word_id,base_meaning,etymology_route,source_fingerprint,reviewed_by)
      values (v_id,v_key,p_base_word_id,p_base_meaning,
        jsonb_build_object('relation_type','visible_free_base','child_facing_meaning',p_base_meaning,
          'semantic_connection',p_review_note,'evidence',jsonb_build_object('source_name','Teaching Dictionary Manager review')),
        v_hash,p_actor) returning * into v_definition;
    end if;
  end if;
  v_hash:=public.adle_canonical_json_sha256_v1(jsonb_build_object(
    'familyId',coalesce(v_legacy.id,v_definition.id),'wordId',p_word_id,'skill',p_skill_key,
    'environment',p_environment,
    'wordSum',p_word_sum,'parts',p_parts,'joins',p_joins,'transformations',p_transformations,
    'meaning',p_child_meaning,'morphologyId',p_morphology_id,'skillReleaseId',p_word_skill_release_id));
  select id into v_id from public.teaching_dictionary_base_family_member_reviews existing
    where coalesce(existing.definition_id,existing.legacy_family_id)=coalesce(v_definition.id,v_legacy.id)
      and existing.canonical_word_id=p_word_id and existing.micro_skill_key=p_skill_key
      and existing.environment_key=p_environment and existing.source_fingerprint=v_hash
      and not exists (select 1 from public.teaching_dictionary_base_family_member_withdrawals withdrawal
        where withdrawal.review_id=existing.id)
      and not exists (select 1 from public.teaching_dictionary_base_family_member_reviews newer
        where coalesce(newer.definition_id,newer.legacy_family_id)=coalesce(existing.definition_id,existing.legacy_family_id)
          and newer.canonical_word_id=existing.canonical_word_id
          and newer.micro_skill_key=existing.micro_skill_key
          and newer.environment_key=existing.environment_key
          and (newer.reviewed_at,newer.id)>(existing.reviewed_at,existing.id))
    order by existing.reviewed_at desc,existing.id desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.teaching_dictionary_base_family_member_reviews
    (request_id,definition_id,legacy_family_id,base_word_id,canonical_word_id,environment_key,micro_skill_key,
      word_skill_release_id,word_sum,morphology_parts,morphology_joins,morphology_transformations,
      child_friendly_meaning,source_morphology_id,source_fingerprint,review_note,reviewed_by)
  values (p_request_id,v_definition.id,v_legacy.id,p_base_word_id,p_word_id,p_environment,p_skill_key,
    p_word_skill_release_id,p_word_sum,p_parts,p_joins,p_transformations,
    p_child_meaning,p_morphology_id,v_hash,p_review_note,p_actor)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.review_teaching_dictionary_base_family_member(
  uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_base_family_member(
  uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,uuid,text,uuid
) to service_role;

create function public.withdraw_teaching_dictionary_base_family_member(
  p_review_id uuid, p_reason text, p_actor uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_actor is null or btrim(coalesce(p_reason,''))='' or not exists (
    select 1 from public.teaching_dictionary_base_family_member_reviews where id=p_review_id)
    then raise exception 'BASE_FAMILY_WITHDRAWAL_INVALID'; end if;
  insert into public.teaching_dictionary_base_family_member_withdrawals(review_id,reason,withdrawn_by)
    values(p_review_id,p_reason,p_actor) on conflict do nothing;
end $$;
revoke all on function public.withdraw_teaching_dictionary_base_family_member(uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.withdraw_teaching_dictionary_base_family_member(uuid,text,uuid)
  to service_role;

create index canonical_word_morphology_parts_gin on public.canonical_teaching_dictionary_word_morphology
  using gin (morphology_parts jsonb_path_ops) where row_status='active' and analysis_status='approved';

-- A new authority is an additive, immutable child of a previously published
-- v2 authority. Historical members are checked against that frozen parent;
-- reviewed manager members are checked against exact append-only review rows.
create function public.publish_teaching_dictionary_base_family_authority_v2(
  p_parent_authority_id uuid, p_manifest jsonb, p_manifest_file_sha256 text, p_published_by text
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_parent public.adle_curriculum_dependency_authorities%rowtype;
  v_family jsonb;
  v_member jsonb;
  v_parent_family jsonb;
  v_parent_member jsonb;
  v_definition public.teaching_dictionary_base_family_definitions%rowtype;
  v_legacy public.canonical_teaching_dictionary_base_word_families%rowtype;
  v_review public.teaching_dictionary_base_family_member_reviews%rowtype;
  v_skill text;
  v_environment text;
  v_family_ids text[]:=array[]::text[];
  v_family_keys text[]:=array[]::text[];
  v_word_ids text[];
  v_projection jsonb;
  v_semantic_fingerprint text;
  v_manifest_sha256 text;
  v_authority_id uuid;
begin
  select * into v_parent from public.adle_curriculum_dependency_authorities
    where id=p_parent_authority_id and authority_type='family_membership' and schema_version=2 for share;
  if v_parent.id is null or v_parent.semantic_projection->>'schemaVersion'<>'2'
    or p_manifest_file_sha256 !~ '^[a-f0-9]{64}$'
    or nullif(btrim(p_published_by),'') is null
    or p_manifest->>'schemaVersion'<>'2' or p_manifest->>'skillClusterKey'<>'D4_MOR_BASE_WORDS'
    or nullif(btrim(p_manifest->>'authorityKey'),'') is null
    or jsonb_typeof(p_manifest->'sourceAuthorities')<>'array'
    or jsonb_typeof(p_manifest->'approvalRefs')<>'array'
    or jsonb_array_length(p_manifest->'approvalRefs')=0
    or jsonb_typeof(p_manifest->'families')<>'array'
    or jsonb_array_length(p_manifest->'families')<2
    then raise exception 'BASE_FAMILY_AUTHORITY_MANIFEST_INVALID'; end if;
  if not p_manifest->'sourceAuthorities' @> v_parent.semantic_projection->'sourceAuthorities'
    then raise exception 'BASE_FAMILY_AUTHORITY_PARENT_SOURCES_MISSING'; end if;
  select review.environment_key into v_environment
    from jsonb_array_elements(p_manifest->'families') family
    cross join lateral jsonb_array_elements(family->'members') member
    join public.teaching_dictionary_base_family_member_reviews review
      on review.id=(case when member#>>'{morphologySource,sourceKind}'='approved_manager_review'
        then member#>>'{morphologySource,sourceId}' else null end)::uuid
    where member#>>'{morphologySource,sourceKind}'='approved_manager_review'
    limit 1;
  for v_family in select value from jsonb_array_elements(p_manifest->'families') loop
    if v_family->>'familyId'=any(v_family_ids) or v_family->>'baseFamilyKey'=any(v_family_keys)
      then raise exception 'BASE_FAMILY_AUTHORITY_DUPLICATE_FAMILY'; end if;
    v_family_ids:=array_append(v_family_ids,v_family->>'familyId');
    v_family_keys:=array_append(v_family_keys,v_family->>'baseFamilyKey');
    select family into v_parent_family from jsonb_array_elements(v_parent.semantic_projection->'families') family
      where family->>'familyId'=v_family->>'familyId';
    if v_parent_family is null then
      select * into v_definition from public.teaching_dictionary_base_family_definitions
        where id=(v_family->>'familyId')::uuid for share;
      if v_definition.id is not null then
        if v_family->>'baseFamilyKey'<>v_definition.family_key
          or v_family->>'baseWordId'<>v_definition.base_word_id::text
          or v_family->>'baseMeaning'<>v_definition.base_meaning
          or v_family->'etymologyRoute'<>v_definition.etymology_route
          or v_family->>'sourceFingerprint'<>v_definition.source_fingerprint
          or not exists (select 1 from jsonb_array_elements(p_manifest->'sourceAuthorities') source
            where source->>'authorityKey'='manager-family:'||v_definition.id::text
              and source->>'sourceKind'='approved_repository_artifact'
              and source->>'sourceId'='manager-family:'||v_definition.id::text
              and source->>'sourceFingerprint'=v_definition.source_fingerprint)
          then raise exception 'BASE_FAMILY_AUTHORITY_DEFINITION_DRIFT'; end if;
      else
        select * into v_legacy from public.canonical_teaching_dictionary_base_word_families
          where id=(v_family->>'familyId')::uuid and row_status='active'
            and review_status='approved_for_first_exposure' for share;
        if v_legacy.id is null or v_family->>'baseFamilyKey'<>v_legacy.base_family_key
          or v_family->>'baseWordId'<>v_legacy.base_word_id::text
          or v_family->>'baseMeaning'<>v_legacy.base_meaning
          or v_family->'etymologyRoute'<>v_legacy.etymology_route
          or v_family->>'sourceFingerprint'<>v_legacy.source_row_hash
          or not exists (select 1 from jsonb_array_elements(p_manifest->'sourceAuthorities') source
            where source->>'authorityKey'='manager-legacy-family:'||v_legacy.id::text
              and source->>'sourceKind'='approved_repository_artifact'
              and source->>'sourceId'='manager-legacy-family:'||v_legacy.id::text
              and source->>'sourceFingerprint'=v_legacy.source_row_hash)
          then raise exception 'BASE_FAMILY_AUTHORITY_LEGACY_SOURCE_DRIFT'; end if;
      end if;
    else
      if v_family->>'baseFamilyKey' is distinct from v_parent_family->>'baseFamilyKey'
        or v_family->>'baseWordId' is distinct from v_parent_family->>'baseWordId'
        or v_family->>'baseMeaning' is distinct from v_parent_family->>'baseMeaning'
        or v_family->'etymologyRoute' is distinct from v_parent_family->'etymologyRoute'
        or v_family->>'sourceFingerprint' is distinct from v_parent_family->>'sourceFingerprint'
        then raise exception 'BASE_FAMILY_AUTHORITY_PARENT_FAMILY_DRIFT'; end if;
    end if;
    if jsonb_typeof(v_family->'members')<>'array' or jsonb_array_length(v_family->'members')<2
      or (select count(*) from jsonb_array_elements(v_family->'members') member
          where member->>'structuralRole'='base' and member->>'canonicalWordId'=v_family->>'baseWordId')<>1
      or (select count(distinct member->>'canonicalWordId') from jsonb_array_elements(v_family->'members') member)
          <>jsonb_array_length(v_family->'members')
      then raise exception 'BASE_FAMILY_AUTHORITY_MEMBER_SET_INVALID'; end if;
    v_word_ids:=array[]::text[];
    for v_member in select value from jsonb_array_elements(v_family->'members') loop
      if v_member->>'canonicalWordId'=any(v_word_ids) then raise exception 'BASE_FAMILY_AUTHORITY_DUPLICATE_MEMBER'; end if;
      v_word_ids:=array_append(v_word_ids,v_member->>'canonicalWordId');
      if jsonb_typeof(v_member->'applicableMicroSkillKeys')<>'array'
        or jsonb_array_length(v_member->'applicableMicroSkillKeys')<>1
        or v_member->'applicableMicroSkillKeys'->>0 is distinct from v_skill and v_skill is not null
        then raise exception 'BASE_FAMILY_AUTHORITY_SKILL_MIXED'; end if;
      v_skill:=v_member->'applicableMicroSkillKeys'->>0;
      if not exists (select 1 from public.micro_skill_catalog
        where micro_skill_key=v_skill and skill_cluster_key='D4_MOR_BASE_WORDS' and is_active and is_assignable)
        then raise exception 'BASE_FAMILY_AUTHORITY_SKILL_INVALID'; end if;
      if v_member->>'structuralRole' is distinct from (case when v_member->>'canonicalWordId'=v_family->>'baseWordId' then 'base' else 'family_member' end)
        or v_member->>'assignmentEligible' not in ('true','false')
        or nullif(btrim(v_member->>'wordSum'),'') is null
        or jsonb_typeof(v_member->'morphologyParts')<>'array'
        or jsonb_array_length(v_member->'morphologyParts')=0
        or jsonb_typeof(v_member->'morphologyJoins')<>'array'
        or jsonb_typeof(v_member->'morphologyTransformations')<>'array'
        or nullif(btrim(v_member->>'childFriendlyMeaning'),'') is null
        then raise exception 'BASE_FAMILY_AUTHORITY_MEMBER_INVALID'; end if;
      if v_member#>>'{morphologySource,sourceKind}'='approved_manager_review' then
        select * into v_review from public.teaching_dictionary_base_family_member_reviews
          where id=(v_member#>>'{morphologySource,sourceId}')::uuid for share;
        if v_review.id is null or v_member->>'assignmentEligible'<>'true'
          or (v_environment is not null and v_review.environment_key<>v_environment)
          or v_review.canonical_word_id::text<>v_member->>'canonicalWordId'
          or v_review.base_word_id::text<>v_family->>'baseWordId'
          or v_review.micro_skill_key<>v_skill
          or coalesce(v_review.definition_id,v_review.legacy_family_id)::text<>v_family->>'familyId'
          or v_review.source_fingerprint<>v_member#>>'{morphologySource,sourceFingerprint}'
          or v_review.word_sum<>v_member->>'wordSum'
          or v_review.morphology_parts<>v_member->'morphologyParts'
          or v_review.morphology_joins<>v_member->'morphologyJoins'
          or v_review.morphology_transformations<>v_member->'morphologyTransformations'
          or coalesce(v_review.transformation_notes,'')<>coalesce(v_member->>'transformationNotes','')
          or v_review.child_friendly_meaning<>v_member->>'childFriendlyMeaning'
          or not exists (select 1 from public.canonical_teaching_dictionary_words word
            join public.canonical_teaching_dictionary_words base on base.id=v_review.base_word_id
            where word.id=v_review.canonical_word_id and word.row_status='active'
              and word.review_status='approved_for_first_exposure'
              and base.row_status='active' and base.review_status='approved_for_first_exposure'
              and word.dialect_code=base.dialect_code)
          or (v_review.source_morphology_id is not null and not exists (
            select 1 from public.canonical_teaching_dictionary_word_morphology morphology
            where morphology.id=v_review.source_morphology_id
              and morphology.canonical_word_id=v_review.canonical_word_id
              and morphology.row_status='active'
              and morphology.review_status='approved_for_first_exposure'
              and morphology.analysis_status='approved'
              and morphology.morphology_parts=v_review.morphology_parts
              and morphology.morphology_joins=v_review.morphology_joins
              and morphology.word_sum=v_review.word_sum))
          or exists (select 1 from public.teaching_dictionary_base_family_member_withdrawals where review_id=v_review.id)
          or exists (select 1 from public.adle_reviewed_word_skill_withdrawals where release_id=v_review.word_skill_release_id)
          or not exists (select 1 from public.adle_reviewed_word_skill_releases release
            where release.id=v_review.word_skill_release_id and release.environment_key=v_review.environment_key)
          or exists (select 1 from public.teaching_dictionary_base_family_member_reviews newer
            where coalesce(newer.definition_id,newer.legacy_family_id)=coalesce(v_review.definition_id,v_review.legacy_family_id)
              and newer.canonical_word_id=v_review.canonical_word_id
              and newer.micro_skill_key=v_review.micro_skill_key
              and newer.environment_key=v_review.environment_key
              and (newer.reviewed_at,newer.id)>(v_review.reviewed_at,v_review.id))
          or not exists (select 1 from jsonb_array_elements(p_manifest->'sourceAuthorities') source
            where source->>'authorityKey'='manager-review:'||v_review.id::text
              and source->>'sourceKind'='approved_repository_artifact'
              and source->>'sourceId'='manager-review:'||v_review.id::text
              and source->>'sourceFingerprint'=v_review.source_fingerprint)
          then raise exception 'BASE_FAMILY_AUTHORITY_REVIEW_DRIFT'; end if;
        v_environment:=v_review.environment_key;
      else
        select member into v_parent_member from jsonb_array_elements(coalesce(v_parent_family->'members','[]'::jsonb)) member
          where member->>'canonicalWordId'=v_member->>'canonicalWordId';
        if v_parent_member is null or not (v_parent_member->'applicableMicroSkillKeys' ? v_skill)
          or v_member - 'applicableMicroSkillKeys' <> v_parent_member - 'applicableMicroSkillKeys'
          then raise exception 'BASE_FAMILY_AUTHORITY_UNREVIEWED_MEMBER'; end if;
      end if;
    end loop;
    if v_parent_family is not null and exists (
      select 1 from jsonb_array_elements(v_parent_family->'members') old_member
      where old_member->'applicableMicroSkillKeys' ? v_skill
        and not (old_member->>'canonicalWordId'=any(v_word_ids))
        and not exists (
          select 1 from public.teaching_dictionary_base_family_member_reviews withdrawn_review
          where coalesce(withdrawn_review.definition_id,withdrawn_review.legacy_family_id)=(v_family->>'familyId')::uuid
            and withdrawn_review.canonical_word_id=(old_member->>'canonicalWordId')::uuid
            and withdrawn_review.micro_skill_key=v_skill
            and withdrawn_review.environment_key=v_environment
            and (
              exists (select 1 from public.teaching_dictionary_base_family_member_withdrawals withdrawal
                where withdrawal.review_id=withdrawn_review.id)
              or exists (select 1 from public.adle_reviewed_word_skill_withdrawals skill_withdrawal
                where skill_withdrawal.release_id=withdrawn_review.word_skill_release_id))
            and not exists (select 1 from public.teaching_dictionary_base_family_member_reviews newer
              where coalesce(newer.definition_id,newer.legacy_family_id)=coalesce(withdrawn_review.definition_id,withdrawn_review.legacy_family_id)
                and newer.canonical_word_id=withdrawn_review.canonical_word_id
                and newer.micro_skill_key=withdrawn_review.micro_skill_key
                and newer.environment_key=withdrawn_review.environment_key
                and (newer.reviewed_at,newer.id)>(withdrawn_review.reviewed_at,withdrawn_review.id))
        )
    ) then raise exception 'BASE_FAMILY_AUTHORITY_PARENT_MEMBER_REMOVED'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(v_parent.semantic_projection->'families') old_family
    where exists (select 1 from jsonb_array_elements(old_family->'members') old_member
      where old_member->'applicableMicroSkillKeys' ? v_skill)
      and not (old_family->>'familyId'=any(v_family_ids)))
    then raise exception 'BASE_FAMILY_AUTHORITY_PARENT_FAMILY_REMOVED'; end if;
  v_projection:=jsonb_build_object('schemaVersion',2,'skillClusterKey','D4_MOR_BASE_WORDS',
    'sourceAuthorities',p_manifest->'sourceAuthorities','families',p_manifest->'families');
  v_semantic_fingerprint:=public.adle_canonical_json_sha256_v1(v_projection);
  v_manifest_sha256:=public.adle_canonical_json_sha256_v1(p_manifest);
  insert into public.adle_curriculum_dependency_authorities
    (authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,
      authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,
      source_provenance,approval_refs,published_by)
  values (p_manifest->>'authorityKey','family_membership',2,'composite_release_and_legacy_projection',
    p_manifest_file_sha256,p_manifest,v_manifest_sha256,v_projection,v_semantic_fingerprint,
    jsonb_build_object('parentAuthorityId',p_parent_authority_id,'managerReviewOverlay',true),
    p_manifest->'approvalRefs',p_published_by)
  on conflict (authority_type,authority_key) do nothing returning id into v_authority_id;
  if v_authority_id is null then
    select id into v_authority_id from public.adle_curriculum_dependency_authorities
      where authority_type='family_membership' and authority_key=p_manifest->>'authorityKey'
        and semantic_fingerprint=v_semantic_fingerprint and authority_manifest=p_manifest
        and manifest_file_sha256=p_manifest_file_sha256;
    if v_authority_id is null then raise exception 'BASE_FAMILY_AUTHORITY_KEY_CONFLICT'; end if;
  end if;
  return v_authority_id;
end $$;
revoke all on function public.publish_teaching_dictionary_base_family_authority_v2(uuid,jsonb,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_base_family_authority_v2(uuid,jsonb,text,text)
  to service_role;

-- The manager creates applied admin-import batches after the historical
-- pre-ledger cutoff. Let the existing exact closure publisher consume those
-- rows only when their draft has a matching manager publication receipt.
do $migration$
declare
  v_signature constant text := 'public.publish_adle_teaching_dictionary_closure_v1(jsonb,text,jsonb,text,text)';
  v_definition text;
  v_old text := $old$(v_word_batch.release_id is null and v_word_batch.created_at < v_legacy_cutoff)
      ) and (
        (v_dictation_batch.release_id is not null and v_dictation_batch.package_sha256 is not null and v_dictation_batch.verified_at is not null)
        or (v_dictation_batch.release_id is null and v_dictation_batch.created_at < v_legacy_cutoff)$old$;
  v_new text := $new$(v_word_batch.release_id is null and v_word_batch.created_at < v_legacy_cutoff)
        or (v_word_batch.import_mode='admin_import' and exists (
          select 1 from public.teaching_dictionary_manager_publications publication
          where publication.draft_id=(v_word_batch.validation_summary->>'sourceDraft')::uuid
            and publication.canonical_word_id=v_word_row.id))
      ) and (
        (v_dictation_batch.release_id is not null and v_dictation_batch.package_sha256 is not null and v_dictation_batch.verified_at is not null)
        or (v_dictation_batch.release_id is null and v_dictation_batch.created_at < v_legacy_cutoff)
        or (v_dictation_batch.import_mode='admin_import' and exists (
          select 1 from public.teaching_dictionary_manager_publications publication
          where publication.draft_id=(v_dictation_batch.validation_summary->>'sourceDraft')::uuid
            and publication.canonical_word_id=v_word_row.id))$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_old in v_definition)=0 then
    raise exception 'Base family manager closure predecessor differs from reviewed contract'; end if;
  v_definition:=replace(v_definition,v_old,v_new);
  execute v_definition;
end;
$migration$;

commit;
