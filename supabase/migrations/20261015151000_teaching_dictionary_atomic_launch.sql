begin;

create table public.teaching_dictionary_lesson_launches (
  id uuid primary key default gen_random_uuid(), route_id text not null, micro_skill_key text not null,
  content_version_ids uuid[] not null, preflight_fingerprint text not null,
  compiler_witnesses jsonb not null check(jsonb_typeof(compiler_witnesses)='object'),
  previous_profile_id uuid not null, published_profile_id uuid not null,
  dictionary_before jsonb not null, published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now()
);
create trigger teaching_dictionary_lesson_launches_immutable before update or delete
  on public.teaching_dictionary_lesson_launches for each row execute function public.reject_writing_fact_update();
create table public.teaching_dictionary_lesson_launch_rollbacks (
  launch_id uuid primary key references public.teaching_dictionary_lesson_launches(id),
  reason text not null check(length(btrim(reason))>=8), rolled_back_by uuid not null references auth.users(id),
  rolled_back_at timestamptz not null default now()
);
create trigger teaching_dictionary_lesson_launch_rollbacks_immutable before update or delete
  on public.teaching_dictionary_lesson_launch_rollbacks for each row execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_lesson_launches enable row level security;
alter table public.teaching_dictionary_lesson_launch_rollbacks enable row level security;
revoke all on public.teaching_dictionary_lesson_launches,public.teaching_dictionary_lesson_launch_rollbacks from public,anon,authenticated;
grant select on public.teaching_dictionary_lesson_launches,public.teaching_dictionary_lesson_launch_rollbacks to service_role;

create function public.assert_teaching_dictionary_compiler_witnesses(p_witnesses jsonb,p_ids uuid[])
returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare v_id uuid; v_selection jsonb;
begin
  if jsonb_typeof(p_witnesses) is distinct from 'object' or cardinality(p_ids)<1 then raise exception 'TEACHING_LESSON_COMPILER_WITNESSES_REQUIRED'; end if;
  foreach v_id in array p_ids loop
    v_selection:=p_witnesses->v_id::text;
    if jsonb_typeof(v_selection) is distinct from 'array' or not v_selection @> jsonb_build_array(v_id::text)
      or exists(select 1 from jsonb_array_elements_text(v_selection) id where not id=any(p_ids::text[]))
      then raise exception 'TEACHING_LESSON_MEMBER_COMPILER_WITNESS_MISSING'; end if;
  end loop;
end $$;
revoke all on function public.assert_teaching_dictionary_compiler_witnesses(jsonb,uuid[]) from public,anon,authenticated;

