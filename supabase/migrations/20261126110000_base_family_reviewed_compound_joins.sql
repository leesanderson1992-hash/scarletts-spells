-- Preserve reviewed compound separators in Base Word family publication.
begin;

create or replace function public.review_teaching_dictionary_base_family_member(
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
  -- Reconstruct the visible word using its reviewed joins. Compounds keep
  -- separators in the join, rather than inventing punctuation-bearing parts.
  if jsonb_array_length(p_joins)<>jsonb_array_length(p_parts)-1
    or exists(select 1 from jsonb_array_elements(p_parts) with ordinality part(value,n)
      left join lateral (select value from jsonb_array_elements(p_joins)
        where value->>'afterPartId'=p_parts->(part.n::int-2)->>'id'
          and value->>'beforePartId'=part.value->>'id') j on true
      where part.n>1 and (j.value is null or j.value->>'joinType' is null or j.value->>'joinType' not in ('none','space','hyphen')))
    then raise exception 'BASE_FAMILY_MORPHOLOGY_INVALID'; end if;
  select string_agg(case when part.n=1 then '' else case j.value->>'joinType'
      when 'hyphen' then '-' when 'space' then ' ' else '' end end || (part.value->>'surfaceText'),'' order by part.n)
    into v_parts
    from jsonb_array_elements(p_parts) with ordinality part(value,n)
    left join lateral (select value from jsonb_array_elements(p_joins)
      where value->>'afterPartId'=p_parts->(part.n::int-2)->>'id'
        and value->>'beforePartId'=part.value->>'id') j on part.n>1;
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


commit;
