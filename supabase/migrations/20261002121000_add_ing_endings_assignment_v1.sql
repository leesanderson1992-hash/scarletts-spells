begin;

create or replace function public.assert_adle_ing_assignment_v1(p_snapshot jsonb,p_metadata jsonb,p_items jsonb,p_child uuid,p_parent uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare w jsonb; t jsonb; r public.adle_route_activation_revisions%rowtype; members jsonb;
begin
  if not public.adle_ing_snapshot_valid_v3(p_snapshot) or not public.adle_lesson_route_metadata_is_valid_v2(p_metadata)
    or p_metadata#>>'{route,routeId}' is distinct from 'ing_endings_word_lab'
    or jsonb_array_length(p_items)<>(p_snapshot#>>'{assignment,itemCount}')::integer then raise exception 'ing assignment contract invalid'; end if;
  select * into strict r from public.adle_route_activation_revisions where id=(p_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid;
  if r.route_id<>'ing_endings_word_lab' or r.route_version<>'v1' or r.micro_skill_key<>p_snapshot#>>'{taxonomy,microSkillKey}'
    or not public.adle_release_activation_allows_child_v2(r.id,p_child)
    or not public.adle_route_activation_revision_is_current_v2(r.id,r.release_manifest_id,p_metadata#>>'{curriculumRelease,releaseManifestSha256}',p_metadata#>>'{curriculumRelease,dependencyFingerprint}') then raise exception 'ing activation changed'; end if;
  select a.semantic_projection->'words' into strict members from public.adle_curriculum_release_dependencies d
    join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where d.release_manifest_id=r.release_manifest_id and d.micro_skill_key=r.micro_skill_key and d.authority_type='ing_word_members';
  for w in select value from jsonb_array_elements(p_snapshot#>'{payload,resolvedLesson,words}') loop
    if not exists(select 1 from jsonb_array_elements(members) member where member.value=w-'learningItemId') then raise exception 'ing word outside release'; end if;
  end loop;
  for t in select value from jsonb_array_elements(p_snapshot#>'{payload,resolvedLesson,queuedTargets}') loop
    if not exists(select 1 from public.adle_learning_items where id=(t->>'learningItemId')::uuid and child_id=p_child and canonical_word_id=(t->>'canonicalWordId')::uuid and micro_skill_key=r.micro_skill_key and row_status='active' and item_status in ('pending','pending_reteach')) then raise exception 'ing target lineage unavailable'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_items) i where i.value->>'childId'<>p_child::text or i.value->>'parentUserId'<>p_parent::text or i.value->>'sourceType'<>'adle_composer')
    or exists(with bindings as(select a.value activity,b.value binding from jsonb_array_elements(p_snapshot->'activities') a,jsonb_array_elements(a.value->'itemBindings') b)
      select 1 from bindings full join jsonb_array_elements(p_items) i on i.value->>'sourceEntityId'=bindings.binding->>'sourceEntityId'
      where i.value is null or bindings.binding is null or i.value->>'position'<>bindings.binding->>'position' or i.value#>>'{promptData,ingActivityId}'<>bindings.activity->>'activityId') then raise exception 'ing item binding mismatch'; end if;
end $$;

create or replace function public.append_adle_ing_stage_r6(p_daily_assignment_id uuid,p_snapshot jsonb,p_items jsonb,p_intakes jsonb,p_lesson_route_metadata jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare h public.daily_assignments%rowtype;
begin
  select * into strict h from public.daily_assignments where id=p_daily_assignment_id for update;
  if p_intakes<>'[]'::jsonb then raise exception 'ing companion practice cannot create needs'; end if;
  if h.compiled_lesson_snapshot is null then perform public.assert_adle_ing_assignment_v1(p_snapshot,p_lesson_route_metadata,p_items,h.child_id,h.parent_user_id); end if;
  return public.append_adle_specialist_stage_r6(p_daily_assignment_id,p_snapshot,p_items,p_intakes,p_lesson_route_metadata);
end $$;

create or replace function public.persist_adle_ing_daily_plan_v3(p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_header jsonb,p_items jsonb,p_intakes jsonb,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid; previous jsonb; i jsonb;
begin
  if p_intakes<>'[]'::jsonb or p_header->>'childId'<>p_child_id::text or p_header->>'parentUserId'<>p_parent_user_id::text or p_header->>'assignmentDate'<>p_plan_date::text
    or not exists(select 1 from public.children where children.id=p_child_id and parent_user_id=p_parent_user_id and not coalesce(is_archived,false)) then raise exception 'ing ownership invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_child_id::text||':'||p_plan_date::text||':ADLE Daily Plan',0));
  select daily_assignments.id,compiled_lesson_snapshot into id,previous from public.daily_assignments where child_id=p_child_id and parent_user_id=p_parent_user_id and assignment_date=p_plan_date and title='ADLE Daily Plan';
  if id is not null then if previous#>>'{provenance,sourceFingerprint}' is distinct from p_snapshot#>>'{provenance,sourceFingerprint}' then raise exception 'ing idempotency conflict'; end if; return id; end if;
  perform public.assert_adle_ing_assignment_v1(p_snapshot,p_header->'lessonRouteMetadata',p_items,p_child_id,p_parent_user_id);
  insert into public.daily_assignments(child_id,parent_user_id,assignment_date,title,status,target_words,review_words,assignment_generation_source,lesson_route_metadata,compiled_lesson_snapshot)
  values(p_child_id,p_parent_user_id,p_plan_date,'ADLE Daily Plan','pending',array(select jsonb_array_elements_text(p_header->'targetWords')),array[]::text[],'adle_composer_v1',p_header->'lessonRouteMetadata',p_snapshot) returning daily_assignments.id into id;
  for i in select value from jsonb_array_elements(p_items) loop
    insert into public.assignment_items(daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,source_entity_id,template_key,target_word,position,status,prompt_data,metadata)
    values(id,p_child_id,p_parent_user_id,'spelling',i->>'itemType','adle_composer',i->>'sourceEntityId',i->>'templateKey',i->>'targetWord',(i->>'position')::integer,'ready',i->'promptData',i->'metadata');
  end loop;
  return id;
end $$;

create or replace function public.guard_ing_checkpoint_v1() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare s jsonb; k text; v jsonb;
begin
  select compiled_lesson_snapshot into s from public.daily_assignments where id=new.daily_assignment_id;
  if s#>>'{route,routeId}' is distinct from 'ing_endings_word_lab' then return new; end if;
  if new.adapter_key is distinct from 'ing_endings_v1' or new.checkpoint_schema_version is distinct from 'ing_progress_v1'
    or new.checkpoint_payload#>>'{state,assignmentKey}' is distinct from s#>>'{payload,resolvedLesson,assignmentKey}' then raise exception 'ing checkpoint invalid'; end if;
  if tg_op='INSERT' and new.checkpoint_payload#>'{state,finished}' is distinct from 'false'::jsonb then raise exception 'ing checkpoint invalid'; end if;
  if tg_op='UPDATE' then
    if new.checkpoint_payload#>'{state,finished}'='true'::jsonb
      and (old.checkpoint_payload#>'{state,finished}' is distinct from 'false'::jsonb
        or new.checkpoint_payload is distinct from jsonb_set(old.checkpoint_payload,'{state,finished}','true'::jsonb)
        or new.completed_at is null) then raise exception 'ing checkpoint completion invalid'; end if;
    if old.checkpoint_payload#>'{state,finished}'='true'::jsonb and old.checkpoint_payload is distinct from new.checkpoint_payload then raise exception 'ing completed progress locked'; end if;
    for k,v in select * from jsonb_each(old.checkpoint_payload#>'{state,coverAttempts}') loop
      if new.checkpoint_payload#>'{state,coverAttempts}'->k is distinct from v then raise exception 'ing cover answer locked'; end if;
    end loop;
    for v in select value from jsonb_array_elements(old.checkpoint_payload#>'{state,dictationChecked}') loop
      k:=v#>>'{}';
      if not (new.checkpoint_payload#>'{state,dictationChecked}') ? k
        or new.checkpoint_payload#>'{state,dictationValues}'->k is distinct from old.checkpoint_payload#>'{state,dictationValues}'->k then raise exception 'ing dictation answer locked'; end if;
    end loop;
  end if;
  return new;
end $$;
create trigger ing_checkpoint_answer_lock before insert or update on public.adle_specialist_stage_checkpoints for each row execute function public.guard_ing_checkpoint_v1();

revoke all on function public.publish_adle_ing_package_v1(jsonb,text,text),public.assert_adle_ing_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid),public.append_adle_ing_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb),public.persist_adle_ing_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.publish_adle_ing_package_v1(jsonb,text,text),public.assert_adle_ing_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid),public.append_adle_ing_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb),public.persist_adle_ing_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) to service_role;
commit;