create or replace function public.publish_teaching_dictionary_prefix_reviewed_content(p_content_version uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  c public.teaching_dictionary_route_content_versions%rowtype;
  p public.canonical_teaching_dictionary_prefix_profiles%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  v_profile uuid;
  v_batch uuid;
  v_hash text;
  v_member jsonb;
  v_audit jsonb;
  v_parts jsonb;
  v_joins jsonb;
  v_choices text[];
  v_form text;
begin
  select * into c from public.teaching_dictionary_route_content_versions where id=p_content_version for update;
  if c.id is null or c.route_id<>'dynamic_prefix_word_lab' or c.route_version<>'v2' then
    raise exception 'TEACHING_PREFIX_CONTENT_UNSUPPORTED'; end if;
  select route_profile_id into v_profile from public.teaching_dictionary_route_content_publications where content_version_id=c.id;
  if exists(select 1 from public.teaching_dictionary_route_content_rollbacks where content_version_id=c.id) then
    raise exception 'TEACHING_PREFIX_REVIEW_REQUIRED'; end if;
  if v_profile is not null then return v_profile; end if;
  if not exists(select 1 from public.teaching_dictionary_route_content_reviews r
    where r.content_version_id=c.id
      and r.content_sha256=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex')
      and (r.dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id)
      or r.dictionary_fingerprint=(nullif(current_setting('app.teaching_dictionary_base_fingerprints',true),'')::jsonb->>c.canonical_word_id::text))) then
    raise exception 'TEACHING_ROUTE_EDITORIAL_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.teaching_dictionary_route_content_versions newer
    where newer.canonical_word_id=c.canonical_word_id and newer.route_id=c.route_id
      and newer.route_version=c.route_version and newer.micro_skill_key=c.micro_skill_key
      and (newer.published_at,newer.id)>(c.published_at,c.id)) then
    raise exception 'TEACHING_ROUTE_CONTENT_STALE'; end if;
  select * into w from public.canonical_teaching_dictionary_words where id=c.canonical_word_id and row_status='active'
    and review_status='approved_for_first_exposure' for update;
  if w.id is null then raise exception 'TEACHING_PREFIX_WORD_NOT_APPROVED'; end if;
  select * into p from public.canonical_teaching_dictionary_prefix_profiles
    where micro_skill_key=c.micro_skill_key and row_status='active' and review_status='approved_for_first_exposure'
      for update;
  if p.id is null then raise exception 'TEACHING_PREFIX_PROFILE_NOT_ACTIVE'; end if;
  if nullif(c.content->'content'->>'expectedProfileId','') is null
    or c.content->'content'->>'expectedProfileId' is distinct from p.id::text
    and c.content->'content'->>'expectedProfileId' is distinct from current_setting('app.adle_lesson_root_id',true) then
    raise exception 'TEACHING_PREFIX_PROFILE_CHANGED'; end if;
  if nullif(c.content->'content'->>'expectedSourceRowHash','') is null
    or c.content->'content'->>'expectedSourceRowHash' is distinct from p.source_row_hash
    and c.content->'content'->>'expectedSourceRowHash' is distinct from current_setting('app.adle_lesson_root_hash',true) then
    raise exception 'TEACHING_PREFIX_PROFILE_CHANGED'; end if;
  -- A reviewed member may replace its earlier version in the new profile snapshot.
  v_member:=c.content->'content';
  v_parts:=v_member->'teachingSplitParts';
  v_joins:=v_member->'teachingSplitJoins';
  v_audit:=v_member->'choiceAudit';
  v_form:=v_member->>'prefixVariant';
  if jsonb_typeof(v_member)<>'object' or jsonb_typeof(v_parts)<>'array' or jsonb_array_length(v_parts)<2
    or jsonb_typeof(v_joins)<>'array' or jsonb_typeof(v_audit)<>'object'
    or btrim(coalesce(v_member->>'baseWord',''))='' or btrim(coalesce(v_member->>'baseMeaning',''))=''
    or btrim(coalesce(v_member->>'meaningBinKey',''))='' or btrim(coalesce(c.content->>'wordMeaning',''))=''
    or btrim(coalesce(c.content->>'wordSum',''))='' or btrim(coalesce(v_form,''))=''
    then raise exception 'TEACHING_PREFIX_MEMBER_FIELDS_MISSING'; end if;
  if not exists(select 1 from jsonb_array_elements(p.meaning_bins) bin
    where bin->>'id'=v_member->>'meaningBinKey' and bin->>'prefixText'=v_form) then
    raise exception 'TEACHING_PREFIX_MEANING_GROUP_INVALID'; end if;
  select array_agg(choice->>'text' order by choice->>'text') into v_choices from jsonb_array_elements(p.prefix_choices) choice;
  if v_audit->>'word' is distinct from w.display_word or jsonb_typeof(v_audit->'choiceVerdicts') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(v_audit->'choiceVerdicts'))<>cardinality(v_choices)
    or exists(select 1 from unnest(v_choices) choice where not (v_audit->'choiceVerdicts' ? choice))
    or (select count(*) from jsonb_each(v_audit->'choiceVerdicts') entry where entry.value='true'::jsonb)<>1
    or v_audit->'choiceVerdicts'->v_form is distinct from 'true'::jsonb
    then raise exception 'TEACHING_PREFIX_CHOICE_AUDIT_INVALID'; end if;
  if (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(v_parts) with ordinality part(value,ordinality)) is distinct from w.display_word
    or v_parts->0->>'kind' is distinct from 'prefix' or v_parts->0->>'surfaceText' is distinct from v_form
    or v_parts->0->'displayRange'->>'start' is distinct from '0'
    or (v_parts->0->'displayRange'->>'end')::integer is distinct from length(v_form)
    or exists(select 1 from jsonb_array_elements(v_parts) part
      where btrim(coalesce(part->>'id',''))='' or btrim(coalesce(part->>'sourceText',''))=''
        or btrim(coalesce(part->>'surfaceText',''))='' or part->>'kind' not in ('prefix','base','root')
        or jsonb_typeof(part->'displayRange') is distinct from 'object'
        or (part->'displayRange'->>'start') !~ '^[0-9]+$'
        or (part->'displayRange'->>'end') !~ '^[0-9]+$')
    or exists(select 1 from jsonb_array_elements(v_joins) join_row
      where btrim(coalesce(join_row->>'afterPartId',''))='' or btrim(coalesce(join_row->>'beforePartId',''))=''
        or join_row->>'joinType' not in ('none','space','hyphen'))
    then raise exception 'TEACHING_PREFIX_SPLIT_INVALID'; end if;
  if not exists(select 1 from public.canonical_teaching_dictionary_word_metadata m
    where m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure'
      and m.syllables is not null and m.phoneme_hint is not null and m.stress_pattern is not null
      and m.has_schwa is not null and m.morphemes is not null and m.morphology_notes is not null)
    or w.age_band is null or w.frequency_band is null or w.complexity_band is null
    or not exists(select 1 from public.canonical_teaching_dictionary_dictation_sentences s
      where s.canonical_word_id=w.id and s.row_status='active' and s.review_status='approved_for_first_exposure'
        and s.audio_text=s.dictation_sentence)
    then raise exception 'TEACHING_PREFIX_DICTIONARY_FACTS_MISSING'; end if;
  if jsonb_typeof(p.intro_content->'validChoiceAudit')<>'array'
    or jsonb_array_length(p.intro_content->'validChoiceAudit') < 4 then
    raise exception 'TEACHING_PREFIX_PROFILE_AUDIT_MISSING'; end if;
  v_hash:=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex');
  insert into public.canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
  values ('teaching-dictionary-manager/prefix/'||c.id::text,v_hash,'teaching_dictionary_prefix_v1',
    jsonb_build_object('errors',0),jsonb_build_object('prefixMembers',1),jsonb_build_object('replacesProfile',p.id),
    'admin_import','applied',jsonb_build_object('contentVersion',c.id),p_actor::text,now()) returning id into v_batch;
  update public.canonical_teaching_dictionary_prefix_profiles set row_status='superseded',production_enabled=false,updated_at=now() where id=p.id;
  insert into public.canonical_teaching_dictionary_prefix_profiles
    (import_batch_id,micro_skill_key,prefix_label,prefix_text,prefix_meaning,meaning_bins,prefix_choices,
     reflection_prompt_key,reflection_prompt_text,intro_content,production_enabled,row_status,review_status,
     source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,
     source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  values (v_batch,p.micro_skill_key,p.prefix_label,p.prefix_text,p.prefix_meaning,p.meaning_bins,p.prefix_choices,
    p.reflection_prompt_key,p.reflection_prompt_text,
    jsonb_set(p.intro_content,'{validChoiceAudit}',(p.intro_content->'validChoiceAudit')||jsonb_build_array(v_audit)),
    p.production_enabled,'active','approved_for_first_exposure','manager',2,v_hash,
    jsonb_build_object('previousProfileId',p.id,'previousProductionEnabled',p.production_enabled,'contentVersionId',c.id),'internal_authored',
    'Teaching Dictionary Manager',null,null,'Reviewed profile extension','high',p_actor::text,now())
  returning id into v_profile;
  insert into public.canonical_teaching_dictionary_prefix_members
    (import_batch_id,prefix_profile_id,canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,
     meaning_bin_key,teaching_split_parts,teaching_split_joins,transformation_notes,prefix_variant,assignment_eligible,
     row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,
     source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  select v_batch,v_profile,m.canonical_word_id,m.member_role,m.base_word,m.base_meaning,m.child_friendly_meaning,
    m.meaning_bin_key,m.teaching_split_parts,m.teaching_split_joins,m.transformation_notes,m.prefix_variant,m.assignment_eligible,
    m.row_status,m.review_status,m.source_sheet,m.source_row_number,m.source_row_hash,m.source_metadata,m.source_category,
    m.source_name,m.source_url,m.source_licence,m.source_use_note,m.confidence,m.reviewed_by,m.reviewed_at
  from public.canonical_teaching_dictionary_prefix_members m where m.prefix_profile_id=p.id and m.row_status='active' and m.canonical_word_id<>w.id;
  insert into public.canonical_teaching_dictionary_prefix_members
    (import_batch_id,prefix_profile_id,canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,
     meaning_bin_key,teaching_split_parts,teaching_split_joins,transformation_notes,prefix_variant,assignment_eligible,
     row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,
     source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  values (v_batch,v_profile,w.id,coalesce((select member_role from public.canonical_teaching_dictionary_prefix_members where prefix_profile_id=p.id and canonical_word_id=w.id and row_status='active' limit 1),'authentic_target'),v_member->>'baseWord',v_member->>'baseMeaning',c.content->>'wordMeaning',
    v_member->>'meaningBinKey',v_parts,v_joins,coalesce(v_member->>'transformationNotes',''),v_form,true,
    'active','approved_for_first_exposure','manager',2,v_hash,jsonb_build_object('contentVersionId',c.id),
    'internal_authored','Teaching Dictionary Manager',null,null,'Reviewed prefix word content','high',p_actor::text,now());
  insert into public.teaching_dictionary_route_content_publications(content_version_id,route_profile_id,published_by)
    values(c.id,v_profile,p_actor);
  return v_profile;
end $$;

create or replace function public.publish_teaching_dictionary_suffix_reviewed_content(p_content_version uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  c public.teaching_dictionary_route_content_versions%rowtype;
  p public.canonical_teaching_dictionary_suffix_profiles%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  v_profile uuid;
  v_batch uuid;
  v_hash text;
  v_member jsonb;
  v_variant text;
begin
  select * into c from public.teaching_dictionary_route_content_versions where id=p_content_version for update;
  if c.id is null or c.route_id<>'dynamic_affix_word_lab' or c.route_version<>'v3' then
    raise exception 'TEACHING_SUFFIX_CONTENT_UNSUPPORTED'; end if;
  select route_profile_id into v_profile from public.teaching_dictionary_route_content_publications where content_version_id=c.id;
  if exists(select 1 from public.teaching_dictionary_route_content_rollbacks where content_version_id=c.id) then
    raise exception 'TEACHING_SUFFIX_REVIEW_REQUIRED'; end if;
  if v_profile is not null then return v_profile; end if;
  if not exists(select 1 from public.teaching_dictionary_route_content_reviews r
    where r.content_version_id=c.id
      and r.content_sha256=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex')
      and (r.dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id)
      or r.dictionary_fingerprint=(nullif(current_setting('app.teaching_dictionary_base_fingerprints',true),'')::jsonb->>c.canonical_word_id::text))) then
    raise exception 'TEACHING_ROUTE_EDITORIAL_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.teaching_dictionary_route_content_versions newer
    where newer.canonical_word_id=c.canonical_word_id and newer.route_id=c.route_id
      and newer.route_version=c.route_version and newer.micro_skill_key=c.micro_skill_key
      and (newer.published_at,newer.id)>(c.published_at,c.id)) then
    raise exception 'TEACHING_ROUTE_CONTENT_STALE'; end if;
  select * into w from public.canonical_teaching_dictionary_words where id=c.canonical_word_id and row_status='active'
    and review_status='approved_for_first_exposure' for update;
  if w.id is null then raise exception 'TEACHING_SUFFIX_WORD_NOT_APPROVED'; end if;
  select * into p from public.canonical_teaching_dictionary_suffix_profiles
    where micro_skill_key=c.micro_skill_key and row_status='active' and review_status='approved_for_first_exposure'
      for update;
  if p.id is null then raise exception 'TEACHING_SUFFIX_PROFILE_NOT_ACTIVE'; end if;
  v_member:=c.content->'content';
  if nullif(v_member->>'expectedProfileId','') is null
    or v_member->>'expectedProfileId' is distinct from p.id::text
    and v_member->>'expectedProfileId' is distinct from current_setting('app.adle_lesson_root_id',true) then
    raise exception 'TEACHING_SUFFIX_PROFILE_CHANGED'; end if;
  if nullif(v_member->>'expectedSourceRowHash','') is null
    or v_member->>'expectedSourceRowHash' is distinct from p.source_row_hash
    and v_member->>'expectedSourceRowHash' is distinct from current_setting('app.adle_lesson_root_hash',true) then
    raise exception 'TEACHING_SUFFIX_PROFILE_CHANGED'; end if;
  -- A reviewed member may replace its earlier version in the new profile snapshot.
  v_variant:=v_member->>'suffixVariant';
  if jsonb_typeof(v_member) is distinct from 'object' or btrim(coalesce(c.content->>'wordMeaning',''))=''
    or btrim(coalesce(c.content->>'wordSum',''))=''
    or btrim(coalesce(v_variant,''))=''
    or btrim(coalesce(v_member->>'semanticBaseText',''))=''
    or v_member->>'semanticBaseKind' not in ('base','root')
    or btrim(coalesce(v_member->>'baseMeaning',''))=''
    or btrim(coalesce(v_member->>'meaningBinKey',''))=''
    or jsonb_typeof(v_member->'teachingSplitParts') is distinct from 'array'
    or jsonb_array_length(v_member->'teachingSplitParts')<2
    or jsonb_typeof(v_member->'teachingSplitJoins') is distinct from 'array'
    or jsonb_typeof(v_member->'trueMorphologyParts') is distinct from 'array'
    or jsonb_array_length(v_member->'trueMorphologyParts')<2
    or jsonb_typeof(v_member->'trueMorphologyJoins') is distinct from 'array'
    or jsonb_typeof(v_member->'trueMorphologyProvenance') is distinct from 'object'
    or v_member->'trueMorphologyProvenance'='{}'::jsonb
    or v_member->'trueMorphologyProvenance'->>'status' is distinct from 'reviewed'
    then raise exception 'TEACHING_SUFFIX_MEMBER_FIELDS_MISSING'; end if;
  if not exists(select 1 from jsonb_array_elements(p.meaning_bins) bin
    where bin->>'id'=v_member->>'meaningBinKey') then
    raise exception 'TEACHING_SUFFIX_MEANING_GROUP_INVALID'; end if;
  if not exists(select 1 from jsonb_array_elements(v_member->'teachingSplitParts') part
    where part->>'kind'='suffix' and part->>'surfaceText'=v_variant) then
    raise exception 'TEACHING_SUFFIX_SPLIT_INVALID'; end if;
  if (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(v_member->'teachingSplitParts') with ordinality part(value,ordinality))
      is distinct from w.display_word
    or (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(v_member->'trueMorphologyParts') with ordinality part(value,ordinality))
      is distinct from w.display_word
    then raise exception 'TEACHING_SUFFIX_SPLIT_INVALID'; end if;
  if not exists(select 1 from public.canonical_teaching_dictionary_word_metadata m
    where m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure'
      and m.syllables is not null and m.phoneme_hint is not null and m.stress_pattern is not null
      and m.has_schwa is not null)
    or w.age_band is null or w.frequency_band is null or w.complexity_band is null
    or not exists(select 1 from public.canonical_teaching_dictionary_dictation_sentences s
      where s.canonical_word_id=w.id and s.row_status='active' and s.review_status='approved_for_first_exposure'
        and s.audio_text=s.dictation_sentence)
    then raise exception 'TEACHING_SUFFIX_DICTIONARY_FACTS_MISSING'; end if;
  v_hash:=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex');
  insert into public.canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
  values ('teaching-dictionary-manager/suffix/'||c.id::text,v_hash,'teaching_dictionary_suffix_v1',
    jsonb_build_object('errors',0),jsonb_build_object('suffixMembers',1),jsonb_build_object('replacesProfile',p.id),
    'admin_import','applied',jsonb_build_object('contentVersion',c.id),p_actor::text,now()) returning id into v_batch;
  update public.canonical_teaching_dictionary_suffix_profiles set row_status='superseded',production_enabled=false,updated_at=now() where id=p.id;
  insert into public.canonical_teaching_dictionary_suffix_profiles
    (import_batch_id,micro_skill_key,suffix_label,suffix_text,suffix_meaning,meaning_bins,include_meaning_sort,
     suffix_choices,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,
     source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,
     source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  values (v_batch,p.micro_skill_key,p.suffix_label,p.suffix_text,p.suffix_meaning,p.meaning_bins,p.include_meaning_sort,
    p.suffix_choices,p.intro_content,p.reflection_prompt_key,p.reflection_prompt_text,p.production_enabled,'active','approved_for_first_exposure',
    'manager',2,v_hash,jsonb_build_object('previousProfileId',p.id,'previousProductionEnabled',p.production_enabled,'contentVersionId',c.id),
    'internal_authored','Teaching Dictionary Manager',null,null,'Reviewed suffix profile extension','high',p_actor::text,now())
  returning id into v_profile;
  insert into public.canonical_teaching_dictionary_suffix_members
    (import_batch_id,suffix_profile_id,canonical_word_id,member_role,suffix_variant,semantic_base_text,semantic_base_kind,
     base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,
     true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,
     assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,
     source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  select v_batch,v_profile,m.canonical_word_id,m.member_role,m.suffix_variant,m.semantic_base_text,m.semantic_base_kind,
    m.base_meaning,m.new_word_meaning,m.meaning_bin_key,m.teaching_split_parts,m.teaching_split_joins,m.true_morphology_parts,
    m.true_morphology_joins,m.true_morphology_transformations,m.transformation_notes,m.true_morphology_provenance,
    m.assignment_eligible,m.row_status,m.review_status,m.source_sheet,m.source_row_number,m.source_row_hash,m.source_metadata,
    m.source_category,m.source_name,m.source_url,m.source_licence,m.source_use_note,m.confidence,m.reviewed_by,m.reviewed_at
  from public.canonical_teaching_dictionary_suffix_members m where m.suffix_profile_id=p.id and m.row_status='active' and m.canonical_word_id<>w.id;
  insert into public.canonical_teaching_dictionary_suffix_members
    (import_batch_id,suffix_profile_id,canonical_word_id,member_role,suffix_variant,semantic_base_text,semantic_base_kind,
     base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,
     true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,
     assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,
     source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  values (v_batch,v_profile,w.id,coalesce((select member_role from public.canonical_teaching_dictionary_suffix_members where suffix_profile_id=p.id and canonical_word_id=w.id and row_status='active' limit 1),'authentic_target'),v_variant,v_member->>'semanticBaseText',v_member->>'semanticBaseKind',
    v_member->>'baseMeaning',c.content->>'wordMeaning',v_member->>'meaningBinKey',
    v_member->'teachingSplitParts',v_member->'teachingSplitJoins',v_member->'trueMorphologyParts',
    v_member->'trueMorphologyJoins',coalesce(v_member->'trueMorphologyTransformations','[]'::jsonb),
    coalesce(v_member->>'transformationNotes',''),v_member->'trueMorphologyProvenance',
    true,'active','approved_for_first_exposure','manager',2,v_hash,jsonb_build_object('contentVersionId',c.id),
    'internal_authored','Teaching Dictionary Manager',null,null,'Reviewed suffix word content','high',p_actor::text,now());
  insert into public.teaching_dictionary_route_content_publications(content_version_id,route_profile_id,published_by)
    values(c.id,v_profile,p_actor);
  return v_profile;
end $$;

create function public.launch_teaching_dictionary_lesson_v2(p_route_id text,p_micro_skill_key text,p_versions uuid[],
  p_expected_profile uuid,p_expected_profile_hash text,p_preflight_fingerprint text,p_actor uuid,p_compiler_witnesses jsonb)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_profile uuid; v_hash text; c public.teaching_dictionary_route_content_versions%rowtype;
  d public.teaching_dictionary_manager_drafts%rowtype; v_before jsonb:='[]'::jsonb;
  v_fingerprints jsonb:='{}'::jsonb; v_published uuid; v_launch uuid;
begin
  if p_actor is null or p_versions is null or p_expected_profile is null or p_expected_profile_hash is null or p_preflight_fingerprint is null or p_preflight_fingerprint !~ '^[a-f0-9]{64}$' or cardinality(p_versions)<1
    or cardinality(p_versions)>30 then raise exception 'TEACHING_LESSON_PREFLIGHT_REQUIRED'; end if;
  if (select count(*) from public.teaching_dictionary_route_content_versions where id=any(p_versions))<>cardinality(p_versions) then raise exception 'TEACHING_LESSON_CONTENT_MISSING'; end if;
  if exists(select 1 from public.teaching_dictionary_route_content_publications where content_version_id=any(p_versions))
    then raise exception 'TEACHING_LESSON_ALREADY_RELEASED'; end if;
  if p_route_id='dynamic_prefix_word_lab' then
    select id,source_row_hash into v_profile,v_hash from public.canonical_teaching_dictionary_prefix_profiles
      where micro_skill_key=p_micro_skill_key and row_status='active' and production_enabled=true for update;
  elsif p_route_id='dynamic_affix_word_lab' then
    select id,source_row_hash into v_profile,v_hash from public.canonical_teaching_dictionary_suffix_profiles
      where micro_skill_key=p_micro_skill_key and row_status='active' and production_enabled=true for update;
  else raise exception 'TEACHING_LESSON_ROUTE_ADAPTER_REQUIRED'; end if;
  if v_profile is distinct from p_expected_profile or v_hash is distinct from p_expected_profile_hash
    then raise exception 'TEACHING_LESSON_PROFILE_CHANGED'; end if;
  for c in select * from public.teaching_dictionary_route_content_versions where id=any(p_versions) order by canonical_word_id for update loop
    if c.route_id<>p_route_id or c.micro_skill_key<>p_micro_skill_key then raise exception 'TEACHING_LESSON_CONTENT_MISMATCH'; end if;
    select * into d from public.teaching_dictionary_manager_drafts where id=c.draft_id;
    if not exists(select 1 from public.teaching_dictionary_overview_reviews r where r.draft_id=d.id
      and r.content_fingerprint=public.teaching_dictionary_overview_fingerprint(d.payload)
      and (r.base_dictionary_fingerprint is not distinct from public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id)
        or exists(select 1 from public.teaching_dictionary_manager_publications pub where pub.draft_id=d.id)))
      then raise exception 'TEACHING_OVERVIEW_REVIEW_STALE'; end if;
    if exists(select 1 from public.teaching_dictionary_manager_drafts newer where newer.canonical_word_id=c.canonical_word_id
      and newer.created_at>d.created_at) then raise exception 'TEACHING_LESSON_DRAFT_STALE'; end if;
    v_fingerprints:=v_fingerprints||jsonb_build_object(c.canonical_word_id::text,public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id));
    -- Shared facts must not silently invalidate a different released curriculum.
    if exists(select 1 from public.canonical_teaching_dictionary_prefix_members m join public.canonical_teaching_dictionary_prefix_profiles p on p.id=m.prefix_profile_id
      where m.canonical_word_id=c.canonical_word_id and m.row_status='active' and p.row_status='active' and p.id<>v_profile)
      or exists(select 1 from public.canonical_teaching_dictionary_suffix_members m join public.canonical_teaching_dictionary_suffix_profiles p on p.id=m.suffix_profile_id
      where m.canonical_word_id=c.canonical_word_id and m.row_status='active' and p.row_status='active' and p.id<>v_profile)

      then
      if not exists(select 1 from public.teaching_dictionary_manager_publications where draft_id=d.id) then
        raise exception 'TEACHING_SHARED_FACTS_DEPENDENT_ROUTE_RELEASE_REQUIRED';
      end if;
    end if;
    -- Native family/compound releases already freeze their structural facts
    -- and dictionary closure. A shared pronunciation or sentence replacement
    -- leaves those earlier releases intact. Their canonical identity cannot move.
    if d.payload->>'displayWord' is distinct from (select display_word from public.canonical_teaching_dictionary_words where id=c.canonical_word_id)
      and (exists(select 1 from public.canonical_teaching_dictionary_base_word_family_members m where m.canonical_word_id=c.canonical_word_id and m.row_status='active')
        or exists(select 1 from public.canonical_teaching_dictionary_compound_structures_v2 m where m.canonical_word_id=c.canonical_word_id))
      then raise exception 'TEACHING_SHARED_DISPLAY_REQUIRES_ALL_ROUTE_RELEASES'; end if;
    v_before:=v_before||jsonb_build_array(jsonb_build_object('word', (select to_jsonb(w) from public.canonical_teaching_dictionary_words w where id=c.canonical_word_id),
      'metadataId',(select id from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=c.canonical_word_id and row_status='active' order by created_at desc limit 1),
      'morphologyId',(select id from public.canonical_teaching_dictionary_word_morphology where canonical_word_id=c.canonical_word_id and row_status='active' order by created_at desc limit 1),
      'dictationId',(select id from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=c.canonical_word_id and row_status='active' order by created_at desc limit 1),
      'definition',(select definition from public.teaching_dictionary_definition_versions where canonical_word_id=c.canonical_word_id and route_id is null order by published_at desc limit 1),
      'dictationSetId',(select set_id from public.teaching_dictionary_dictation_heads where canonical_word_id=c.canonical_word_id)));
    perform set_config('app.teaching_dictionary_release_draft',d.id::text,true);
    perform public.publish_teaching_dictionary_manager_draft(d.id,p_actor);
  end loop;
  perform public.assert_teaching_dictionary_compiler_witnesses(p_compiler_witnesses,array(
    select canonical_word_id from public.canonical_teaching_dictionary_prefix_members where prefix_profile_id=v_profile and p_route_id='dynamic_prefix_word_lab' and row_status='active' and assignment_eligible
    union select canonical_word_id from public.canonical_teaching_dictionary_suffix_members where suffix_profile_id=v_profile and p_route_id='dynamic_affix_word_lab' and row_status='active' and assignment_eligible
    union select canonical_word_id from public.teaching_dictionary_route_content_versions where id=any(p_versions)));
  perform set_config('app.teaching_dictionary_base_fingerprints',v_fingerprints::text,true);
  v_published:=public.publish_teaching_dictionary_lesson(p_route_id,p_micro_skill_key,p_versions,p_actor);
  insert into public.teaching_dictionary_lesson_launches(route_id,micro_skill_key,content_version_ids,preflight_fingerprint,
    previous_profile_id,published_profile_id,dictionary_before,published_by,compiler_witnesses)
    values(p_route_id,p_micro_skill_key,p_versions,p_preflight_fingerprint,v_profile,v_published,v_before,p_actor,p_compiler_witnesses) returning id into v_launch;
  return v_launch;
end $$;
revoke all on function public.launch_teaching_dictionary_lesson_v2(text,text,uuid[],uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.launch_teaching_dictionary_lesson_v2(text,text,uuid[],uuid,text,text,uuid,jsonb) to service_role;

create function public.rollback_teaching_dictionary_launch_v2(p_launch uuid,p_actor uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.teaching_dictionary_lesson_launches%rowtype; v_content uuid; v_before jsonb; v_word public.canonical_teaching_dictionary_words%rowtype;
begin
  select * into l from public.teaching_dictionary_lesson_launches where id=p_launch for update;
  if l.id is null or p_actor is null or length(btrim(p_reason))<8 then raise exception 'TEACHING_LESSON_ROLLBACK_INVALID'; end if;
  if exists(select 1 from public.teaching_dictionary_lesson_launch_rollbacks where launch_id=l.id) then raise exception 'TEACHING_LESSON_ALREADY_ROLLED_BACK'; end if;
  foreach v_content in array (select array_agg(id order by ord desc) from unnest(l.content_version_ids) with ordinality v(id,ord)) loop
    if l.route_id='dynamic_prefix_word_lab' then perform public.rollback_teaching_dictionary_prefix_content(v_content,p_actor,p_reason);
    else perform public.rollback_teaching_dictionary_suffix_content(v_content,p_actor,p_reason); end if;
  end loop;
  for v_before in select value from jsonb_array_elements(l.dictionary_before) loop
    v_word:=jsonb_populate_record(null::public.canonical_teaching_dictionary_words,v_before->'word');
    -- Refuse to undo a later dictionary release made after this lesson.
    if exists(select 1 from public.teaching_dictionary_manager_publications p join public.teaching_dictionary_manager_drafts d on d.id=p.draft_id
      where p.canonical_word_id=v_word.id and p.published_at>l.published_at) then raise exception 'TEACHING_DICTIONARY_ROLLBACK_NOT_CURRENT'; end if;
    update public.canonical_teaching_dictionary_words set display_word=v_word.display_word,frequency_band=v_word.frequency_band,age_band=v_word.age_band,
      complexity_band=v_word.complexity_band,source_row_hash=v_word.source_row_hash,source_category=v_word.source_category,source_name=v_word.source_name,
      source_url=v_word.source_url,source_licence=v_word.source_licence,source_use_note=v_word.source_use_note,confidence=v_word.confidence,updated_at=v_word.updated_at where id=v_word.id;
    update public.canonical_teaching_dictionary_word_metadata set row_status='superseded' where canonical_word_id=v_word.id and row_status='active';
    update public.canonical_teaching_dictionary_word_metadata set row_status='active' where id=(v_before->>'metadataId')::uuid;
    update public.canonical_teaching_dictionary_word_morphology set row_status='retired' where canonical_word_id=v_word.id and row_status='active';
    update public.canonical_teaching_dictionary_word_morphology set row_status='active' where id=(v_before->>'morphologyId')::uuid;
    update public.canonical_teaching_dictionary_dictation_sentences set row_status='superseded' where canonical_word_id=v_word.id and row_status='active';
    update public.canonical_teaching_dictionary_dictation_sentences set row_status='active' where id=(v_before->>'dictationId')::uuid;
    insert into public.teaching_dictionary_definition_versions(canonical_word_id,definition,is_withdrawn,draft_id)
      values(v_word.id,coalesce(v_before->>'definition',''),nullif(v_before->>'definition','') is null,(select draft_id from public.teaching_dictionary_route_content_versions where id=l.content_version_ids[1]));
    delete from public.teaching_dictionary_dictation_heads where canonical_word_id=v_word.id;
    if v_before->>'dictationSetId' is not null then insert into public.teaching_dictionary_dictation_heads values(v_word.id,(v_before->>'dictationSetId')::uuid); end if;
  end loop;
  insert into public.teaching_dictionary_lesson_launch_rollbacks(launch_id,reason,rolled_back_by) values(l.id,p_reason,p_actor);
end $$;
revoke all on function public.rollback_teaching_dictionary_launch_v2(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rollback_teaching_dictionary_launch_v2(uuid,uuid,text) to service_role;
commit;
