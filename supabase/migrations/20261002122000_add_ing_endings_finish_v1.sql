-- Atomic, idempotent Finish for reviewed -ing lessons.
begin;

create or replace function public.complete_adle_ing_lesson_v1(
 p_parent_user_id uuid,p_child_id uuid,p_assignment_id uuid,p_plan_date date,p_micro_skill_key text,p_source_ref text,
 p_assignment_item_ids uuid[],p_attempts jsonb,p_lesson jsonb,p_reflection jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare h public.daily_assignments%rowtype; lesson jsonb; state jsonb; target jsonb; word jsonb; row jsonb;
 word_id uuid; schedule_id uuid; bundle_id uuid; committed_at timestamptz:=timezone('utc',now());
 n integer; queued integer; schedule_count integer;
begin
 select * into strict h from public.daily_assignments where id=p_assignment_id and parent_user_id=p_parent_user_id and child_id=p_child_id and assignment_date=p_plan_date for update;
 if not public.adle_ing_snapshot_valid_v3(h.compiled_lesson_snapshot) then raise exception 'ing Finish snapshot invalid'; end if;
 lesson:=h.compiled_lesson_snapshot#>'{payload,resolvedLesson}'; n:=(h.compiled_lesson_snapshot#>>'{assignment,itemCount}')::integer;
 queued:=jsonb_array_length(lesson->'queuedTargets');
 select checkpoint_payload->'state' into strict state from public.adle_specialist_stage_checkpoints where daily_assignment_id=p_assignment_id for update;
 if p_micro_skill_key is distinct from lesson->>'microSkillKey' or p_source_ref is distinct from 'lesson:'||p_child_id||':'||p_plan_date||':'||p_micro_skill_key
   or state->>'stageId' is distinct from 'reflection' or char_length(btrim(coalesce(state->>'reflection',''))) not between 1 and 2000
   or state->>'reflection' is distinct from p_reflection->>'reflectionText'
   or jsonb_array_length(state->'meaningConnected')<>3 or jsonb_array_length(state->'scrabbleComplete')<>3
   or (select count(*) from jsonb_each(state->'coverAttempts'))<>6 or jsonb_array_length(state->'dictationChecked')<>6
   or (select count(*) from jsonb_each(state->'dictationValues'))<>6
   or array_length(p_assignment_item_ids,1)<>n or (select count(distinct id) from unnest(p_assignment_item_ids) id)<>n
   or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids))<>n
   or jsonb_array_length(p_attempts)<>n-1 or (select count(distinct value->>'assignmentItemId') from jsonb_array_elements(p_attempts))<>n-1
   then raise exception 'ing Finish incomplete'; end if;
 if h.status<>'completed' and (not public.adle_release_activation_allows_child_v2((h.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,p_child_id)
   or not public.adle_route_activation_revision_is_current_v2((h.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,(h.lesson_route_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid,h.lesson_route_metadata#>>'{curriculumRelease,releaseManifestSha256}',h.lesson_route_metadata#>>'{curriculumRelease,dependencyFingerprint}')) then raise exception 'ing Finish activation changed'; end if;
 for word in select value from jsonb_array_elements(lesson->'words') loop
   if nullif(btrim(state->'coverAttempts'->>(word->>'canonicalWordId')),'') is null
     or nullif(btrim(state->'dictationValues'->>(word->>'canonicalWordId')),'') is null
     or not (state->'dictationChecked') ? (word->>'canonicalWordId') then raise exception 'ing word answers not frozen'; end if;
 end loop;
 for target in select value from jsonb_array_elements(lesson->'queuedTargets') loop
   if state#>>array['cleaverProgress',target->>'canonicalWordId','selectedOptionId'] is distinct from '0'
     or state#>array['cleaverProgress',target->>'canonicalWordId','revealed'] is distinct from 'true'::jsonb
     or state#>array['cleaverProgress',target->>'canonicalWordId','questionShown'] is distinct from 'true'::jsonb then raise exception 'ing queued-word Cleaver incomplete'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_attempts) e join public.assignment_items i on i.id=(e.value->>'assignmentItemId')::uuid
   where i.daily_assignment_id<>p_assignment_id or e.value->>'childId' is distinct from p_child_id::text or e.value->>'parentUserId' is distinct from p_parent_user_id::text
     or e.value->>'dailyAssignmentId' is distinct from p_assignment_id::text or e.value->>'canonicalWordId' is distinct from i.metadata->>'canonicalWordId'
     or i.id<>all(p_assignment_item_ids) or e.value->>'sourceRef' not like p_source_ref||'%'
     or (e.value->>'attemptKind'='lesson_production' and (e.value->>'attemptText' is distinct from state->'coverAttempts'->>(i.metadata->>'canonicalWordId')
       or (e.value->>'isCorrect')::boolean is distinct from (public.adle_normalize_degree_attempt_v1(e.value->>'attemptText')=i.target_word)))
     or (e.value->>'attemptKind'='lesson_dictation' and (e.value->>'attemptText' is distinct from state->'dictationValues'->>(i.metadata->>'canonicalWordId')
       or (e.value->>'isCorrect')::boolean is distinct from (public.adle_normalize_degree_attempt_v1(e.value->>'attemptText')=i.target_word)))) then raise exception 'ing attempt facts mismatch'; end if;
 if jsonb_array_length(p_lesson->'taughtEvents')<>queued
   or exists(select 1 from jsonb_array_elements(p_lesson->'taughtEvents') e where e.value->>'childId' is distinct from p_child_id::text or e.value->>'sourceRef' is distinct from p_source_ref
     or not exists(select 1 from jsonb_array_elements(lesson->'queuedTargets') t where t.value->>'canonicalWordId'=e.value->>'canonicalWordId'))
   or exists(select 1 from jsonb_array_elements(p_lesson->'scheduleWords') e where e.value->>'childId' is distinct from p_child_id::text
     or not exists(select 1 from jsonb_array_elements(lesson->'queuedTargets') t where t.value->>'canonicalWordId'=e.value->>'canonicalWordId')
     or public.adle_normalize_degree_attempt_v1(state->'dictationValues'->>(e.value->>'canonicalWordId')) is distinct from (select value->>'word' from jsonb_array_elements(lesson->'words') w where w.value->>'canonicalWordId'=e.value->>'canonicalWordId'))
   or exists(select 1 from jsonb_array_elements(p_lesson->'itemTransitions') e where not exists(select 1 from jsonb_array_elements(lesson->'queuedTargets') t where t.value->>'learningItemId'=e.value->>'learningItemId' and t.value->>'canonicalWordId'=e.value->>'canonicalWordId'))
   or p_reflection->>'promptText' is distinct from lesson->>'reflectionPrompt'
   or p_reflection->>'promptKey' is distinct from 'ing:'||p_micro_skill_key||':reflection:v1'
   or p_reflection->>'contentVersion' is distinct from 'ing_endings_word_lab:v1' then raise exception 'ing scheduling or reflection mismatch'; end if;
 select count(*),(array_agg(id))[1] into schedule_count,bundle_id from public.adle_review_bundles where child_id=p_child_id and source_ref=p_source_ref and row_status='active';
 if schedule_count>1 then raise exception 'duplicate ing completion bundle'; end if;
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
     if not found then raise exception 'ing schedule lost learner lineage'; end if;
   end loop;
   insert into public.adle_taught_word_history(child_id,canonical_word_id,event_kind,occurred_on,source_ref,row_status,attempt_text)
     select p_child_id,(value->>'canonicalWordId')::uuid,value->>'eventKind',(value->>'occurredOn')::date,p_source_ref,'active',value->>'attemptText' from jsonb_array_elements(p_lesson->'taughtEvents') on conflict do nothing;
   for row in select value from jsonb_array_elements(p_lesson->'itemTransitions') loop
     update public.adle_learning_items set item_status=row->>'itemStatus',reteach_priority=(row->>'reteachPriority')::boolean,ejected_on=nullif(row->>'ejectedOn','')::date,row_status=row->>'rowStatus',updated_at=committed_at
       where id=(row->>'learningItemId')::uuid and child_id=p_child_id and canonical_word_id=(row->>'canonicalWordId')::uuid and micro_skill_key=p_micro_skill_key;
     if not found then raise exception 'ing learning-item transition target missing'; end if;
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
   update public.adle_specialist_stage_checkpoints set checkpoint_payload=jsonb_set(checkpoint_payload,'{state,finished}','true'),completed_at=committed_at where daily_assignment_id=p_assignment_id;
   update public.daily_assignments set status='completed' where id=p_assignment_id;
 end if;
 if (select count(*) from public.adle_assignment_attempt_events where daily_assignment_id=p_assignment_id and source_ref like p_source_ref||'%')<>n-1
   or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids) and status='completed')<>n
   or (select count(*) from public.adle_taught_word_history where child_id=p_child_id and source_ref=p_source_ref and row_status='active')<>queued
   then raise exception 'ing persisted Finish verification failed'; end if;
 return jsonb_build_object('status',case when h.status='completed' then 'already_completed' else 'completed' end,'committedAt',committed_at,'counts',jsonb_build_object('items',n,'attempts',n-1,'taught',queued));
end $$;

revoke all on function public.complete_adle_ing_lesson_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_adle_ing_lesson_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) to service_role;
commit;
