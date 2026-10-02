-- Additive, inactive capability only: no content, activation or learner writes.
begin;

alter table public.adle_curriculum_dependency_authorities drop constraint adle_curriculum_dependency_authorities_type_check;
alter table public.adle_curriculum_dependency_authorities add constraint adle_curriculum_dependency_authorities_type_check
  check(authority_type in ('family_membership','compound_structure','adjective_degree_families','teaching_content','teaching_dictionary_closure'));
alter table public.adle_curriculum_release_dependencies drop constraint adle_curriculum_release_dependencies_type_check;
alter table public.adle_curriculum_release_dependencies add constraint adle_curriculum_release_dependencies_type_check
  check(authority_type in ('family_membership','compound_structure','adjective_degree_families','teaching_content','teaching_dictionary_closure'));

create or replace function public.adle_degree_family_valid_v1(f jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare b text:=f#>>'{words,0,word}'; stem text; w jsonb; t jsonb; i integer:=0; expected_rule text;
begin
  if jsonb_typeof(f) is distinct from 'object' or not (f ?& array['schemaVersion','familyKey','microSkillKey','dialect','meaning','rule','words','transformations','lexicalVerification','content','rowStatus','reviewStatus','provenance'])
    or not ((f->'provenance') ?& array['sourceRefs','reviewerRef','approvalRef','contentVersion'])
    or not ((f->'lexicalVerification') ?& array['adjective','gradable','acceptsErEst','childSuitable','oneSyllable','shortVowelBeforeFinalConsonant'])
    or not ((f->'content') ?& array['gaps','pairedSentence','questions']) then return false; end if;
  expected_rule:=case f->>'microSkillKey'
    when 'D4_INF_COMPARATIVE_SUPERLATIVE_REGULAR' then 'regular'
    when 'D4_INF_COMPARATIVE_SUPERLATIVE_DROP_E' then 'drop_e'
    when 'D4_INF_COMPARATIVE_SUPERLATIVE_Y_TO_I' then 'y_to_i'
    when 'D4_INF_COMPARATIVE_SUPERLATIVE_DOUBLE_FINAL_CONSONANT' then 'double_final_consonant' end;
  if expected_rule is null or f->>'schemaVersion' is distinct from '1' or f->>'dialect' is distinct from 'en-GB' or f->>'rule' is distinct from expected_rule
    or f->>'rowStatus' is distinct from 'active' or f->>'reviewStatus' is distinct from 'approved_for_first_exposure'
    or coalesce(b,'')!~'^[a-z]+$' or nullif(btrim(f->>'meaning'),'') is null
    or nullif(btrim(f->>'familyKey'),'') is null or nullif(btrim(f#>>'{provenance,reviewerRef}'),'') is null
    or nullif(btrim(f#>>'{provenance,approvalRef}'),'') is null or nullif(btrim(f#>>'{provenance,contentVersion}'),'') is null
    or jsonb_typeof(f#>'{provenance,reviewerRef}') is distinct from 'string' or jsonb_typeof(f#>'{provenance,approvalRef}') is distinct from 'string'
    or jsonb_typeof(f#>'{provenance,sourceRefs}') is distinct from 'array' or jsonb_array_length(f#>'{provenance,sourceRefs}')<1
    or exists(select 1 from jsonb_array_elements(f#>'{provenance,sourceRefs}') s where jsonb_typeof(s.value)<>'string' or nullif(btrim(s.value#>>'{}'),'') is null)
    or f#>'{lexicalVerification,adjective}' is distinct from 'true'::jsonb or f#>'{lexicalVerification,gradable}' is distinct from 'true'::jsonb
    or f#>'{lexicalVerification,acceptsErEst}' is distinct from 'true'::jsonb
    or f#>'{lexicalVerification,childSuitable}' is distinct from 'true'::jsonb
    or jsonb_typeof(f->'words') is distinct from 'array' or jsonb_typeof(f->'transformations') is distinct from 'array'
    or jsonb_typeof(f#>'{content,gaps}') is distinct from 'array' or jsonb_typeof(f#>'{content,questions}') is distinct from 'array'
    or jsonb_typeof(f#>'{content,pairedSentence,segments}') is distinct from 'array' or jsonb_typeof(f#>'{content,pairedSentence,targets}') is distinct from 'array'
    or jsonb_array_length(f->'words')<>3 or jsonb_array_length(f->'transformations')<>2
    or jsonb_array_length(f#>'{content,pairedSentence,segments}')<>3
    or jsonb_array_length(f#>'{content,pairedSentence,targets}')<>2 or jsonb_array_length(f#>'{content,questions}')<>2 then return false; end if;
  if expected_rule='drop_e' and right(b,1)<>'e' then return false; end if;
  if expected_rule='y_to_i' and b!~'[^aeiou]y$' then return false; end if;
  if expected_rule='double_final_consonant' and (b!~'[aeiou][b-df-hj-np-tv-z]$' or b~'[wxy]$'
    or f#>'{lexicalVerification,oneSyllable}' is distinct from 'true'::jsonb or f#>'{lexicalVerification,shortVowelBeforeFinalConsonant}' is distinct from 'true'::jsonb) then return false; end if;
  stem:=case expected_rule when 'drop_e' then left(b,-1) when 'y_to_i' then left(b,-1)||'i' when 'double_final_consonant' then b||right(b,1) else b end;
  for w in select value from jsonb_array_elements(f->'words') loop
    if coalesce(w->>'canonicalWordId','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or w->>'degree' is distinct from (array['base','comparative','superlative'])[i+1]
      or w->>'word' is distinct from (case i when 0 then b when 1 then stem||'er' else stem||'est' end) then return false; end if;
    if i>0 then
      t:=f->'transformations'->(i-1);
      if t->>'rule' is distinct from expected_rule or t->>'base' is distinct from b or t->>'stem' is distinct from stem or t->>'ending' is distinct from (case i when 1 then 'er' else 'est' end)
        or t->>'result' is distinct from w->>'word' or nullif(btrim(t->>'explanation'),'') is null
        or (f#>'{content,pairedSentence,targets}'->(i-1)) is distinct from (w||jsonb_build_object('audioText',w->>'word')) then return false; end if;
    end if;
    i:=i+1;
  end loop;
  if (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(f->'words'))<>3
    or nullif(btrim(f#>>'{content,pairedSentence,id}'),'') is null
    or exists(select 1 from jsonb_array_elements(f#>'{content,pairedSentence,segments}') s where jsonb_typeof(s.value)<>'string')
    or (select count(*) from jsonb_array_elements(f#>'{content,gaps}') where value->>'degree'='comparative')<2
    or (select count(*) from jsonb_array_elements(f#>'{content,gaps}') where value->>'degree'='superlative')<2
    or (select count(distinct value->>'id') from jsonb_array_elements(f#>'{content,gaps}'))<>jsonb_array_length(f#>'{content,gaps}')
    or exists(select 1 from jsonb_array_elements(f#>'{content,gaps}') g where nullif(btrim(g.value->>'id'),'') is null
      or nullif(btrim(g.value->>'before'),'') is null or nullif(btrim(g.value->>'after'),'') is null or coalesce(g.value->>'degree','') not in ('comparative','superlative'))
    or f#>>'{content,questions,0,kind}' is distinct from 'why' or f#>>'{content,questions,1,kind}' is distinct from 'when'
    or exists(select 1 from jsonb_array_elements(f#>'{content,questions}') q where jsonb_typeof(q.value->'options') is distinct from 'array' or jsonb_array_length(q.value->'options')<>3
      or nullif(btrim(q.value->>'id'),'') is null or nullif(btrim(q.value->>'prompt'),'') is null or nullif(btrim(q.value->>'explanation'),'') is null
      or (select count(distinct value->>'id') from jsonb_array_elements(q.value->'options'))<>3
      or exists(select 1 from jsonb_array_elements(q.value->'options') o where nullif(btrim(o.value->>'id'),'') is null or nullif(btrim(o.value->>'text'),'') is null)
      or not exists(select 1 from jsonb_array_elements(q.value->'options') o where o.value->>'id'=q.value->>'correctOptionId')) then return false; end if;
  return true;
exception when others then return false;
end $$;

create table public.canonical_teaching_dictionary_adjective_families_v1 (
  authority_id uuid not null references public.adle_curriculum_dependency_authorities(id),
  family_key text not null, micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  schema_version integer not null default 1 check(schema_version=1),
  family_record jsonb not null check(public.adle_degree_family_valid_v1(family_record)),
  semantic_fingerprint text not null check(semantic_fingerprint~'^[a-f0-9]{64}$'),
  primary key(authority_id,family_key)
);
alter table public.canonical_teaching_dictionary_adjective_families_v1 enable row level security;
create trigger adjective_degree_family_immutable before update or delete on public.canonical_teaching_dictionary_adjective_families_v1
  for each row execute function public.prevent_adle_release_authority_mutation();
grant select on public.canonical_teaching_dictionary_adjective_families_v1 to service_role;

-- Publishes a checksummed reviewed package; never creates an activation revision/head.
create or replace function public.publish_adle_comparative_package_v1(p_package jsonb,p_package_file_sha256 text,p_published_by text)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare m jsonb:=p_package->'manifest'; a jsonb; s jsonb; d jsonb; f jsonb; w jsonb; aid uuid; rid uuid; fp text; sha text;
begin
  if jsonb_typeof(p_package) is distinct from 'object' or not (p_package ?& array['schemaVersion','activation','manifest','authorities','packageSha256'])
    or jsonb_typeof(m->'approvalRefs') is distinct from 'array' or jsonb_typeof(m->'microSkills') is distinct from 'array' then raise exception 'comparative package shape invalid'; end if;
  if p_package->>'schemaVersion'<>'1' or p_package->>'activation'<>'inactive' or nullif(btrim(p_published_by),'') is null
    or coalesce(p_package_file_sha256,'')!~'^[a-f0-9]{64}$'
    or public.adle_generic_snapshot_json_sha256_v1(p_package-'packageSha256')<>p_package->>'packageSha256'
    or m#>>'{route,routeId}'<>'comparative_superlative_word_lab' or m#>>'{route,routeVersion}'<>'v1'
    or m#>>'{route,activationRouteKey}'<>'comparative_superlative_word_lab:v1' or m#>>'{route,payloadVersion}'<>'1'
    or jsonb_array_length(m->'approvalRefs')<1 or jsonb_array_length(m->'microSkills')<>4
    or (select count(distinct value->>'microSkillKey') from jsonb_array_elements(m->'microSkills'))<>4
    or jsonb_array_length(p_package->'authorities')<>12
    or (select count(distinct (value->>'authorityType',value#>>'{semanticProjection,microSkillKey}')) from jsonb_array_elements(p_package->'authorities'))<>12 then raise exception 'comparative package invalid'; end if;
  for a in select value from jsonb_array_elements(p_package->'authorities') loop
    fp:=public.adle_generic_snapshot_json_sha256_v1(a->'semanticProjection');
    if a->>'semanticFingerprint'<>fp or a->>'schemaVersion'<>'1' or a->>'authorityType' not in ('adjective_degree_families','teaching_content','teaching_dictionary_closure') then raise exception 'comparative dependency invalid'; end if;
    if a->>'authorityType'='adjective_degree_families' then
      if jsonb_array_length(a#>'{semanticProjection,families}')<>6
        or (select count(distinct value->>'familyKey') from jsonb_array_elements(a#>'{semanticProjection,families}'))<>6
        or (select count(distinct w.value->>'canonicalWordId') from jsonb_array_elements(a#>'{semanticProjection,families}') f,jsonb_array_elements(f.value->'words') w)<>18 then raise exception 'comparative six-family pool required'; end if;
      for f in select value from jsonb_array_elements(a#>'{semanticProjection,families}') loop
        if not public.adle_degree_family_valid_v1(f) or f->>'microSkillKey'<>a#>>'{semanticProjection,microSkillKey}' then raise exception 'comparative family review incomplete'; end if;
        for w in select value from jsonb_array_elements(f->'words') loop
          if not exists(select 1 from public.canonical_teaching_dictionary_words where id=(w->>'canonicalWordId')::uuid and display_word=w->>'word' and dialect_code='en-GB' and row_status='active' and review_status='approved_for_first_exposure') then raise exception 'comparative canonical identity unavailable'; end if;
        end loop;
      end loop;
    end if;
    insert into public.adle_curriculum_dependency_authorities(authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,source_provenance,approval_refs,published_by)
    values(a->>'authorityKey',a->>'authorityType',1,'mixed_governed_sources',p_package_file_sha256,a,public.adle_canonical_json_sha256_v1(a),a->'semanticProjection',fp,jsonb_build_object('packageSha256',p_package->>'packageSha256'),m->'approvalRefs',p_published_by)
    on conflict(authority_type,authority_key) do nothing returning id into aid;
    if aid is null then select id into aid from public.adle_curriculum_dependency_authorities where authority_key=a->>'authorityKey' and authority_type=a->>'authorityType' and semantic_projection=a->'semanticProjection' and manifest_file_sha256=p_package_file_sha256; if aid is null then raise exception 'comparative immutable authority conflict'; end if; end if;
    if a->>'authorityType'='adjective_degree_families' then
      for f in select value from jsonb_array_elements(a#>'{semanticProjection,families}') loop
        insert into public.canonical_teaching_dictionary_adjective_families_v1(authority_id,family_key,micro_skill_key,family_record,semantic_fingerprint)
          values(aid,f->>'familyKey',f->>'microSkillKey',f,public.adle_generic_snapshot_json_sha256_v1(f)) on conflict do nothing;
      end loop;
    end if;
    aid:=null;
  end loop;
  -- All three dependencies must describe the same reviewed families/audio.
  for a in select value from jsonb_array_elements(p_package->'authorities') where value->>'authorityType'='adjective_degree_families' loop
    select value->'semanticProjection' into strict d from jsonb_array_elements(p_package->'authorities')
      where value->>'authorityType'='teaching_dictionary_closure' and value#>>'{semanticProjection,microSkillKey}'=a#>>'{semanticProjection,microSkillKey}';
    if d->>'capability' is distinct from 'paired_degree_word_audio'
      or d->'words' is distinct from (select jsonb_agg(w.value order by f.ordinality,w.ordinality) from jsonb_array_elements(a#>'{semanticProjection,families}') with ordinality f,jsonb_array_elements(f.value->'words') with ordinality w)
      or d->'pairedSentences' is distinct from (select jsonb_agg(value#>'{content,pairedSentence}' order by ordinality) from jsonb_array_elements(a#>'{semanticProjection,families}') with ordinality)
      then raise exception 'comparative paired audio closure mismatch'; end if;
  end loop;
  sha:=public.adle_canonical_json_sha256_v1(m); fp:=public.adle_canonical_json_sha256_v1(m->'microSkills');
  insert into public.adle_curriculum_release_manifests(release_key,schema_version,manifest_file_sha256,manifest_payload,release_manifest_sha256,dependency_fingerprint,route_id,route_version,activation_route_key,payload_version,approval_refs,published_by)
  values(m->>'releaseKey',2,p_package_file_sha256,m,sha,fp,'comparative_superlative_word_lab','v1','comparative_superlative_word_lab:v1',1,m->'approvalRefs',p_published_by)
  on conflict(release_key) do nothing returning id into rid;
  if rid is null then select id into rid from public.adle_curriculum_release_manifests where release_key=m->>'releaseKey' and manifest_payload=m and manifest_file_sha256=p_package_file_sha256; if rid is null then raise exception 'comparative immutable release conflict'; end if; return rid; end if;
  for s in select value from jsonb_array_elements(m->'microSkills') loop
    if s->>'microSkillKey' not in ('D4_INF_COMPARATIVE_SUPERLATIVE_REGULAR','D4_INF_COMPARATIVE_SUPERLATIVE_DROP_E','D4_INF_COMPARATIVE_SUPERLATIVE_Y_TO_I','D4_INF_COMPARATIVE_SUPERLATIVE_DOUBLE_FINAL_CONSONANT')
      or (select array_agg(value->>'authorityType' order by ordinality) from jsonb_array_elements(s->'dependencies') with ordinality)<>array['adjective_degree_families','teaching_content','teaching_dictionary_closure'] then raise exception 'comparative exact dependencies required'; end if;
    for d in select value from jsonb_array_elements(s->'dependencies') loop
      select id into strict aid from public.adle_curriculum_dependency_authorities where authority_type=d->>'authorityType' and authority_key=d->>'authorityKey' and schema_version=1 and semantic_fingerprint=d->>'semanticFingerprint' and semantic_projection->>'microSkillKey'=s->>'microSkillKey';
      insert into public.adle_curriculum_release_dependencies(release_manifest_id,micro_skill_key,authority_type,authority_key,authority_schema_version,semantic_fingerprint,authority_id) values(rid,s->>'microSkillKey',d->>'authorityType',d->>'authorityKey',1,d->>'semanticFingerprint',aid);
    end loop;
  end loop;
  return rid;
end $$;

create or replace function public.adle_comparative_snapshot_valid_v3(p jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare l jsonb:=p#>'{payload,resolvedLesson}'; n integer; a jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(l) is distinct from 'object'
    or not (p ?& array['snapshotSchemaVersion','compilerVersion','validatorVersion','canonicalContractRegistryVersion','route','recipe','payload','runtime','assignment','taxonomy','words','activities','segments','contentVersions','provenance'])
    or not (l ?& array['schemaVersion','routeKey','microSkillKey','assignmentKey','authority','families','words','queuedTargets','sentenceTasks','cleaverTasks','dictationTasks','teaching','reflectionPrompt']) then return false; end if;
  n:=jsonb_array_length(l->'queuedTargets');
  if p->>'snapshotSchemaVersion'<>'3' or p#>>'{route,routeId}'<>'comparative_superlative_word_lab' or p#>>'{route,routeVersion}'<>'v1'
    or p#>>'{payload,kind}'<>'comparative_superlative_lesson_v1' or p#>>'{payload,version}'<>'1' or p#>>'{runtime,adapterKey}'<>'comparative_superlative_v1'
    or l->>'authority'<>'reviewed_content' or l->>'routeKey'<>'comparative_superlative_word_lab:v1'
    or n not between 2 and 4 or (p#>>'{assignment,itemCount}')::integer<>20+n
    or jsonb_array_length(l->'families')<>2 or l#>>'{families,0,familyKey}'=l#>>'{families,1,familyKey}'
    or exists(select 1 from jsonb_array_elements(l->'families') f where not public.adle_degree_family_valid_v1(f.value) or f.value->>'microSkillKey'<>l->>'microSkillKey')
    or jsonb_array_length(l->'words')<>6 or jsonb_array_length(l->'sentenceTasks')<>6 or jsonb_array_length(l->'cleaverTasks')<>n or jsonb_array_length(l->'dictationTasks')<>2
    or jsonb_array_length(p->'contentVersions')<>7
    or public.adle_generic_snapshot_json_sha256_v1(p#-'{provenance,sourceFingerprint}')<>p#>>'{provenance,sourceFingerprint}' then return false; end if;
  for a in select value from jsonb_array_elements(p->'activities') loop
    if concat(a#>>'{canonical,concept}','.',a#>>'{canonical,mode}','@',a#>>'{canonical,contractVersion}') not in ('INTRODUCTION.teaching_page@1','WORD_ASSEMBLY.sentence_suffix@1','MEANING_SORT.meaning@1','CLEAVER.transform_target@1','COVER_CHECK.whole_word@1','DICTATION.paired_word_gaps@1','LESSON_REFLECTION.standard_lesson_reflection@1') then return false; end if;
  end loop;
  return (select count(*)=20+n and count(*)=count(distinct b.value->>'sourceEntityId') from jsonb_array_elements(p->'activities') a,jsonb_array_elements(a.value->'itemBindings') b);
exception when others then return false;
end $$;

-- Production retired the v2 validator in 20260829133000.  Preserve the
-- current v3-only aggregate and add only this route discriminator.
create or replace function public.adle_lesson_snapshot_is_structurally_valid(p_snapshot jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select case p_snapshot->>'snapshotSchemaVersion' when '3' then case p_snapshot#>>'{route,routeId}'
  when 'generic_composer' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'compound_word_lab' then public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_affix_word_lab' then public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_prefix_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'base_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'comparative_superlative_word_lab' then public.adle_comparative_snapshot_valid_v3(p_snapshot)
  else false end else false end $$;

create or replace function public.assert_adle_comparative_assignment_v1(p_snapshot jsonb,p_metadata jsonb,p_items jsonb,p_child uuid,p_parent uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare f jsonb; t jsonb; a jsonb; r public.adle_route_activation_revisions%rowtype;
begin
  if not public.adle_comparative_snapshot_valid_v3(p_snapshot) or not public.adle_lesson_route_metadata_is_valid_v2(p_metadata)
    or p_metadata#>>'{route,routeId}'<>'comparative_superlative_word_lab'
    or jsonb_array_length(p_items)<>(p_snapshot#>>'{assignment,itemCount}')::integer then raise exception 'comparative assignment contract invalid'; end if;
  select * into strict r from public.adle_route_activation_revisions where id=(p_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid;
  if r.route_id<>'comparative_superlative_word_lab' or r.route_version<>'v1' or r.micro_skill_key<>p_snapshot#>>'{taxonomy,microSkillKey}'
    or not public.adle_release_activation_allows_child_v2(r.id,p_child)
    or not public.adle_route_activation_revision_is_current_v2(r.id,r.release_manifest_id,p_metadata#>>'{curriculumRelease,releaseManifestSha256}',p_metadata#>>'{curriculumRelease,dependencyFingerprint}') then raise exception 'comparative activation changed'; end if;
  for f in select value from jsonb_array_elements(p_snapshot#>'{payload,resolvedLesson,families}') loop
    if not exists(select 1 from public.canonical_teaching_dictionary_adjective_families_v1 family join public.adle_curriculum_release_dependencies d on d.authority_id=family.authority_id where d.release_manifest_id=r.release_manifest_id and d.micro_skill_key=r.micro_skill_key and family.family_record=f) then raise exception 'comparative family outside release'; end if;
  end loop;
  for t in select value from jsonb_array_elements(p_snapshot#>'{payload,resolvedLesson,queuedTargets}') loop
    if not exists(select 1 from public.adle_learning_items where id=(t->>'learningItemId')::uuid and child_id=p_child and canonical_word_id=(t->>'canonicalWordId')::uuid and micro_skill_key=r.micro_skill_key and row_status='active' and item_status in ('pending','pending_reteach')) then raise exception 'comparative target lineage unavailable'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_items) i where i.value->>'childId'<>p_child::text or i.value->>'parentUserId'<>p_parent::text or i.value->>'sourceType'<>'adle_composer')
    or exists(with bindings as(select a.value activity,b.value binding from jsonb_array_elements(p_snapshot->'activities') a,jsonb_array_elements(a.value->'itemBindings') b)
      select 1 from bindings full join jsonb_array_elements(p_items) i on i.value->>'sourceEntityId'=bindings.binding->>'sourceEntityId'
      where i.value is null or bindings.binding is null or i.value->>'position'<>bindings.binding->>'position' or i.value#>>'{promptData,comparativeActivityId}'<>bindings.activity->>'activityId') then raise exception 'comparative item binding mismatch'; end if;
end $$;

create or replace function public.append_adle_comparative_stage_r6(p_daily_assignment_id uuid,p_snapshot jsonb,p_items jsonb,p_intakes jsonb,p_lesson_route_metadata jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare h public.daily_assignments%rowtype;
begin
  select * into strict h from public.daily_assignments where id=p_daily_assignment_id for update;
  if p_intakes<>'[]'::jsonb then raise exception 'comparative companion practice cannot create needs'; end if;
  if h.compiled_lesson_snapshot is null then perform public.assert_adle_comparative_assignment_v1(p_snapshot,p_lesson_route_metadata,p_items,h.child_id,h.parent_user_id); end if;
  return public.append_adle_specialist_stage_r6(p_daily_assignment_id,p_snapshot,p_items,p_intakes,p_lesson_route_metadata);
end $$;

create or replace function public.persist_adle_comparative_daily_plan_v3(p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_header jsonb,p_items jsonb,p_intakes jsonb,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid; previous jsonb; i jsonb;
begin
  if p_intakes<>'[]'::jsonb or p_header->>'childId'<>p_child_id::text or p_header->>'parentUserId'<>p_parent_user_id::text or p_header->>'assignmentDate'<>p_plan_date::text
    or not exists(select 1 from public.children where children.id=p_child_id and parent_user_id=p_parent_user_id and not coalesce(is_archived,false)) then raise exception 'comparative ownership invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_child_id::text||':'||p_plan_date::text||':ADLE Daily Plan',0));
  select daily_assignments.id,compiled_lesson_snapshot into id,previous from public.daily_assignments where child_id=p_child_id and parent_user_id=p_parent_user_id and assignment_date=p_plan_date and title='ADLE Daily Plan';
  if id is not null then if previous#>>'{provenance,sourceFingerprint}' is distinct from p_snapshot#>>'{provenance,sourceFingerprint}' then raise exception 'comparative idempotency conflict'; end if; return id; end if;
  perform public.assert_adle_comparative_assignment_v1(p_snapshot,p_header->'lessonRouteMetadata',p_items,p_child_id,p_parent_user_id);
  insert into public.daily_assignments(child_id,parent_user_id,assignment_date,title,status,target_words,review_words,assignment_generation_source,lesson_route_metadata,compiled_lesson_snapshot)
  values(p_child_id,p_parent_user_id,p_plan_date,'ADLE Daily Plan','pending',array(select jsonb_array_elements_text(p_header->'targetWords')),array[]::text[],'adle_composer_v1',p_header->'lessonRouteMetadata',p_snapshot) returning daily_assignments.id into id;
  for i in select value from jsonb_array_elements(p_items) loop
    insert into public.assignment_items(daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,source_entity_id,template_key,target_word,position,status,prompt_data,metadata)
    values(id,p_child_id,p_parent_user_id,'spelling',i->>'itemType','adle_composer',i->>'sourceEntityId',i->>'templateKey',i->>'targetWord',(i->>'position')::integer,'ready',i->'promptData',i->'metadata');
  end loop;
  return id;
end $$;

create or replace function public.guard_comparative_checkpoint_v1() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare s jsonb; k text; v jsonb;
begin
  select compiled_lesson_snapshot into s from public.daily_assignments where id=new.daily_assignment_id;
  if s#>>'{route,routeId}' is distinct from 'comparative_superlative_word_lab' then return new; end if;
  if new.adapter_key is distinct from 'comparative_superlative_v1' or new.checkpoint_schema_version is distinct from 'comparative_progress_v1'
    or new.checkpoint_payload#>>'{state,assignmentKey}' is distinct from s#>>'{payload,resolvedLesson,assignmentKey}' then raise exception 'comparative checkpoint invalid'; end if;
  if tg_op='UPDATE' then
    if old.checkpoint_payload#>'{state,finished}'='true'::jsonb and old.checkpoint_payload is distinct from new.checkpoint_payload then raise exception 'comparative completed progress locked'; end if;
    for k,v in select * from jsonb_each(old.checkpoint_payload#>'{state,coverAttempts}') loop
      if new.checkpoint_payload#>'{state,coverAttempts}'->k is distinct from v then raise exception 'comparative cover answer locked'; end if;
    end loop;
    for k,v in select * from jsonb_each(old.checkpoint_payload#>'{state,dictationChecked}') loop
      if v='true'::jsonb and ((new.checkpoint_payload#>'{state,dictationChecked}'->k) is distinct from v or (new.checkpoint_payload#>'{state,dictationValues}'->k) is distinct from (old.checkpoint_payload#>'{state,dictationValues}'->k)) then raise exception 'comparative paired answers locked'; end if;
    end loop;
  end if;
  return new;
end $$;
create trigger comparative_checkpoint_answer_lock before insert or update on public.adle_specialist_stage_checkpoints for each row execute function public.guard_comparative_checkpoint_v1();

revoke all on function public.publish_adle_comparative_package_v1(jsonb,text,text),public.assert_adle_comparative_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid),public.append_adle_comparative_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb),public.persist_adle_comparative_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.publish_adle_comparative_package_v1(jsonb,text,text),public.assert_adle_comparative_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid),public.append_adle_comparative_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb),public.persist_adle_comparative_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) to service_role;
commit;
