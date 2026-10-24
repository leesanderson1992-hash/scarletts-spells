-- Contextual-choice route. Guided practice is frozen for replay; only the
-- independently selected canonical word in each complete sentence is evidence.
begin;

create function public.adle_homophone_contextual_snapshot_valid_v3(p jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare q jsonb; s jsonb; member jsonb; n integer;
begin
  if jsonb_typeof(p) is distinct from 'object'
    or p->>'schemaVersion'<>'1' or p->>'snapshotSchemaVersion'<>'3'
    or p#>>'{route,routeId}'<>'homophone_contextual_choice'
    or p#>>'{route,routeVersion}'<>'v1'
    or p#>>'{recipe,recipeKey}'<>'homophone_contextual_choice'
    or p#>>'{recipe,recipeVersion}'<>'v1'
    or p#>>'{payload,kind}'<>'homophone_contextual_lesson_v1'
    or p#>>'{payload,version}'<>'1'
    or coalesce(p->>'microSkillKey','') !~ '^D4_HOM_'
    or p#>>'{guidedLesson,microSkillKey}' is distinct from p->>'microSkillKey'
    or p#>>'{contextCheck,microSkillKey}' is distinct from p->>'microSkillKey'
    or p#>>'{contextCheck,route,routeId}'<>'homophone_contextual_choice'
    or jsonb_typeof(p->'selectedSets') is distinct from 'array'
    or jsonb_array_length(p->'selectedSets') not between 1 and 3
    or jsonb_typeof(p#>'{contextCheck,selectedSets}') is distinct from 'array'
    or jsonb_array_length(p#>'{contextCheck,selectedSets}')<>jsonb_array_length(p->'selectedSets')
    or jsonb_typeof(p#>'{contextCheck,questions}') is distinct from 'array'
    or jsonb_array_length(p#>'{contextCheck,questions}') not between 2 and 9
    or jsonb_array_length(p#>'{contextCheck,questions}')<>(p#>>'{assignment,itemCount}')::integer
    or p#>>'{assignment,generationSource}'<>'adle_composer_v1'
    or p->>'sourceFingerprint' !~ '^[a-f0-9]{64}$'
    or p#>>'{provenance,sourceFingerprint}' is distinct from p->>'sourceFingerprint'
    or public.adle_generic_snapshot_json_sha256_v1(p-'sourceFingerprint'-'provenance')<>p->>'sourceFingerprint'
    or (select count(distinct value->>'setKey') from jsonb_array_elements(p->'selectedSets'))
      <>jsonb_array_length(p->'selectedSets')
    or (select count(distinct value->>'questionId') from jsonb_array_elements(p#>'{contextCheck,questions}'))
      <>jsonb_array_length(p#>'{contextCheck,questions}')
  then return false; end if;
  n:=0;
  for s in select value from jsonb_array_elements(p#>'{contextCheck,selectedSets}') loop
    n:=n+1;
    if p->'selectedSets'->(n-1) is distinct from jsonb_build_object(
      'setKey',s->>'setKey','revision',(s->>'revision')::integer,
      'semanticFingerprint',s->>'semanticFingerprint')
      or s->>'semanticFingerprint' !~ '^[a-f0-9]{64}$'
      or jsonb_array_length(s->'members') not between 2 and 3
      or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(s->'members'))
        <>jsonb_array_length(s->'members')
    then return false; end if;
    for member in select value from jsonb_array_elements(s->'members') loop
      if nullif(member->>'word','') is null or nullif(member->>'intendedSense','') is null
        or nullif(member->>'grammaticalRole','') is null
        or nullif(member->>'teachingSentence','') is null
        or not exists(select 1 from jsonb_array_elements(p#>'{contextCheck,questions}') x
          where x.value->>'setId'=s->>'setId'
            and x.value->>'correctWordId'=member->>'canonicalWordId')
      then return false; end if;
    end loop;
  end loop;
  for q in select value from jsonb_array_elements(p#>'{contextCheck,questions}') loop
    if q->>'evidenceMode'<>'independent_sentence'
      or (select count(*) from regexp_matches(q->>'sentenceWithBlank','____','g'))<>1
      or not exists(select 1 from jsonb_array_elements(p#>'{contextCheck,selectedSets}') x
        where x.value->>'setId'=q->>'setId'
          and exists(select 1 from jsonb_array_elements(x.value->'members') w
            where w.value->>'canonicalWordId'=q->>'correctWordId')
          and (select jsonb_agg(w.value->>'canonicalWordId' order by w.ordinality)
            from jsonb_array_elements(x.value->'members') with ordinality w)
            =(select jsonb_agg(o.value#>>'{}' order by o.ordinality)
              from jsonb_array_elements(q->'optionWordIds') with ordinality o))
    then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function public.adle_lesson_snapshot_is_structurally_valid(p_snapshot jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select case p_snapshot->>'snapshotSchemaVersion' when '3' then case p_snapshot#>>'{route,routeId}'
  when 'generic_composer' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'compound_word_lab' then public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_affix_word_lab' then public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_prefix_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'base_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'comparative_superlative_word_lab' then public.adle_comparative_snapshot_valid_v3(p_snapshot)
  when 'ing_endings_word_lab' then public.adle_ing_snapshot_valid_v3(p_snapshot)
  when 'homophone_word_lab' then public.adle_homophone_snapshot_valid_v3(p_snapshot)
  when 'homophone_contextual_choice' then public.adle_homophone_contextual_snapshot_valid_v3(p_snapshot)
  when 'weak_vowel_word_lab' then public.adle_weak_vowel_snapshot_valid_v3(p_snapshot)
  else false end else false end $$;

create function public.assert_adle_homophone_contextual_assignment_v1(
  p_snapshot jsonb,p_metadata jsonb,p_items jsonb,p_child uuid,p_parent uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.adle_route_activation_revisions%rowtype; projection jsonb;
  selected jsonb; source_set jsonb; member jsonb; item jsonb; question jsonb; idx integer:=0;
begin
  if not public.adle_homophone_contextual_snapshot_valid_v3(p_snapshot)
    or not public.adle_lesson_route_metadata_is_valid_v2(p_metadata)
    or p_metadata#>>'{route,routeId}'<>'homophone_contextual_choice'
    or p_metadata#>>'{route,routeVersion}'<>'v1'
    or p_metadata#>>'{recipe,recipeKey}'<>'homophone_contextual_choice'
    or p_metadata#>>'{payload,kind}'<>'homophone_contextual_lesson_v1'
    or p_metadata#>>'{payload,version}'<>'1'
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items)<>jsonb_array_length(p_snapshot#>'{contextCheck,questions}')
  then raise exception 'contextual homophone assignment contract invalid'; end if;
  select * into strict r from public.adle_route_activation_revisions
    where id=(p_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid;
  if r.route_id<>'homophone_contextual_choice' or r.route_version<>'v1'
    or r.activation_route_key<>'homophone_contextual_choice:v1'
    or r.micro_skill_key<>p_snapshot->>'microSkillKey'
    or not public.adle_release_activation_allows_child_v2(r.id,p_child)
    or not public.adle_route_activation_revision_is_current_v2(r.id,r.release_manifest_id,
      p_metadata#>>'{curriculumRelease,releaseManifestSha256}',
      p_metadata#>>'{curriculumRelease,dependencyFingerprint}')
  then raise exception 'contextual homophone activation changed'; end if;
  select a.semantic_projection into strict projection
    from public.adle_curriculum_release_dependencies d
    join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where d.release_manifest_id=r.release_manifest_id and d.micro_skill_key=r.micro_skill_key
      and d.authority_type='homophone_contextual_content';
  if projection->>'microSkillKey' is distinct from p_snapshot->>'microSkillKey'
    or projection#>>'{content,contentVersion}' is distinct from p_snapshot#>>'{contextCheck,contentVersion}'
    or projection#>>'{content,approvalReference}' is distinct from p_snapshot#>>'{contextCheck,approvalReference}'
    or projection#>>'{content,teachingExplanation}' is distinct from p_snapshot#>>'{contextCheck,teachingExplanation}'
  then raise exception 'contextual homophone release content mismatch'; end if;
  for selected in select value from jsonb_array_elements(p_snapshot#>'{contextCheck,selectedSets}') loop
    select value into source_set from jsonb_array_elements(projection#>'{content,sets}')
      where value->>'setKey'=selected->>'setKey';
    if source_set is null
      or selected is distinct from jsonb_build_object('setId',source_set->>'setId',
        'setKey',source_set->>'setKey','revision',(source_set->>'revision')::integer,
        'semanticFingerprint',source_set->>'semanticFingerprint',
        'relationKind',source_set->>'relationKind','members',source_set->'members')
      or not exists(select 1 from public.homophone_contrast_sets live
        where live.set_key=selected->>'setKey' and live.revision=(selected->>'revision')::integer
          and live.micro_skill_key=r.micro_skill_key and live.review_status='approved'
          and live.semantic_fingerprint=selected->>'semanticFingerprint')
    then raise exception 'contextual homophone selected set changed'; end if;
    for member in select value from jsonb_array_elements(selected->'members') loop
      if not exists(select 1 from public.homophone_contrast_set_members x
        join public.canonical_teaching_dictionary_words w on w.id=x.canonical_word_id
        where x.set_key=selected->>'setKey' and x.revision=(selected->>'revision')::integer
          and x.canonical_word_id=(member->>'canonicalWordId')::uuid
          and replace(w.normalised_word,'’','''')=member->>'word'
          and w.row_status='active' and w.review_status='approved_for_first_exposure'
          and w.dialect_code='en-GB')
      then raise exception 'contextual homophone dictionary member changed'; end if;
    end loop;
  end loop;
  if (select jsonb_agg(q.value order by q.ordinality)
      from jsonb_array_elements(projection#>'{content,questions}') with ordinality q
      where exists(select 1 from jsonb_array_elements(p_snapshot#>'{contextCheck,selectedSets}') s
        where s.value->>'setId'=q.value->>'setId'))
    is distinct from p_snapshot#>'{contextCheck,questions}'
  then raise exception 'contextual homophone questions changed'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    idx:=idx+1;
    question:=p_snapshot#>'{contextCheck,questions}'->(idx-1);
    if item->>'childId'<>p_child::text or item->>'parentUserId'<>p_parent::text
      or item->>'sourceType'<>'adle_composer'
      or item->>'position'<>idx::text
      or item->>'templateKey'<>'HOMOPHONE_CONTEXT_SENTENCE_CHOICE'
      or item#>>'{metadata,sectionKey}'<>'lesson_context_choice'
      or item#>>'{metadata,microSkillKey}'<>r.micro_skill_key
      or item#>>'{metadata,canonicalWordId}'<>question->>'correctWordId'
      or item#>>'{promptData,questionId}'<>question->>'questionId'
      or item#>>'{promptData,setId}'<>question->>'setId'
      or item#>>'{promptData,sentenceWithBlank}'<>question->>'sentenceWithBlank'
      or item#>'{promptData,optionWordIds}' is distinct from question->'optionWordIds'
      or not exists(select 1 from jsonb_array_elements(p_snapshot#>'{contextCheck,selectedSets}') s,
        jsonb_array_elements(s.value->'members') w
        where w.value->>'canonicalWordId'=question->>'correctWordId'
          and w.value->>'word'=item->>'targetWord')
    then raise exception 'contextual homophone assignment item mismatch'; end if;
    if nullif(item#>>'{metadata,adleLearningItemRef}','') is not null
      and not exists(select 1 from public.adle_learning_items li
        where li.id=(item#>>'{metadata,adleLearningItemRef}')::uuid
          and li.child_id=p_child and li.micro_skill_key=r.micro_skill_key
          and li.canonical_word_id=(question->>'correctWordId')::uuid
          and li.row_status='active' and li.item_status in ('pending','pending_reteach'))
    then raise exception 'contextual homophone learning item lineage invalid'; end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(p_items) x
    where nullif(x.value#>>'{metadata,adleLearningItemRef}','') is not null)
  then raise exception 'contextual homophone requires a queued item'; end if;
end $$;

create function public.append_adle_homophone_contextual_stage_r6(
  p_daily_assignment_id uuid,p_snapshot jsonb,p_items jsonb,p_intakes jsonb,
  p_lesson_route_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare h public.daily_assignments%rowtype; result jsonb; s jsonb; idx integer:=0;
begin
  select * into strict h from public.daily_assignments where id=p_daily_assignment_id for update;
  if p_intakes<>'[]'::jsonb then raise exception 'contextual homophone cannot create needs'; end if;
  if h.compiled_lesson_snapshot is null then
    perform public.assert_adle_homophone_contextual_assignment_v1(
      p_snapshot,p_lesson_route_metadata,p_items,h.child_id,h.parent_user_id);
  end if;
  result:=public.append_adle_specialist_stage_r6(
    p_daily_assignment_id,p_snapshot,p_items,p_intakes,p_lesson_route_metadata);
  for s in select value from jsonb_array_elements(p_snapshot->'selectedSets') loop
    idx:=idx+1;
    insert into public.homophone_assignment_contrast_sets(
      assignment_id,selected_ordinal,set_key,revision,semantic_fingerprint)
    values(p_daily_assignment_id,idx,s->>'setKey',(s->>'revision')::integer,s->>'semanticFingerprint')
    on conflict(assignment_id,selected_ordinal) do nothing;
  end loop;
  return result;
end $$;

create function public.persist_adle_homophone_contextual_daily_plan_v1(
  p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_header jsonb,
  p_items jsonb,p_intakes jsonb,p_snapshot jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid; previous jsonb; item jsonb; selected jsonb; idx integer:=0;
begin
  if p_intakes<>'[]'::jsonb or p_header->>'childId'<>p_child_id::text
    or p_header->>'parentUserId'<>p_parent_user_id::text
    or p_header->>'assignmentDate'<>p_plan_date::text
    or not exists(select 1 from public.children c where c.id=p_child_id
      and c.parent_user_id=p_parent_user_id and not coalesce(c.is_archived,false))
  then raise exception 'contextual homophone ownership invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_child_id::text||':'||p_plan_date::text||':ADLE Daily Plan',0));
  select daily_assignments.id,compiled_lesson_snapshot into id,previous
    from public.daily_assignments where child_id=p_child_id and parent_user_id=p_parent_user_id
      and assignment_date=p_plan_date and title='ADLE Daily Plan';
  if id is not null then
    if previous#>>'{provenance,sourceFingerprint}' is distinct from
      p_snapshot#>>'{provenance,sourceFingerprint}'
    then raise exception 'contextual homophone idempotency conflict'; end if;
    return id;
  end if;
  perform public.assert_adle_homophone_contextual_assignment_v1(
    p_snapshot,p_header->'lessonRouteMetadata',p_items,p_child_id,p_parent_user_id);
  insert into public.daily_assignments(child_id,parent_user_id,assignment_date,title,status,
    target_words,review_words,assignment_generation_source,lesson_route_metadata,
    compiled_lesson_snapshot)
  values(p_child_id,p_parent_user_id,p_plan_date,'ADLE Daily Plan','pending',
    array(select jsonb_array_elements_text(p_header->'targetWords')),array[]::text[],
    'adle_composer_v1',p_header->'lessonRouteMetadata',p_snapshot)
  returning daily_assignments.id into id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.assignment_items(daily_assignment_id,child_id,parent_user_id,
      domain_module,item_type,source_type,source_entity_id,template_key,target_word,
      position,status,prompt_data,metadata)
    values(id,p_child_id,p_parent_user_id,'spelling',item->>'itemType','adle_composer',
      item->>'sourceEntityId',item->>'templateKey',item->>'targetWord',
      (item->>'position')::integer,'ready',item->'promptData',item->'metadata');
  end loop;
  for selected in select value from jsonb_array_elements(p_snapshot->'selectedSets') loop
    idx:=idx+1;
    insert into public.homophone_assignment_contrast_sets(
      assignment_id,selected_ordinal,set_key,revision,semantic_fingerprint)
    values(id,idx,selected->>'setKey',(selected->>'revision')::integer,
      selected->>'semanticFingerprint');
  end loop;
  return id;
end $$;

revoke all on function public.adle_homophone_contextual_snapshot_valid_v3(jsonb),
  public.assert_adle_homophone_contextual_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid),
  public.append_adle_homophone_contextual_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb),
  public.persist_adle_homophone_contextual_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.adle_homophone_contextual_snapshot_valid_v3(jsonb),
  public.assert_adle_homophone_contextual_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid),
  public.append_adle_homophone_contextual_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb),
  public.persist_adle_homophone_contextual_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)
  to service_role;
commit;
