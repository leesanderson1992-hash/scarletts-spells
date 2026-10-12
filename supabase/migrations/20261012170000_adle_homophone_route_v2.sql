-- Inactive by default: this migration adds the route contract, not an activation revision.
begin;

alter table public.adle_curriculum_dependency_authorities drop constraint adle_curriculum_dependency_authorities_type_check;
alter table public.adle_curriculum_dependency_authorities add constraint adle_curriculum_dependency_authorities_type_check
  check (authority_type in ('family_membership','compound_structure','adjective_degree_families','ing_word_members','teaching_content','teaching_dictionary_closure','homophone_lesson_content'));
alter table public.adle_curriculum_release_dependencies drop constraint adle_curriculum_release_dependencies_type_check;
alter table public.adle_curriculum_release_dependencies add constraint adle_curriculum_release_dependencies_type_check
  check (authority_type in ('family_membership','compound_structure','adjective_degree_families','ing_word_members','teaching_content','teaching_dictionary_closure','homophone_lesson_content'));

create or replace function public.adle_homophone_snapshot_valid_v3(p jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare l jsonb:=p#>'{payload,resolvedLesson,lesson}'; n integer; a jsonb; w jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(l) is distinct from 'object'
    or jsonb_typeof(l->'words') is distinct from 'array' or jsonb_typeof(p->'activities') is distinct from 'array'
    or jsonb_typeof(p->'words') is distinct from 'array' then return false; end if;
  n:=jsonb_array_length(l->'words');
  if p->>'snapshotSchemaVersion'<>'3' or p#>>'{route,routeId}'<>'homophone_word_lab' or p#>>'{route,routeVersion}'<>'v2'
    or p#>>'{recipe,recipeKey}'<>'homophone_word_lab' or p#>>'{recipe,recipeVersion}'<>'v2'
    or p#>>'{payload,kind}'<>'homophone_lesson_v2' or p#>>'{payload,version}'<>'2'
    or p#>>'{runtime,adapterKey}'<>'homophone_v2' or p#>>'{runtime,rendererKey}'<>'homophone_guided'
    or p#>>'{payload,resolvedLesson,contentVersion}'<>'d4-hom-v4'
    or p#>>'{payload,resolvedLesson,contentSha256}'<>'b425ccf1f9a3bf013015749e10203837687cc099888b20e6dc0bc40b2be0a92a'
    or p#>>'{taxonomy,microSkillKey}'<>l->>'microSkillKey' or n not between 2 and 4
    or (p#>>'{assignment,itemCount}')::integer<>12+n or jsonb_array_length(p->'words')<>n
    or jsonb_array_length(p->'activities')<>7+n or jsonb_array_length(l->'binSort')<>4
    or jsonb_array_length(l->'balloonPrompts')<>20 or jsonb_array_length(l->'coverCheck')<>n
    or jsonb_array_length(l->'dictationPassages')<>3 or jsonb_array_length(p->'contentVersions')<>4
    or (select count(distinct value->>'word') from jsonb_array_elements(l->'words'))<>n
    or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(p->'words'))<>n
    or public.adle_generic_snapshot_json_sha256_v1(p#-'{provenance,sourceFingerprint}')<>p#>>'{provenance,sourceFingerprint}' then return false; end if;
  for w in select value from jsonb_array_elements(l->'words') loop
    if nullif(btrim(w->>'word'),'') is null or nullif(btrim(w->>'memoryCue'),'') is null
      or nullif(btrim(w->>'feedbackReason'),'') is null
      or not exists(select 1 from jsonb_array_elements(l->'coverCheck') c where c.value#>>'{}'=w->>'word')
      or not exists(select 1 from jsonb_array_elements(l->'balloonPrompts') b where b.value->>'answer'=w->>'word')
      or not exists(select 1 from jsonb_array_elements(l->'dictationPassages') d,jsonb_array_elements(d.value->'targets') t where t.value#>>'{}'=w->>'word') then return false; end if;
  end loop;
  for a in select value from jsonb_array_elements(p->'activities') loop
    if concat(a#>>'{canonical,concept}','.',a#>>'{canonical,mode}','@',a#>>'{canonical,contractVersion}') not in
      ('INTRODUCTION.teaching_page@1','MEANING_SORT.sentence_choice@1','BALLOON_POP.timed_sentence_choice@1','COVER_CHECK.whole_word@1','DICTATION.two_word_gaps@1','LESSON_REFLECTION.standard_lesson_reflection@1') then return false; end if;
  end loop;
  return (select count(*)=12+n and count(*)=count(distinct b.value->>'sourceEntityId')
    from jsonb_array_elements(p->'activities') a,jsonb_array_elements(a.value->'itemBindings') b);
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
  else false end else false end $$;

create or replace function public.assert_adle_homophone_assignment_v2(p_snapshot jsonb,p_metadata jsonb,p_items jsonb,p_child uuid,p_parent uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.adle_route_activation_revisions%rowtype; projection jsonb; w jsonb;
begin
  if not public.adle_homophone_snapshot_valid_v3(p_snapshot) or not public.adle_lesson_route_metadata_is_valid_v2(p_metadata)
    or p_metadata#>>'{route,routeId}' is distinct from 'homophone_word_lab'
    or p_metadata#>>'{route,routeVersion}' is distinct from 'v2'
    or p_metadata#>>'{payload,kind}' is distinct from 'homophone_lesson_v2'
    or p_metadata#>>'{payload,version}' is distinct from '2'
    or jsonb_array_length(p_items)<>(p_snapshot#>>'{assignment,itemCount}')::integer then raise exception 'homophone assignment contract invalid'; end if;
  select * into strict r from public.adle_route_activation_revisions where id=(p_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid;
  if r.route_id<>'homophone_word_lab' or r.route_version<>'v2' or r.activation_route_key<>'homophone_word_lab:v2'
    or r.micro_skill_key<>p_snapshot#>>'{taxonomy,microSkillKey}' or not public.adle_release_activation_allows_child_v2(r.id,p_child)
    or not public.adle_route_activation_revision_is_current_v2(r.id,r.release_manifest_id,
      p_metadata#>>'{curriculumRelease,releaseManifestSha256}',p_metadata#>>'{curriculumRelease,dependencyFingerprint}')
    then raise exception 'homophone activation changed'; end if;
  select a.semantic_projection into strict projection from public.adle_curriculum_release_dependencies d
    join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where d.release_manifest_id=r.release_manifest_id and d.micro_skill_key=r.micro_skill_key and d.authority_type='homophone_lesson_content';
  if projection->'lesson' is distinct from p_snapshot#>'{payload,resolvedLesson,lesson}'
    or projection->>'contentVersion' is distinct from p_snapshot#>>'{payload,resolvedLesson,contentVersion}'
    or projection->>'contentSha256' is distinct from p_snapshot#>>'{payload,resolvedLesson,contentSha256}'
    or jsonb_array_length(projection->'canonicalWords')<>jsonb_array_length(p_snapshot->'words') then raise exception 'homophone approved content mismatch'; end if;
  for w in select value from jsonb_array_elements(p_snapshot->'words') loop
    if not exists(select 1 from jsonb_array_elements(projection->'canonicalWords') c where c.value->>'word'=w->>'displayWord' and c.value->>'canonicalWordId'=w->>'canonicalWordId')
      or not exists(select 1 from public.canonical_teaching_dictionary_words d where d.id=(w->>'canonicalWordId')::uuid and d.display_word=w->>'displayWord' and d.row_status='active' and d.review_status='approved_for_first_exposure' and d.dialect_code='en-GB')
      then raise exception 'homophone word outside reviewed set'; end if;
    if w->>'learningItemId' is not null and not exists(select 1 from public.adle_learning_items i where i.id=(w->>'learningItemId')::uuid and i.child_id=p_child and i.canonical_word_id=(w->>'canonicalWordId')::uuid and i.micro_skill_key=r.micro_skill_key and i.row_status='active' and i.item_status in ('pending','pending_reteach')) then raise exception 'homophone learning item lineage invalid'; end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(p_snapshot->'words') w where w.value->>'learningItemId' is not null)
    or exists(select 1 from jsonb_array_elements(p_items) i where i.value->>'childId'<>p_child::text or i.value->>'parentUserId'<>p_parent::text or i.value->>'sourceType'<>'adle_composer')
    or exists(with bindings as(select a.value activity,b.value binding from jsonb_array_elements(p_snapshot->'activities') a,jsonb_array_elements(a.value->'itemBindings') b)
      select 1 from bindings full join jsonb_array_elements(p_items) i on i.value->>'sourceEntityId'=bindings.binding->>'sourceEntityId'
      where i.value is null or bindings.binding is null or i.value->>'position'<>bindings.binding->>'position'
        or i.value#>>'{promptData,homophoneActivityId}'<>bindings.activity->>'activityId')
    then raise exception 'homophone assignment item binding mismatch'; end if;
end $$;

create or replace function public.append_adle_homophone_stage_r6(p_daily_assignment_id uuid,p_snapshot jsonb,p_items jsonb,p_intakes jsonb,p_lesson_route_metadata jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare h public.daily_assignments%rowtype;
begin
  select * into strict h from public.daily_assignments where id=p_daily_assignment_id for update;
  if p_intakes<>'[]'::jsonb then raise exception 'homophone lesson cannot create needs'; end if;
  if h.compiled_lesson_snapshot is null then perform public.assert_adle_homophone_assignment_v2(p_snapshot,p_lesson_route_metadata,p_items,h.child_id,h.parent_user_id); end if;
  return public.append_adle_specialist_stage_r6(p_daily_assignment_id,p_snapshot,p_items,p_intakes,p_lesson_route_metadata);
end $$;

create or replace function public.persist_adle_homophone_daily_plan_v3(p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_header jsonb,p_items jsonb,p_intakes jsonb,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid; previous jsonb; i jsonb;
begin
  if p_intakes<>'[]'::jsonb or p_header->>'childId'<>p_child_id::text or p_header->>'parentUserId'<>p_parent_user_id::text or p_header->>'assignmentDate'<>p_plan_date::text
    or not exists(select 1 from public.children where children.id=p_child_id and parent_user_id=p_parent_user_id and not coalesce(is_archived,false)) then raise exception 'homophone ownership invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_child_id::text||':'||p_plan_date::text||':ADLE Daily Plan',0));
  select daily_assignments.id,compiled_lesson_snapshot into id,previous from public.daily_assignments where child_id=p_child_id and parent_user_id=p_parent_user_id and assignment_date=p_plan_date and title='ADLE Daily Plan';
  if id is not null then if previous#>>'{provenance,sourceFingerprint}' is distinct from p_snapshot#>>'{provenance,sourceFingerprint}' then raise exception 'homophone idempotency conflict'; end if; return id; end if;
  perform public.assert_adle_homophone_assignment_v2(p_snapshot,p_header->'lessonRouteMetadata',p_items,p_child_id,p_parent_user_id);
  insert into public.daily_assignments(child_id,parent_user_id,assignment_date,title,status,target_words,review_words,assignment_generation_source,lesson_route_metadata,compiled_lesson_snapshot)
  values(p_child_id,p_parent_user_id,p_plan_date,'ADLE Daily Plan','pending',array(select jsonb_array_elements_text(p_header->'targetWords')),array[]::text[],'adle_composer_v1',p_header->'lessonRouteMetadata',p_snapshot) returning daily_assignments.id into id;
  for i in select value from jsonb_array_elements(p_items) loop
    insert into public.assignment_items(daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,source_entity_id,template_key,target_word,position,status,prompt_data,metadata)
    values(id,p_child_id,p_parent_user_id,'spelling',i->>'itemType','adle_composer',i->>'sourceEntityId',i->>'templateKey',i->>'targetWord',(i->>'position')::integer,'ready',i->'promptData',i->'metadata');
  end loop;
  return id;
end $$;

create or replace function public.guard_homophone_checkpoint_v2() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare s jsonb; k text; v jsonb;
begin
  select compiled_lesson_snapshot into s from public.daily_assignments where id=new.daily_assignment_id;
  if s#>>'{route,routeId}' is distinct from 'homophone_word_lab' then return new; end if;
  if new.adapter_key is distinct from 'homophone_v2' or new.checkpoint_schema_version is distinct from 'homophone_progress_v1'
    or new.lesson_snapshot_fingerprint is distinct from s#>>'{provenance,sourceFingerprint}'
    or jsonb_typeof(new.checkpoint_payload->'state') is distinct from 'object' then raise exception 'homophone checkpoint invalid'; end if;
  if tg_op='INSERT' and new.checkpoint_payload#>'{state,completed}' is distinct from 'false'::jsonb then raise exception 'homophone checkpoint invalid'; end if;
  if tg_op='UPDATE' then
    if (old.checkpoint_payload#>'{state,binSortCompleted}'='true'::jsonb and new.checkpoint_payload#>'{state,binSortCompleted}' is distinct from 'true'::jsonb)
      or (old.checkpoint_payload#>'{state,balloonCompleted}'='true'::jsonb and new.checkpoint_payload#>'{state,balloonCompleted}' is distinct from 'true'::jsonb)
      then raise exception 'homophone guided completion locked'; end if;
    if new.checkpoint_payload#>'{state,completed}'='true'::jsonb and
      (old.checkpoint_payload#>'{state,completed}' is distinct from 'false'::jsonb
        or new.checkpoint_payload is distinct from jsonb_set(old.checkpoint_payload,'{state,completed}','true'::jsonb)
        or new.completed_at is null) then raise exception 'homophone checkpoint completion invalid'; end if;
    if old.checkpoint_payload#>'{state,completed}'='true'::jsonb and old.checkpoint_payload is distinct from new.checkpoint_payload then raise exception 'homophone completed progress locked'; end if;
    for k,v in select * from jsonb_each(old.checkpoint_payload#>'{state,coverAttempts}') loop
      if new.checkpoint_payload#>'{state,coverAttempts}'->k is distinct from v then raise exception 'homophone cover answer locked'; end if;
    end loop;
    for k,v in select * from jsonb_each(old.checkpoint_payload#>'{state,dictationChecked}') loop
      if v='true'::jsonb and (new.checkpoint_payload#>'{state,dictationChecked}'->k is distinct from v
        or new.checkpoint_payload#>'{state,dictationValues}'->k is distinct from old.checkpoint_payload#>'{state,dictationValues}'->k) then raise exception 'homophone dictation answer locked'; end if;
    end loop;
    if jsonb_array_length(new.checkpoint_payload#>'{state,choiceMistakes}')<jsonb_array_length(old.checkpoint_payload#>'{state,choiceMistakes}')
      or exists(select 1 from jsonb_array_elements(old.checkpoint_payload#>'{state,choiceMistakes}') with ordinality o(value,idx)
        where new.checkpoint_payload#>'{state,choiceMistakes}'->(o.idx-1)::integer is distinct from o.value) then raise exception 'homophone guided mistakes locked'; end if;
  end if;
  return new;
end $$;
create trigger homophone_checkpoint_answer_lock before insert or update on public.adle_specialist_stage_checkpoints
for each row execute function public.guard_homophone_checkpoint_v2();

revoke all on function public.assert_adle_homophone_assignment_v2(jsonb,jsonb,jsonb,uuid,uuid),public.append_adle_homophone_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb),public.persist_adle_homophone_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.assert_adle_homophone_assignment_v2(jsonb,jsonb,jsonb,uuid,uuid),public.append_adle_homophone_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb),public.persist_adle_homophone_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) to service_role;
commit;
