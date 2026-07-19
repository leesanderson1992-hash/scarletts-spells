-- Stage 6 interactive base-word Word Lab. The preceding guarded-pilot
-- migration is immutable, so update its two service-role functions forward.

do $$
declare definition text;
begin
  select pg_get_functiondef('public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'Missing base-word pilot persistence function';
  end if;
  definition := replace(definition, $sql$jsonb_array_length(coalesce(p_payload->'independentWords', '[]'::jsonb)) <> 5$sql$, $sql$jsonb_array_length(coalesce(p_payload->'independentWords', '[]'::jsonb)) <> 6$sql$);
  definition := replace(definition, 'jsonb_array_length(p_items) <> 13', 'jsonb_array_length(p_items) <> 18');
  definition := replace(definition, 'exactly 13 assignment items', 'exactly 18 assignment items');
  execute definition;

  select pg_get_functiondef('public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'Missing base-word pilot completion function';
  end if;
  definition := replace(definition, '<> 13', '<> 18');
  definition := replace(definition, '= 13', '= 18');
  definition := replace(definition, 'exact 13-item snapshot', 'exact 18-item snapshot');
  definition := replace(definition, $sql$metadata->>'sectionKey' = 'guided_practice') <> 2$sql$, $sql$metadata->>'sectionKey' = 'guided_practice') <> 5$sql$);
  definition := replace(definition, $sql$metadata->>'sectionKey' = 'lesson_production') <> 5$sql$, $sql$metadata->>'sectionKey' = 'lesson_production') <> 6$sql$);
  definition := replace(definition, $sql$metadata->>'sectionKey' = 'lesson_dictation') <> 5$sql$, $sql$metadata->>'sectionKey' = 'lesson_dictation') <> 6$sql$);
  definition := replace(definition, 'jsonb_array_length(p_attempts) <> 10', 'jsonb_array_length(p_attempts) <> 18');
  definition := replace(definition, $sql$value->>'attemptKind' = 'lesson_production') <> 5$sql$, $sql$value->>'attemptKind' = 'lesson_production') <> 6$sql$);
  definition := replace(definition, $sql$value->>'attemptKind' = 'lesson_dictation') <> 5$sql$, $sql$value->>'attemptKind' = 'lesson_dictation') <> 6$sql$);
  definition := replace(definition, 'ten bound independent attempt events', 'eighteen bound guided and independent attempt events');
  definition := replace(definition, 'v_attempt_count <> 10', 'v_attempt_count <> 18');
  definition := replace(definition, '''items'',13', '''items'',18');
  execute definition;
end;
$$;
