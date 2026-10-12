-- Atomic completion for the reviewed homophone route. Guided choices never
-- contribute to proficiency, scheduling, or reward decisions.
begin;

create or replace function public.complete_adle_homophone_lesson_v2(
 p_parent_user_id uuid,p_child_id uuid,p_assignment_id uuid,p_plan_date date,p_micro_skill_key text,p_source_ref text,
 p_assignment_item_ids uuid[],p_attempts jsonb,p_lesson jsonb,p_reflection jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare h public.daily_assignments%rowtype; snapshot jsonb; lesson jsonb; state jsonb; word jsonb; passage jsonb; row jsonb;
 word_id uuid; schedule_id uuid; bundle_id uuid; committed_at timestamptz:=timezone('utc',now());
 n integer; authentic_count integer; schedule_count integer; idx integer; slot integer; v_item public.assignment_items%rowtype; event jsonb; attempt text; expected_correct boolean;
begin
 select * into strict h from public.daily_assignments where id=p_assignment_id and parent_user_id=p_parent_user_id and child_id=p_child_id and assignment_date=p_plan_date for update;
 snapshot:=h.compiled_lesson_snapshot; lesson:=snapshot#>'{payload,resolvedLesson,lesson}'; n:=(snapshot#>>'{assignment,itemCount}')::integer;
 if not public.adle_homophone_snapshot_valid_v3(snapshot) then raise exception 'homophone Finish snapshot invalid'; end if;
 select checkpoint_payload->'state' into strict state from public.adle_specialist_stage_checkpoints where daily_assignment_id=p_assignment_id for update;
 select count(*) into authentic_count from jsonb_array_elements(snapshot->'words') w where w.value->>'learningItemId' is not null;
 if p_micro_skill_key is distinct from lesson->>'microSkillKey' or p_source_ref is distinct from 'lesson:'||p_child_id||':'||p_plan_date||':'||p_micro_skill_key
   or state->>'stage' is distinct from 'reflection' or state->'binSortCompleted' is distinct from 'true'::jsonb
   or state->'balloonCompleted' is distinct from 'true'::jsonb
   or char_length(btrim(coalesce(state->>'reflectionResponse',''))) not between 1 and 1000
   or state->>'reflectionResponse' is distinct from p_reflection->>'reflectionText'
   or (select count(*) from jsonb_each(state->'coverAttempts'))<>jsonb_array_length(lesson->'words')
   or (select count(*) from jsonb_each(state->'dictationChecked'))<>3
   or (select count(*) from jsonb_each(state->'dictationValues'))<>3
   or array_length(p_assignment_item_ids,1)<>n or (select count(distinct id) from unnest(p_assignment_item_ids) id)<>n
   or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids))<>n
   or jsonb_typeof(p_attempts) is distinct from 'array' or jsonb_array_length(p_attempts)<>n
   or (select count(distinct value->>'assignmentItemId') from jsonb_array_elements(p_attempts))<>n
   then raise exception 'homophone Finish incomplete'; end if;
 if h.status<>'completed' and (not public.adle_release_activation_allows_child_v2((h.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,p_child_id)
   or not public.adle_route_activation_revision_is_current_v2((h.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,
     (h.lesson_route_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid,
     h.lesson_route_metadata#>>'{curriculumRelease,releaseManifestSha256}',h.lesson_route_metadata#>>'{curriculumRelease,dependencyFingerprint}'))
   then raise exception 'homophone Finish activation changed'; end if;
 for word in select value from jsonb_array_elements(lesson->'words') loop
   if state->'coverAttempts'->(word->>'word') is null then raise exception 'homophone Cover Check not frozen'; end if;
 end loop;
 for idx in 0..2 loop
   passage:=lesson->'dictationPassages'->idx;
   if state->'dictationChecked'->(idx::text) is distinct from 'true'::jsonb
     or jsonb_typeof(state->'dictationValues'->(idx::text)) is distinct from 'array'
     or jsonb_array_length(state->'dictationValues'->(idx::text))<>2
     or jsonb_array_length(passage->'targets')<>2
     then raise exception 'homophone dictation not frozen'; end if;
 end loop;
 for event in select value from jsonb_array_elements(p_attempts) loop
   select * into strict v_item from public.assignment_items where id=(event->>'assignmentItemId')::uuid and daily_assignment_id=p_assignment_id;
   if v_item.id<>all(p_assignment_item_ids) or event->>'childId' is distinct from p_child_id::text
     or event->>'parentUserId' is distinct from p_parent_user_id::text or event->>'dailyAssignmentId' is distinct from p_assignment_id::text
     or event->>'canonicalWordId' is distinct from v_item.metadata->>'canonicalWordId'
     or event->>'targetWord' is distinct from v_item.target_word or event->>'sectionKey' is distinct from v_item.metadata->>'sectionKey'
     or event->>'sourceRef' not like p_source_ref||'%' then raise exception 'homophone attempt identity mismatch'; end if;
   if v_item.metadata->>'sectionKey' in ('lesson_intro','guided_practice') then
     if event->>'attemptKind'<>'guided_practice' or event->>'evidenceClass'<>'guided_practice_attempt'
       or event->'isCorrect'<>'null'::jsonb or event->>'attemptText'<>'completed' then raise exception 'homophone guided attempt mismatch'; end if;
   elsif v_item.metadata->>'sectionKey'='lesson_production' then
     attempt:=state->'coverAttempts'->>v_item.target_word;
     expected_correct:=public.adle_normalize_degree_attempt_v1(attempt)=v_item.target_word;
     if event->>'attemptKind'<>'lesson_production' or event->>'evidenceClass'<>'first_exposure_lesson_attempt'
       or event->>'attemptText' is distinct from attempt or (event->>'isCorrect')::boolean is distinct from expected_correct
       then raise exception 'homophone Cover Check attempt mismatch'; end if;
   elsif v_item.metadata->>'sectionKey'='lesson_dictation' then
     idx:=split_part(v_item.prompt_data->>'homophoneActivityId',':',2)::integer;
     slot:=(v_item.prompt_data->>'targetSlot')::integer;
     passage:=lesson->'dictationPassages'->idx;
     attempt:=state->'dictationValues'->(idx::text)->>slot;
     expected_correct:=public.adle_normalize_degree_attempt_v1(attempt)=v_item.target_word;
     if idx not between 0 and 2 or slot not between 0 and 1 or v_item.prompt_data->>'passageId' is distinct from passage->>'id'
       or v_item.target_word is distinct from passage->'targets'->>slot or event->>'attemptKind'<>'lesson_dictation'
       or event->>'evidenceClass'<>'first_exposure_lesson_attempt' or event->>'attemptText' is distinct from attempt
       or (event->>'isCorrect')::boolean is distinct from expected_correct then raise exception 'homophone dictation attempt mismatch'; end if;
   else raise exception 'homophone unexpected assignment section'; end if;
 end loop;
 if jsonb_array_length(p_lesson->'taughtEvents')<>authentic_count
   or exists(select 1 from jsonb_array_elements(p_lesson->'taughtEvents') e where e.value->>'childId' is distinct from p_child_id::text
     or e.value->>'sourceRef' is distinct from p_source_ref or not exists(select 1 from jsonb_array_elements(snapshot->'words') w
       where w.value->>'canonicalWordId'=e.value->>'canonicalWordId' and w.value->>'learningItemId' is not null))
   or exists(select 1 from jsonb_array_elements(p_lesson->'scheduleWords') e where e.value->>'childId' is distinct from p_child_id::text
     or not exists(select 1 from jsonb_array_elements(snapshot->'words') w where w.value->>'canonicalWordId'=e.value->>'canonicalWordId' and w.value->>'learningItemId' is not null))
   or exists(select 1 from jsonb_array_elements(p_lesson->'itemTransitions') e where not exists(select 1 from jsonb_array_elements(snapshot->'words') w
     where w.value->>'learningItemId'=e.value->>'learningItemId' and w.value->>'canonicalWordId'=e.value->>'canonicalWordId'))
   or p_reflection->>'promptText' is distinct from 'Which clue will help you choose these words next time?'
   or p_reflection->>'promptKey' is distinct from 'homophone:'||p_micro_skill_key||':reflection:v2'
   or p_reflection->>'contentVersion' is distinct from 'homophone_word_lab:v2' then raise exception 'homophone completion facts mismatch'; end if;
 select count(*),(array_agg(id))[1] into schedule_count,bundle_id from public.adle_review_bundles where child_id=p_child_id and source_ref=p_source_ref and row_status='active';
 if schedule_count>1 then raise exception 'duplicate homophone completion bundle'; end if;
 if h.status<>'completed' then
   if p_lesson->'bundle'<>'null'::jsonb then
     if bundle_id is null then
       bundle_id:=(p_lesson->'bundle'->>'bundleId')::uuid;
       insert into public.adle_review_bundles(id,child_id,source_ref,interval_index,next_due_on,schedule_policy_version,bundle_status,row_status)
       values(bundle_id,p_child_id,p_source_ref,(p_lesson->'bundle'->>'intervalIndex')::integer,(p_lesson->'bundle'->>'nextDueOn')::date,p_lesson->'bundle'->>'schedulePolicyVersion',p_lesson->'bundle'->>'bundleStatus','active');
     end if;
   end if;
   for row in select value from jsonb_array_elements(p_lesson->'scheduleWords') loop
     word_id:=(row->>'canonicalWordId')::uuid;
     update public.adle_review_schedule_word_routes route set row_status='superseded' where route.schedule_word_id in
       (select id from public.adle_review_schedule_words where child_id=p_child_id and canonical_word_id=word_id and row_status='active');
     update public.adle_review_schedule_words set row_status='superseded',updated_at=committed_at where child_id=p_child_id and canonical_word_id=word_id and row_status='active';
     insert into public.adle_review_schedule_words(child_id,canonical_word_id,bundle_id,membership_status,catch_up_stage,next_retest_due_on,failed_review_on,pre_retirement_check_due_on,last_28_day_review_on,reteach_cycle_count,taught_on,row_status)
     values(p_child_id,word_id,bundle_id,row->>'membershipStatus',(row->>'catchUpStage')::integer,nullif(row->>'nextRetestDueOn','')::date,nullif(row->>'failedReviewOn','')::date,nullif(row->>'preRetirementCheckDueOn','')::date,nullif(row->>'last28DayReviewOn','')::date,(row->>'reteachCycleCount')::integer,(row->>'taughtOn')::date,'active') returning id into schedule_id;
     insert into public.adle_review_schedule_word_routes(schedule_word_id,learning_item_id,micro_skill_key,attached_on,attachment_ordinal,row_status)
     select schedule_id,item.id,item.micro_skill_key,(row->>'taughtOn')::date,1,'active' from public.adle_learning_items item
       join public.assignment_items assignment_item on assignment_item.daily_assignment_id=p_assignment_id and assignment_item.metadata->>'sectionKey'='lesson_production' and assignment_item.metadata->>'adleLearningItemRef'=item.id::text
       where item.child_id=p_child_id and item.canonical_word_id=word_id and item.micro_skill_key=p_micro_skill_key and item.row_status='active';
     if not found then raise exception 'homophone schedule lost learner lineage'; end if;
   end loop;
   insert into public.adle_taught_word_history(child_id,canonical_word_id,event_kind,occurred_on,source_ref,row_status,attempt_text)
     select p_child_id,(value->>'canonicalWordId')::uuid,value->>'eventKind',(value->>'occurredOn')::date,p_source_ref,'active',value->>'attemptText' from jsonb_array_elements(p_lesson->'taughtEvents') on conflict do nothing;
   for row in select value from jsonb_array_elements(p_lesson->'itemTransitions') loop
     update public.adle_learning_items set item_status=row->>'itemStatus',reteach_priority=(row->>'reteachPriority')::boolean,ejected_on=nullif(row->>'ejectedOn','')::date,row_status=row->>'rowStatus',updated_at=committed_at
       where id=(row->>'learningItemId')::uuid and child_id=p_child_id and canonical_word_id=(row->>'canonicalWordId')::uuid and micro_skill_key=p_micro_skill_key;
     if not found then raise exception 'homophone learning-item transition target missing'; end if;
   end loop;
   insert into public.adle_assignment_attempt_events(child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,micro_skill_key,section_key,template_key,target_word,attempt_text,is_correct,attempt_kind,evidence_class,source_ref)
     select (value->>'childId')::uuid,(value->>'parentUserId')::uuid,(value->>'dailyAssignmentId')::uuid,(value->>'assignmentItemId')::uuid,nullif(value->>'canonicalWordId','')::uuid,nullif(value->>'microSkillKey',''),value->>'sectionKey',nullif(value->>'templateKey',''),nullif(value->>'targetWord',''),value->>'attemptText',nullif(value->>'isCorrect','')::boolean,value->>'attemptKind',value->>'evidenceClass',value->>'sourceRef'
     from jsonb_array_elements(p_attempts) on conflict(assignment_item_id,attempt_kind,source_ref) do nothing;
   insert into public.adle_assignment_attempt_event_routes(attempt_event_id,learning_item_id,micro_skill_key)
     select event.id,(item.metadata->>'adleLearningItemRef')::uuid,p_micro_skill_key from public.adle_assignment_attempt_events event join public.assignment_items item on item.id=event.assignment_item_id
     where event.daily_assignment_id=p_assignment_id and item.daily_assignment_id=p_assignment_id and nullif(item.metadata->>'adleLearningItemRef','') is not null
       and event.attempt_kind in ('lesson_production','lesson_dictation') and event.canonical_word_id is not null on conflict(attempt_event_id,learning_item_id) do nothing;
   insert into public.adle_child_learning_reflections(child_id,parent_user_id,daily_assignment_id,micro_skill_key,content_version,prompt_key,prompt_text,reflection_text,updated_at)
     values(p_child_id,p_parent_user_id,p_assignment_id,p_micro_skill_key,p_reflection->>'contentVersion',p_reflection->>'promptKey',p_reflection->>'promptText',btrim(p_reflection->>'reflectionText'),committed_at)
     on conflict(daily_assignment_id,prompt_key) do nothing;
   update public.assignment_items set status='completed' where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids);
   update public.adle_specialist_stage_checkpoints set checkpoint_payload=jsonb_set(checkpoint_payload,'{state,completed}','true'),completed_at=committed_at where daily_assignment_id=p_assignment_id;
   update public.daily_assignments set status='completed' where id=p_assignment_id;
 end if;
 if (select count(*) from public.adle_assignment_attempt_events where daily_assignment_id=p_assignment_id and source_ref like p_source_ref||'%')<>n
   or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids) and status='completed')<>n
   or (select count(*) from public.adle_taught_word_history where child_id=p_child_id and source_ref=p_source_ref and row_status='active')<>authentic_count
   then raise exception 'homophone persisted Finish verification failed'; end if;
 return jsonb_build_object('status',case when h.status='completed' then 'already_completed' else 'completed' end,
   'committedAt',committed_at,'counts',jsonb_build_object('items',n,'attempts',n,'taught',authentic_count));
end $$;

revoke all on function public.complete_adle_homophone_lesson_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_adle_homophone_lesson_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) to service_role;
commit;
