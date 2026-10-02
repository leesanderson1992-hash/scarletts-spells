begin;

-- Keep already frozen six-gap snapshots valid while accepting the reviewed
-- four-gap/four-cleaver sequence for newly compiled comparative lessons.
create or replace function public.adle_comparative_snapshot_valid_v3(p jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare l jsonb:=p#>'{payload,resolvedLesson}'; n integer; expected_count integer; a jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(l) is distinct from 'object'
    or not (p ?& array['snapshotSchemaVersion','compilerVersion','validatorVersion','canonicalContractRegistryVersion','route','recipe','payload','runtime','assignment','taxonomy','words','activities','segments','contentVersions','provenance'])
    or not (l ?& array['schemaVersion','routeKey','microSkillKey','assignmentKey','authority','families','words','queuedTargets','sentenceTasks','cleaverTasks','dictationTasks','teaching','reflectionPrompt']) then return false; end if;
  n:=jsonb_array_length(l->'queuedTargets');
  if l->>'taskSequenceVersion'='2' then
    expected_count:=22;
    if jsonb_array_length(l->'sentenceTasks')<>4 or jsonb_array_length(l->'cleaverTasks')<>4 then return false; end if;
  elsif not (l ? 'taskSequenceVersion') then
    expected_count:=20+n;
    if jsonb_array_length(l->'sentenceTasks')<>6 or jsonb_array_length(l->'cleaverTasks')<>n then return false; end if;
  else return false; end if;
  if p->>'snapshotSchemaVersion'<>'3' or p#>>'{route,routeId}'<>'comparative_superlative_word_lab' or p#>>'{route,routeVersion}'<>'v1'
    or p#>>'{payload,kind}'<>'comparative_superlative_lesson_v1' or p#>>'{payload,version}'<>'1' or p#>>'{runtime,adapterKey}'<>'comparative_superlative_v1'
    or l->>'authority'<>'reviewed_content' or l->>'routeKey'<>'comparative_superlative_word_lab:v1'
    or n not between 2 and 4 or (p#>>'{assignment,itemCount}')::integer<>expected_count
    or jsonb_array_length(l->'families')<>2 or l#>>'{families,0,familyKey}'=l#>>'{families,1,familyKey}'
    or exists(select 1 from jsonb_array_elements(l->'families') f where not public.adle_degree_family_valid_v1(f.value) or f.value->>'microSkillKey'<>l->>'microSkillKey')
    or jsonb_array_length(l->'words')<>6 or jsonb_array_length(l->'dictationTasks')<>2
    or jsonb_array_length(p->'contentVersions')<>7
    or public.adle_generic_snapshot_json_sha256_v1(p#-'{provenance,sourceFingerprint}')<>p#>>'{provenance,sourceFingerprint}' then return false; end if;
  for a in select value from jsonb_array_elements(p->'activities') loop
    if concat(a#>>'{canonical,concept}','.',a#>>'{canonical,mode}','@',a#>>'{canonical,contractVersion}') not in ('INTRODUCTION.teaching_page@1','WORD_ASSEMBLY.sentence_suffix@1','MEANING_SORT.meaning@1','CLEAVER.transform_target@1','COVER_CHECK.whole_word@1','DICTATION.paired_word_gaps@1','LESSON_REFLECTION.standard_lesson_reflection@1') then return false; end if;
  end loop;
  return (select count(*)=expected_count and count(*)=count(distinct b.value->>'sourceEntityId') from jsonb_array_elements(p->'activities') a,jsonb_array_elements(a.value->'itemBindings') b);
exception when others then return false;
end $$;

-- Directly persisted, review-free comparative plans still need the same
-- specialist-session authority as plans appended after Review.
create or replace function public.persist_adle_comparative_daily_plan_v3(p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_header jsonb,p_items jsonb,p_intakes jsonb,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid; previous jsonb; i jsonb;
begin
  if p_intakes<>'[]'::jsonb or p_header->>'childId'<>p_child_id::text or p_header->>'parentUserId'<>p_parent_user_id::text or p_header->>'assignmentDate'<>p_plan_date::text
    or not exists(select 1 from public.children where children.id=p_child_id and parent_user_id=p_parent_user_id and not coalesce(is_archived,false)) then raise exception 'comparative ownership invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_child_id::text||':'||p_plan_date::text||':ADLE Daily Plan',0));
  select daily_assignments.id,compiled_lesson_snapshot into id,previous from public.daily_assignments where child_id=p_child_id and parent_user_id=p_parent_user_id and assignment_date=p_plan_date and title='ADLE Daily Plan';
  if id is not null then
    if previous#>>'{provenance,sourceFingerprint}' is distinct from p_snapshot#>>'{provenance,sourceFingerprint}' then raise exception 'comparative idempotency conflict'; end if;
  else
    perform public.assert_adle_comparative_assignment_v1(p_snapshot,p_header->'lessonRouteMetadata',p_items,p_child_id,p_parent_user_id);
    insert into public.daily_assignments(child_id,parent_user_id,assignment_date,title,status,target_words,review_words,assignment_generation_source,lesson_route_metadata,compiled_lesson_snapshot)
    values(p_child_id,p_parent_user_id,p_plan_date,'ADLE Daily Plan','pending',array(select jsonb_array_elements_text(p_header->'targetWords')),array[]::text[],'adle_composer_v1',p_header->'lessonRouteMetadata',p_snapshot) returning daily_assignments.id into id;
    for i in select value from jsonb_array_elements(p_items) loop
      insert into public.assignment_items(daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,source_entity_id,template_key,target_word,position,status,prompt_data,metadata)
      values(id,p_child_id,p_parent_user_id,'spelling',i->>'itemType','adle_composer',i->>'sourceEntityId',i->>'templateKey',i->>'targetWord',(i->>'position')::integer,'ready',i->'promptData',i->'metadata');
    end loop;
  end if;
  insert into public.adle_today_session_orchestrations(daily_assignment_id,child_id,parent_user_id,assignment_date,major_stage,review_generation_status,specialist_generation_status,specialist_started_at)
  values(id,p_child_id,p_parent_user_id,p_plan_date,'specialist_lesson','not_required','ready',timezone('utc',now()))
  on conflict (daily_assignment_id) do nothing;
  return id;
end $$;

insert into public.adle_today_session_orchestrations(daily_assignment_id,child_id,parent_user_id,assignment_date,major_stage,review_generation_status,specialist_generation_status,specialist_started_at)
select a.id,a.child_id,a.parent_user_id,a.assignment_date,'specialist_lesson','not_required','ready',timezone('utc',now())
from public.daily_assignments a
where a.status='pending' and a.compiled_lesson_snapshot#>>'{route,routeId}'='comparative_superlative_word_lab'
  and a.compiled_review_snapshot is null
  and not exists(select 1 from public.adle_today_session_orchestrations o where o.daily_assignment_id=a.id)
on conflict (daily_assignment_id) do nothing;

commit;
