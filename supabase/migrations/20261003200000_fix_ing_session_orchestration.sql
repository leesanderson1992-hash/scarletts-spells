begin;

-- Directly persisted, review-free -ing plans need the specialist-session
-- authority row before their first durable activity checkpoint.
create or replace function public.persist_adle_ing_daily_plan_v3(p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_header jsonb,p_items jsonb,p_intakes jsonb,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid; previous jsonb; i jsonb;
begin
  if p_intakes<>'[]'::jsonb or p_header->>'childId'<>p_child_id::text or p_header->>'parentUserId'<>p_parent_user_id::text or p_header->>'assignmentDate'<>p_plan_date::text
    or not exists(select 1 from public.children where children.id=p_child_id and parent_user_id=p_parent_user_id and not coalesce(is_archived,false)) then raise exception 'ing ownership invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_child_id::text||':'||p_plan_date::text||':ADLE Daily Plan',0));
  select daily_assignments.id,compiled_lesson_snapshot into id,previous from public.daily_assignments where child_id=p_child_id and parent_user_id=p_parent_user_id and assignment_date=p_plan_date and title='ADLE Daily Plan';
  if id is not null then
    if previous#>>'{provenance,sourceFingerprint}' is distinct from p_snapshot#>>'{provenance,sourceFingerprint}' then raise exception 'ing idempotency conflict'; end if;
  else
    perform public.assert_adle_ing_assignment_v1(p_snapshot,p_header->'lessonRouteMetadata',p_items,p_child_id,p_parent_user_id);
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
select assignment.id,assignment.child_id,assignment.parent_user_id,assignment.assignment_date,'specialist_lesson','not_required','ready',timezone('utc',now())
from public.daily_assignments assignment
where assignment.status='pending'
  and assignment.compiled_lesson_snapshot#>>'{route,routeId}'='ing_endings_word_lab'
  and assignment.compiled_review_snapshot is null
  and not exists(select 1 from public.adle_today_session_orchestrations orchestration where orchestration.daily_assignment_id=assignment.id)
on conflict (daily_assignment_id) do nothing;

commit;
