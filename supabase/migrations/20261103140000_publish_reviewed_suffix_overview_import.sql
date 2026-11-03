begin;

-- A suffix lesson may keep its reviewed teaching choices while its shared
-- definition and true morphology move to a reviewed Overview. The runtime
-- suffix adapter reads those shared facts from Overview after publication.
create table if not exists public.teaching_dictionary_suffix_overview_reconciliations (
  draft_id uuid primary key references public.teaching_dictionary_manager_drafts(id),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  suffix_profile_id uuid not null references public.canonical_teaching_dictionary_suffix_profiles(id),
  previous_member_id uuid not null references public.canonical_teaching_dictionary_suffix_members(id),
  canonical_morphology_id uuid not null references public.canonical_teaching_dictionary_word_morphology(id),
  environment_key text not null check(environment_key in ('staging','production')),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now()
);
alter table public.teaching_dictionary_suffix_overview_reconciliations enable row level security;
revoke all on public.teaching_dictionary_suffix_overview_reconciliations from public,anon,authenticated;
grant select on public.teaching_dictionary_suffix_overview_reconciliations to service_role;

create or replace function public.publish_teaching_dictionary_reviewed_suffix_overview_draft(
  p_draft uuid,p_actor uuid,p_environment text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  v_member public.canonical_teaching_dictionary_suffix_members%rowtype;
  v_profile public.canonical_teaching_dictionary_suffix_profiles%rowtype;
  v_family public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  v_base_text text;
  v_base_meaning text;
  v_word uuid;
  v_morphology uuid;
  v_family_revision integer;
  v_desired text[];
  v_live text[];
  v_actual text[];
  v_skill text;
  v_candidate jsonb;
  v_package uuid;
begin
  if p_actor is null or p_environment not in ('staging','production') then
    raise exception 'TEACHING_SUFFIX_IMPORT_REVIEW_REQUIRED';
  end if;
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or d.canonical_word_id is null
    or d.source_reference !~ '^CSV batch [a-f0-9-]{36},'
    or d.payload ? 'rootFamilyReview'
    or jsonb_typeof(d.payload->'skillKeys') is distinct from 'array'
    or jsonb_array_length(coalesce(d.payload->'routeContents','[]'::jsonb))<>0
    or exists(select 1 from public.teaching_dictionary_manager_publications p where p.draft_id=d.id) then
    raise exception 'TEACHING_SUFFIX_IMPORT_DRAFT_INVALID';
  end if;
  if not exists(select 1 from public.teaching_dictionary_overview_reviews r
    where r.draft_id=d.id and r.canonical_word_id=d.canonical_word_id
      and r.reviewed_by=p_actor
      and r.content_fingerprint=public.teaching_dictionary_overview_fingerprint(d.payload)
      and r.base_dictionary_fingerprint is not distinct from
        public.teaching_dictionary_route_dictionary_fingerprint(d.canonical_word_id))
    or not exists(select 1 from public.teaching_dictionary_import_skill_reviews r
      where r.draft_id=d.id and r.reviewed_by=p_actor and r.source_reference=d.source_reference
        and r.skill_fingerprint=public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys')) then
    raise exception 'TEACHING_SUFFIX_IMPORT_REVIEW_STALE';
  end if;
  select m.* into v_member from public.canonical_teaching_dictionary_suffix_members m
    join public.canonical_teaching_dictionary_suffix_profiles p on p.id=m.suffix_profile_id
    where m.canonical_word_id=d.canonical_word_id and m.row_status='active'
      and m.review_status='approved_for_first_exposure'
      and p.row_status='active' and p.review_status='approved_for_first_exposure'
    for update of m;
  if v_member.id is null or (select count(*) from public.canonical_teaching_dictionary_suffix_members m
    join public.canonical_teaching_dictionary_suffix_profiles p on p.id=m.suffix_profile_id
    where m.canonical_word_id=d.canonical_word_id and m.row_status='active'
      and p.row_status='active')<>1 then
    raise exception 'TEACHING_SUFFIX_IMPORT_PROFILE_AMBIGUOUS';
  end if;
  select * into v_profile from public.canonical_teaching_dictionary_suffix_profiles
    where id=v_member.suffix_profile_id for update;
  if v_profile.id is null or not v_profile.production_enabled
    or v_member.suffix_variant is distinct from
      (select part->>'surfaceText' from jsonb_array_elements(d.payload#>'{canonicalMorphology,parts}') part
        where part->>'kind'='suffix' order by part->>'id' limit 1)
    or (select count(*) from jsonb_array_elements(d.payload#>'{canonicalMorphology,parts}') part
      where part->>'kind'='suffix')<>1 then
    raise exception 'TEACHING_SUFFIX_IMPORT_PART_INVALID';
  end if;
  -- Other curriculum structures still require their own coordinated release.
  -- Older base-family and suffix-route rows can coexist only when they point
  -- at the same free-base identity and the same suffix skill.
  if exists(select 1 from public.canonical_teaching_dictionary_prefix_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_compound_structures_v2 x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_compound_facts x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_word_support x
      where x.canonical_word_id=d.canonical_word_id and x.row_status='active'
        and x.review_status='approved_for_first_exposure')
    or exists(select 1 from public.teaching_dictionary_route_content_versions v
      join public.teaching_dictionary_route_content_publications p on p.content_version_id=v.id
      where v.canonical_word_id=d.canonical_word_id
        and (v.route_id<>'dynamic_affix_word_lab' or v.route_version<>'v3'
          or v.micro_skill_key<>v_profile.micro_skill_key)) then
    raise exception 'TEACHING_SUFFIX_IMPORT_OTHER_DEPENDENCIES';
  end if;
  select coalesce(array_agg(distinct value order by value),'{}'::text[])
    into v_desired from jsonb_array_elements_text(d.payload->'skillKeys') value;
  if cardinality(v_desired)<>jsonb_array_length(d.payload->'skillKeys')
    or exists(select 1 from unnest(v_desired) key
      where not exists(select 1 from public.micro_skill_catalog c
        where c.micro_skill_key=key and c.is_active and c.is_assignable)) then
    raise exception 'TEACHING_SUFFIX_IMPORT_SKILLS_INVALID';
  end if;
  select coalesce(array_agg(distinct p.micro_skill_key order by p.micro_skill_key),'{}'::text[])
    into v_live from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key=p_environment
    where p.canonical_word_id=d.canonical_word_id
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)
      and not exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
        where x.environment_key=p_environment and x.canonical_word_id=p.canonical_word_id
          and x.micro_skill_key=p.micro_skill_key and x.action='deassign');
  perform set_config('app.teaching_dictionary_release_draft',d.id::text,true);
  v_word:=public.publish_teaching_dictionary_manager_draft(d.id,p_actor);
  select id into v_morphology from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=v_word and row_status='active'
      and analysis_status='approved' and review_status='approved_for_first_exposure'
    order by created_at desc,id desc limit 1;
  if v_morphology is null or not exists(select 1 from public.canonical_teaching_dictionary_word_morphology m
    where m.id=v_morphology and m.morphology_parts=d.payload#>'{canonicalMorphology,parts}'
      and m.morphology_joins=d.payload#>'{canonicalMorphology,joins}'
      and m.word_sum=d.payload#>>'{canonicalMorphology,wordSum}') then
    raise exception 'TEACHING_SUFFIX_IMPORT_MORPHOLOGY_MISMATCH';
  end if;
  if (select count(*) from jsonb_array_elements(d.payload#>'{canonicalMorphology,parts}') part
    where part->>'kind'='base')<>1 then
    raise exception 'TEACHING_SUFFIX_IMPORT_BASE_INVALID';
  end if;
  select part->>'sourceText',part->>'gloss' into v_base_text,v_base_meaning
    from jsonb_array_elements(d.payload#>'{canonicalMorphology,parts}') part
    where part->>'kind'='base';
  select f.* into v_family from public.canonical_teaching_dictionary_lexical_base_families f
    where f.base_kind='free_base' and f.base_lemma=lower(v_base_text)
      and f.review_status='approved'
      and (coalesce(d.payload#>>'{freeBaseFamilyReview,familyKey}','')<>''
        and f.family_key=d.payload#>>'{freeBaseFamilyReview,familyKey}'
        or coalesce(d.payload#>>'{freeBaseFamilyReview,familyKey}','')=''
          and f.base_meaning=v_base_meaning)
      and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
        where newer.family_key=f.family_key and newer.revision>f.revision)
    order by f.family_key limit 1 for update;
  if v_family.family_key is null or (select count(*) from public.canonical_teaching_dictionary_lexical_base_families f
    where f.base_kind='free_base' and f.base_lemma=lower(v_base_text)
      and f.review_status='approved'
      and (coalesce(d.payload#>>'{freeBaseFamilyReview,familyKey}','')<>''
        and f.family_key=d.payload#>>'{freeBaseFamilyReview,familyKey}'
        or coalesce(d.payload#>>'{freeBaseFamilyReview,familyKey}','')=''
          and f.base_meaning=v_base_meaning)
      and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
        where newer.family_key=f.family_key and newer.revision>f.revision))<>1 then
    raise exception 'TEACHING_SUFFIX_IMPORT_FAMILY_AMBIGUOUS_OR_MISSING';
  end if;
  if (coalesce(d.payload#>>'{freeBaseFamilyReview,basePartOfSpeech}','')<>''
      and d.payload#>>'{freeBaseFamilyReview,basePartOfSpeech}' is distinct from v_family.base_part_of_speech) then
    raise exception 'TEACHING_SUFFIX_IMPORT_FAMILY_REVIEW_CONFLICT';
  end if;
  if exists(select 1 from public.canonical_teaching_dictionary_base_word_family_members m
    join public.canonical_teaching_dictionary_base_word_families f on f.id=m.base_word_family_id
    where m.canonical_word_id=v_word and m.row_status='active' and f.row_status='active'
      and f.base_word_id is distinct from v_family.canonical_base_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_base_family_registry_members m
      join public.canonical_teaching_dictionary_base_family_registry r on r.id=m.canonical_family_id
      where m.canonical_word_id=v_word
        and r.canonical_base_word_id is distinct from v_family.canonical_base_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_lexical_base_family_members m
      join public.canonical_teaching_dictionary_lexical_base_families f
        on f.family_key=m.family_key and f.revision=m.revision
      where m.canonical_word_id=v_word and f.review_status='approved'
        and m.family_key<>v_family.family_key
        and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
          where newer.family_key=f.family_key and newer.revision>f.revision)) then
    raise exception 'TEACHING_SUFFIX_IMPORT_FAMILY_IDENTITY_CONFLICT';
  end if;
  select public.review_existing_free_base_member_revision(
    v_family.family_key,v_family.revision,v_word,v_morphology,v_base_meaning,
    d.payload#>>'{canonicalMorphology,rawPartOfSpeech}','derived',
    d.source_reference,p_actor::text,
    'Reviewed Teaching Dictionary CSV: '||d.source_reference)
    into v_family_revision;
  if exists(select 1 from public.adle_base_word_lexical_family_authorizations a
      where a.family_key=v_family.family_key and a.revision=v_family.revision
        and a.withdrawn_at is null)
    or exists(select 1 from unnest(v_desired) skill where skill like 'D4_MOR_BASE_WORDS_%') then
    insert into public.adle_base_word_lexical_family_authorizations
      (family_key,revision,semantic_fingerprint,authorization_reference,authorized_by)
    select family_key,revision,semantic_fingerprint,
      'Reviewed Teaching Dictionary CSV: '||d.source_reference,p_actor
    from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=v_family.family_key and revision=v_family_revision;
  end if;
  foreach v_skill in array v_live loop
    if v_skill=any(v_desired) then continue; end if;
    perform public.withdraw_teaching_dictionary_manager_skill_pair(
      p_environment,v_skill,v_word,p_actor);
  end loop;
  foreach v_skill in array v_desired loop
    if v_skill=any(v_live) then continue; end if;
    if exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
      where x.environment_key=p_environment and x.canonical_word_id=v_word
        and x.micro_skill_key=v_skill and x.action='deassign') then
      insert into public.teaching_dictionary_pair_decision_events
        (environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id)
      values(p_environment,v_skill,v_word,'restore',p_actor,d.id);
    end if;
    if not exists(select 1 from public.adle_reviewed_word_skill_pairs p
      join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
      where p.canonical_word_id=v_word and p.micro_skill_key=v_skill
        and r.environment_key=p_environment
        and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals w where w.release_id=r.id)) then
      v_candidate:=jsonb_build_object('canonicalWordId',v_word,
        'microSkillKey',v_skill,'relationshipRole','demonstrates',
        'method','deterministic_candidate',
        'sourceReference','Reviewed Teaching Dictionary CSV: '||d.source_reference,
        'licenceReference','internal_authored');
      v_package:=public.create_word_skill_candidate_package(
        'tdm:'||d.id::text||':'||md5(v_skill),p_environment,jsonb_build_array(v_candidate),p_actor);
      perform public.review_word_skill_candidate_package_with_metrics(
        v_package,p_environment,'["approved"]'::jsonb,'[""]'::jsonb,p_actor,
        'Approved in reviewed Teaching Dictionary CSV import',null);
      perform public.publish_word_skill_candidate_package(v_package,p_environment,p_actor,
        public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys'));
    end if;
  end loop;
  select coalesce(array_agg(distinct p.micro_skill_key order by p.micro_skill_key),'{}'::text[])
    into v_actual from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key=p_environment
    where p.canonical_word_id=v_word
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)
      and not exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
        where x.environment_key=p_environment and x.canonical_word_id=p.canonical_word_id
          and x.micro_skill_key=p.micro_skill_key and x.action='deassign');
  if v_actual is distinct from v_desired then
    raise exception 'TEACHING_SUFFIX_IMPORT_SKILL_SET_CHANGED';
  end if;
  insert into public.teaching_dictionary_suffix_overview_reconciliations
    (draft_id,canonical_word_id,suffix_profile_id,previous_member_id,canonical_morphology_id,
     environment_key,published_by)
  values(d.id,v_word,v_profile.id,v_member.id,v_morphology,p_environment,p_actor);
  return v_word;
end $$;

revoke all on function public.publish_teaching_dictionary_reviewed_suffix_overview_draft(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_reviewed_suffix_overview_draft(uuid,uuid,text)
  to service_role;
notify pgrst,'reload schema';
commit;
