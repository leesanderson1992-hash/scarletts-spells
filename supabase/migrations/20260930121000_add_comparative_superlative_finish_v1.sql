-- Atomic Finish for the new route only; existing completion RPCs remain unchanged.
begin;
-- Same NFKC, trim and lower-case normalization as normalizeDegreeAttempt.
create or replace function public.adle_normalize_degree_attempt_v1(p_text text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select lower(btrim(normalize(coalesce(p_text,''),NFKC),E' \t\n\r\f'||chr(11)||chr(5760)||chr(8232)||chr(8233)||chr(65279)))
$$;
create table public.adle_comparative_placement_outcomes(
 daily_assignment_id uuid not null references public.daily_assignments(id),
 canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
 sentence_id text not null, attempt_text text not null,
 expected_slot integer not null check(expected_slot in (0,1)), attempted_slot integer not null check(attempted_slot in (0,1)),
 spelling_correct boolean not null, placement_correct boolean not null,
 primary key(daily_assignment_id,canonical_word_id)
);
alter table public.adle_comparative_placement_outcomes enable row level security;
grant select on public.adle_comparative_placement_outcomes to service_role;
create trigger comparative_placement_immutable before update or delete on public.adle_comparative_placement_outcomes
 for each row execute function public.prevent_adle_release_authority_mutation();

create or replace function public.complete_adle_comparative_lesson_v1(
 p_parent_user_id uuid,p_child_id uuid,p_assignment_id uuid,p_plan_date date,p_micro_skill_key text,p_source_ref text,
 p_assignment_item_ids uuid[],p_attempts jsonb,p_lesson jsonb,p_reflection jsonb,p_placement_outcomes jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_header public.daily_assignments%rowtype; v_payload jsonb; state jsonb; t jsonb; o jsonb; raw jsonb;
 v_row jsonb; v_word_id uuid; v_schedule_id uuid; v_bundle_id uuid; v_input_bundle_id uuid; v_schedule_count integer;
 v_committed_at timestamptz:=timezone('utc',now()); n integer; direct integer; swapped integer; slot integer; idx integer; correct boolean;
begin
 select * into strict v_header from public.daily_assignments where id=p_assignment_id and parent_user_id=p_parent_user_id and child_id=p_child_id and assignment_date=p_plan_date for update;
 if not public.adle_comparative_snapshot_valid_v3(v_header.compiled_lesson_snapshot) then raise exception 'comparative Finish snapshot invalid'; end if;
 v_payload:=v_header.compiled_lesson_snapshot#>'{payload,resolvedLesson}'; n:=(v_header.compiled_lesson_snapshot#>>'{assignment,itemCount}')::integer;
 select checkpoint_payload->'state' into strict state from public.adle_specialist_stage_checkpoints where daily_assignment_id=p_assignment_id for update;
 if p_micro_skill_key is distinct from v_payload->>'microSkillKey' or p_source_ref is distinct from 'lesson:'||p_child_id||':'||p_plan_date||':'||p_micro_skill_key
   or state->>'stageId' is distinct from 'reflection' or state->'sortComplete' is distinct from 'true'::jsonb
   or state->>'reflection' is distinct from p_reflection->>'reflectionText' or char_length(btrim(coalesce(state->>'reflection',''))) not between 1 and 2000
   or (select count(*) from jsonb_each(state->'coverAttempts'))<>6 or jsonb_array_length(p_placement_outcomes)<>4
   or array_length(p_assignment_item_ids,1)<>n or (select count(distinct id) from unnest(p_assignment_item_ids) id)<>n
   or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids))<>n
   or jsonb_array_length(p_attempts)<>n-1 or (select count(distinct value->>'assignmentItemId') from jsonb_array_elements(p_attempts))<>n-1
   then raise exception 'comparative Finish incomplete'; end if;
 if v_header.status<>'completed' and (not public.adle_release_activation_allows_child_v2((v_header.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,p_child_id)
   or not public.adle_route_activation_revision_is_current_v2((v_header.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,(v_header.lesson_route_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid,v_header.lesson_route_metadata#>>'{curriculumRelease,releaseManifestSha256}',v_header.lesson_route_metadata#>>'{curriculumRelease,dependencyFingerprint}')) then raise exception 'comparative Finish activation changed'; end if;
 for t in select value from jsonb_array_elements(v_payload->'dictationTasks') loop
   raw:=state->'dictationValues'->(t->>'id');
   if state->'dictationChecked'->(t->>'id') is distinct from 'true'::jsonb or jsonb_array_length(raw)<>2 then raise exception 'comparative paired answers not frozen'; end if;
   direct:=(public.adle_normalize_degree_attempt_v1(raw->>0)=t#>>'{targets,0,word}')::integer+(public.adle_normalize_degree_attempt_v1(raw->>1)=t#>>'{targets,1,word}')::integer;
   swapped:=(public.adle_normalize_degree_attempt_v1(raw->>1)=t#>>'{targets,0,word}')::integer+(public.adle_normalize_degree_attempt_v1(raw->>0)=t#>>'{targets,1,word}')::integer;
   for idx in 0..1 loop
     slot:=case when swapped>direct then 1-idx else idx end;
     correct:=public.adle_normalize_degree_attempt_v1(raw->>slot)=t->'targets'->idx->>'word';
     select value into strict o from jsonb_array_elements(p_placement_outcomes) where value->>'canonicalWordId'=t->'targets'->idx->>'canonicalWordId';
     if o->>'sentenceId' is distinct from t->>'id' or o->>'attemptText' is distinct from raw->>slot
       or (o->>'expectedSlot')::integer is distinct from idx or (o->>'attemptedSlot')::integer is distinct from slot
       or (o->>'spellingCorrect')::boolean is distinct from correct or (o->>'placementCorrect')::boolean is distinct from (correct and slot=idx) then raise exception 'comparative placement grading mismatch'; end if;
   end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_attempts) e join public.assignment_items i on i.id=(e.value->>'assignmentItemId')::uuid
   where i.daily_assignment_id<>p_assignment_id or e.value->>'childId' is distinct from p_child_id::text or e.value->>'parentUserId' is distinct from p_parent_user_id::text
     or e.value->>'dailyAssignmentId' is distinct from p_assignment_id::text or e.value->>'canonicalWordId' is distinct from i.metadata->>'canonicalWordId'
     or i.id<>all(p_assignment_item_ids) or e.value->>'sourceRef' not like p_source_ref||'%'
     or (e.value->>'attemptKind'='lesson_production' and e.value->>'attemptText' is distinct from state->'coverAttempts'->>(i.metadata->>'canonicalWordId'))
     or (e.value->>'attemptKind'='lesson_dictation' and not exists(select 1 from jsonb_array_elements(p_placement_outcomes) o where o.value->>'canonicalWordId'=e.value->>'canonicalWordId' and o.value->>'attemptText'=e.value->>'attemptText' and o.value->'spellingCorrect'=e.value->'isCorrect'))
     or (e.value->>'attemptKind'='lesson_production' and (e.value->>'isCorrect')::boolean is distinct from (public.adle_normalize_degree_attempt_v1(e.value->>'attemptText')=i.target_word))) then raise exception 'comparative attempt facts mismatch'; end if;
 if jsonb_array_length(p_lesson->'taughtEvents')<>4
   or exists(select 1 from jsonb_array_elements(p_lesson->'taughtEvents') e where e.value->>'childId' is distinct from p_child_id::text or e.value->>'sourceRef' is distinct from p_source_ref
     or not exists(select 1 from jsonb_array_elements(v_payload->'words') w where w.value->>'canonicalWordId'=e.value->>'canonicalWordId' and w.value->>'degree'<>'base'))
   or exists(select 1 from jsonb_array_elements(p_lesson->'scheduleWords') e where e.value->>'childId' is distinct from p_child_id::text
     or not exists(select 1 from jsonb_array_elements(v_payload->'queuedTargets') t where t.value->>'canonicalWordId'=e.value->>'canonicalWordId')
     or not exists(select 1 from jsonb_array_elements(p_placement_outcomes) o where o.value->>'canonicalWordId'=e.value->>'canonicalWordId' and o.value->'spellingCorrect'='true'::jsonb))
   or exists(select 1 from jsonb_array_elements(p_lesson->'itemTransitions') e where not exists(select 1 from jsonb_array_elements(v_payload->'queuedTargets') t where t.value->>'learningItemId'=e.value->>'learningItemId' and t.value->>'canonicalWordId'=e.value->>'canonicalWordId'))
   or p_reflection->>'promptText' is distinct from v_payload->>'reflectionPrompt'
   then raise exception 'comparative companion scheduling or teaching mismatch'; end if;
  select count(*),(array_agg(id))[1] into v_schedule_count,v_bundle_id
  from public.adle_review_bundles where child_id=p_child_id and source_ref=p_source_ref and row_status='active';
  if v_schedule_count>1 then raise exception 'Duplicate comparative completion bundle'; end if;
  if v_header.status<>'completed' then
    if p_lesson->'bundle'<>'null'::jsonb then
    v_input_bundle_id:=(p_lesson->'bundle'->>'bundleId')::uuid;
    if v_bundle_id is null then
      v_bundle_id:=v_input_bundle_id;
      insert into public.adle_review_bundles(id,child_id,source_ref,interval_index,next_due_on,schedule_policy_version,bundle_status,row_status)
      values(v_bundle_id,p_child_id,p_source_ref,(p_lesson->'bundle'->>'intervalIndex')::integer,
        (p_lesson->'bundle'->>'nextDueOn')::date,p_lesson->'bundle'->>'schedulePolicyVersion',
        p_lesson->'bundle'->>'bundleStatus','active');
    end if;
    end if;
    for v_row in select value from jsonb_array_elements(p_lesson->'scheduleWords') loop
      v_word_id:=(v_row->>'canonicalWordId')::uuid;
      update public.adle_review_schedule_word_routes route set row_status='superseded'
      where route.schedule_word_id in (select id from public.adle_review_schedule_words
        where child_id=p_child_id and canonical_word_id=v_word_id and row_status='active');
      update public.adle_review_schedule_words set row_status='superseded',updated_at=v_committed_at
      where child_id=p_child_id and canonical_word_id=v_word_id and row_status='active';
      insert into public.adle_review_schedule_words(child_id,canonical_word_id,bundle_id,membership_status,catch_up_stage,next_retest_due_on,failed_review_on,pre_retirement_check_due_on,last_28_day_review_on,reteach_cycle_count,taught_on,row_status)
      values(p_child_id,v_word_id,v_bundle_id,v_row->>'membershipStatus',(v_row->>'catchUpStage')::integer,
        nullif(v_row->>'nextRetestDueOn','')::date,nullif(v_row->>'failedReviewOn','')::date,
        nullif(v_row->>'preRetirementCheckDueOn','')::date,nullif(v_row->>'last28DayReviewOn','')::date,
        (v_row->>'reteachCycleCount')::integer,(v_row->>'taughtOn')::date,'active') returning id into v_schedule_id;
      insert into public.adle_review_schedule_word_routes(schedule_word_id,learning_item_id,micro_skill_key,attached_on,attachment_ordinal,row_status)
      select v_schedule_id,item.id,item.micro_skill_key,(v_row->>'taughtOn')::date,1,'active'
      from public.adle_learning_items item
      join public.assignment_items assignment_item
        on assignment_item.daily_assignment_id=p_assignment_id
       and assignment_item.metadata->>'sectionKey'='lesson_production'
       and assignment_item.metadata->>'adleLearningItemRef'=item.id::text
      where item.child_id=p_child_id and item.canonical_word_id=v_word_id
        and item.micro_skill_key=p_micro_skill_key 
        and item.row_status='active';
      if not found then raise exception 'Authentic Compound schedule lost learner lineage'; end if;
    end loop;
    insert into public.adle_taught_word_history(child_id,canonical_word_id,event_kind,occurred_on,source_ref,row_status,attempt_text)
    select p_child_id,(value->>'canonicalWordId')::uuid,value->>'eventKind',(value->>'occurredOn')::date,p_source_ref,'active',value->>'attemptText'
    from jsonb_array_elements(p_lesson->'taughtEvents')
    on conflict do nothing;
    for v_row in select value from jsonb_array_elements(p_lesson->'itemTransitions') loop
      update public.adle_learning_items set item_status=v_row->>'itemStatus',reteach_priority=(v_row->>'reteachPriority')::boolean,
        ejected_on=nullif(v_row->>'ejectedOn','')::date,row_status=v_row->>'rowStatus',updated_at=v_committed_at
      where id=(v_row->>'learningItemId')::uuid and child_id=p_child_id
        and canonical_word_id=(v_row->>'canonicalWordId')::uuid and micro_skill_key=p_micro_skill_key;
      if not found then raise exception 'Compound learning-item transition target missing'; end if;
    end loop;
    insert into public.adle_assignment_attempt_events(child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,micro_skill_key,section_key,template_key,target_word,attempt_text,is_correct,attempt_kind,evidence_class,source_ref)
    select (value->>'childId')::uuid,(value->>'parentUserId')::uuid,(value->>'dailyAssignmentId')::uuid,
      (value->>'assignmentItemId')::uuid,nullif(value->>'canonicalWordId','')::uuid,nullif(value->>'microSkillKey',''),
      value->>'sectionKey',nullif(value->>'templateKey',''),nullif(value->>'targetWord',''),value->>'attemptText',
      nullif(value->>'isCorrect','')::boolean,value->>'attemptKind',value->>'evidenceClass',value->>'sourceRef'
    from jsonb_array_elements(p_attempts) on conflict(assignment_item_id,attempt_kind,source_ref) do nothing;
    insert into public.adle_assignment_attempt_event_routes(attempt_event_id,learning_item_id,micro_skill_key)
    select event.id,(item.metadata->>'adleLearningItemRef')::uuid,p_micro_skill_key
    from public.adle_assignment_attempt_events event
    join public.assignment_items item on item.id=event.assignment_item_id
    where event.daily_assignment_id=p_assignment_id
      and item.daily_assignment_id=p_assignment_id
      and nullif(item.metadata->>'adleLearningItemRef','') is not null
      and event.attempt_kind in ('lesson_production','lesson_dictation')
      and event.canonical_word_id is not null
    on conflict(attempt_event_id,learning_item_id) do nothing;
    insert into public.adle_child_learning_reflections(child_id,parent_user_id,daily_assignment_id,micro_skill_key,content_version,prompt_key,prompt_text,reflection_text,updated_at)
    values(p_child_id,p_parent_user_id,p_assignment_id,p_micro_skill_key,p_reflection->>'contentVersion',p_reflection->>'promptKey',p_reflection->>'promptText',btrim(p_reflection->>'reflectionText'),v_committed_at)
    on conflict(daily_assignment_id,prompt_key) do nothing;
    update public.assignment_items set status='completed' where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids);
    insert into public.adle_comparative_placement_outcomes(daily_assignment_id,canonical_word_id,sentence_id,attempt_text,expected_slot,attempted_slot,spelling_correct,placement_correct)
    select p_assignment_id,(value->>'canonicalWordId')::uuid,value->>'sentenceId',value->>'attemptText',(value->>'expectedSlot')::integer,(value->>'attemptedSlot')::integer,(value->>'spellingCorrect')::boolean,(value->>'placementCorrect')::boolean from jsonb_array_elements(p_placement_outcomes) on conflict do nothing;
    update public.adle_specialist_stage_checkpoints set checkpoint_payload=jsonb_set(checkpoint_payload,'{state,finished}','true'),completed_at=v_committed_at where daily_assignment_id=p_assignment_id;
    update public.daily_assignments set status='completed' where id=p_assignment_id;
  end if;

 if (select count(*) from public.adle_assignment_attempt_events where daily_assignment_id=p_assignment_id and source_ref like p_source_ref||'%')<>n-1
   or (select count(*) from public.adle_comparative_placement_outcomes where daily_assignment_id=p_assignment_id)<>4
   or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids) and status='completed')<>n
   or (select count(*) from public.adle_taught_word_history where child_id=p_child_id and source_ref=p_source_ref and row_status='active')<>4
   then raise exception 'comparative persisted Finish verification failed'; end if;
 return jsonb_build_object('status',case when v_header.status='completed' then 'already_completed' else 'completed' end,'committedAt',v_committed_at,'counts',jsonb_build_object('items',n,'attempts',n-1,'pairedOutcomes',4));
end $$;
revoke all on function public.complete_adle_comparative_lesson_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_adle_comparative_lesson_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb,jsonb) to service_role;
commit;
