-- Keep the guarded pilot's existing RPC signature. Reflection travels inside
-- p_lesson so completion, reflection and retry semantics share one transaction.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)'::regprocedure) into definition;
  if definition is null then raise exception 'Missing base-word pilot completion function'; end if;
  definition := replace(definition,
    $old$or jsonb_typeof(p_lesson) <> 'object' or jsonb_typeof(p_transfer_misses) <> 'array' then$old$,
    $new$or jsonb_typeof(p_lesson) <> 'object' or jsonb_typeof(p_lesson->'reflection') <> 'object' or jsonb_typeof(p_transfer_misses) <> 'array' then$new$);
  definition := replace(definition,
    $old$if v_status <> 'completed' then$old$,
    $new$if p_lesson->'reflection'->>'childId' <> p_child_id::text or p_lesson->'reflection'->>'parentUserId' <> p_parent_user_id::text or p_lesson->'reflection'->>'assignmentId' <> p_assignment_id::text or p_lesson->'reflection'->>'microSkillKey' <> p_micro_skill_key or p_lesson->'reflection'->>'promptKey' <> 'base-word-family-observation-v1' or char_length(btrim(coalesce(p_lesson->'reflection'->>'reflectionText',''))) not between 1 and 2000 then raise exception 'ADLE base-word pilot reflection validation failed'; end if;
  if v_status <> 'completed' then$new$);
  definition := replace(definition,
    $old$update public.assignment_items set status='completed' where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids);$old$,
    $new$insert into public.adle_child_learning_reflections (child_id,parent_user_id,daily_assignment_id,micro_skill_key,content_version,prompt_key,prompt_text,reflection_text,updated_at) values (p_child_id,p_parent_user_id,p_assignment_id,p_micro_skill_key,p_lesson->'reflection'->>'contentVersion',p_lesson->'reflection'->>'promptKey',p_lesson->'reflection'->>'promptText',btrim(p_lesson->'reflection'->>'reflectionText'),v_now) on conflict (daily_assignment_id,prompt_key) do update set content_version=excluded.content_version,prompt_text=excluded.prompt_text,reflection_text=excluded.reflection_text,updated_at=excluded.updated_at;
    update public.assignment_items set status='completed' where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids);$new$);
  execute definition;
end;
$$;
