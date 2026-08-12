-- CW-3C-1 follow-up: assignment_items.learning_item_id is the legacy
-- learning_items foreign key. Shared ADLE lineage remains in the governed
-- metadata.adleLearningItemRef field and the adle_learning_items authority.
-- Restore the long-standing shared persistence boundary without mutating any
-- already-persisted assignment (the failed proof transaction wrote none).

begin;

do $migration$
declare
  v_signature text := 'public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)';
  v_definition text;
  v_incorrect text := $old$      v_item->>'sourceEntityId',
      nullif(v_item->>'learningItemId', '')::uuid,
      v_item->>'templateKey',$old$;
  v_shared text := $new$      v_item->>'sourceEntityId',
      null,
      v_item->>'templateKey',$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_incorrect in v_definition)=0 then
    raise exception 'composed-plan lineage predecessor differs from reviewed CW-3C-1 repair contract';
  end if;
  v_definition:=replace(v_definition,v_incorrect,v_shared);
  if position(v_incorrect in v_definition)>0 or position(v_shared in v_definition)=0 then
    raise exception 'could not restore shared ADLE assignment lineage boundary';
  end if;
  execute v_definition;
end;
$migration$;

revoke all on function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)
  to service_role;

commit;
