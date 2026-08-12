-- CW-3C-1 follow-up: route release-bound attempt evidence through the shared
-- ADLE lineage stored in assignment_items.metadata.adleLearningItemRef.
-- assignment_items.learning_item_id remains the unrelated legacy FK.

begin;

do $migration$
declare
  v_signature text := 'public.complete_adle_release_bound_word_lab_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)';
  v_definition text;
  v_legacy text := $old$    select event.id,item.learning_item_id,p_micro_skill_key
    from public.adle_assignment_attempt_events event
    join public.assignment_items item on item.id=event.assignment_item_id
    where event.daily_assignment_id=p_assignment_id
      and item.daily_assignment_id=p_assignment_id
      and item.learning_item_id is not null
      and event.canonical_word_id is not null$old$;
  v_shared text := $new$    select event.id,(item.metadata->>'adleLearningItemRef')::uuid,p_micro_skill_key
    from public.adle_assignment_attempt_events event
    join public.assignment_items item on item.id=event.assignment_item_id
    join public.adle_learning_items learning
      on learning.id=(item.metadata->>'adleLearningItemRef')::uuid
     and learning.child_id=p_child_id
     and learning.canonical_word_id=event.canonical_word_id
     and learning.micro_skill_key=p_micro_skill_key
     and learning.source_kind='verified_misspelling'
     and learning.row_status='active'
    where event.daily_assignment_id=p_assignment_id
      and item.daily_assignment_id=p_assignment_id
      and nullif(item.metadata->>'adleLearningItemRef','') is not null
      and event.canonical_word_id is not null$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_legacy in v_definition)=0 then
    raise exception 'release-bound evidence predecessor differs from reviewed CW-3C-1 repair contract';
  end if;
  v_definition:=replace(v_definition,v_legacy,v_shared);
  if position(v_legacy in v_definition)>0 or position(v_shared in v_definition)=0 then
    raise exception 'could not route release-bound evidence through shared ADLE lineage';
  end if;
  execute v_definition;
end;
$migration$;

revoke all on function public.complete_adle_release_bound_word_lab_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.complete_adle_release_bound_word_lab_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)
  to service_role;

commit;
