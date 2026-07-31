-- Explicit, immutable ADLE lesson-route identity for newly composed
-- assignments. Historical assignments deliberately remain NULL and continue
-- through the registered legacy readers; this migration performs no backfill.

create or replace function public.adle_lesson_route_metadata_is_valid_v1(
  p_metadata jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_metadata) <> 'object'
    or jsonb_object_length(p_metadata) <> 4
    or jsonb_typeof(p_metadata->'metadataSchemaVersion') <> 'number'
    or (p_metadata->>'metadataSchemaVersion') !~ '^[0-9]+$'
    or (p_metadata->>'metadataSchemaVersion')::integer <> 1
    or jsonb_typeof(p_metadata->'route') <> 'object'
    or jsonb_object_length(p_metadata->'route') <> 2
    or nullif(btrim(p_metadata#>>'{route,routeId}'), '') is null
    or nullif(btrim(p_metadata#>>'{route,routeVersion}'), '') is null
    or jsonb_typeof(p_metadata->'recipe') <> 'object'
    or jsonb_object_length(p_metadata->'recipe') <> 2
    or nullif(btrim(p_metadata#>>'{recipe,recipeKey}'), '') is null
    or nullif(btrim(p_metadata#>>'{recipe,recipeVersion}'), '') is null
    or jsonb_typeof(p_metadata->'payload') <> 'object'
    or jsonb_object_length(p_metadata->'payload') <> 2
    or nullif(btrim(p_metadata#>>'{payload,kind}'), '') is null
    or jsonb_typeof(p_metadata#>'{payload,version}') <> 'number'
    or (p_metadata#>>'{payload,version}') !~ '^[0-9]+$'
    or (p_metadata#>>'{payload,version}')::integer <= 0
  then
    return false;
  end if;
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.adle_lesson_route_metadata_is_valid_v1(jsonb)
from public, anon, authenticated;

alter table public.daily_assignments
  add column lesson_route_metadata jsonb null;

alter table public.daily_assignments
  add constraint daily_assignments_lesson_route_metadata_v1_check
  check (
    lesson_route_metadata is null
    or public.adle_lesson_route_metadata_is_valid_v1(lesson_route_metadata)
  );

create index daily_assignments_lesson_route_version_idx
  on public.daily_assignments (
    (lesson_route_metadata#>>'{route,routeId}'),
    (lesson_route_metadata#>>'{route,routeVersion}')
  )
  where lesson_route_metadata is not null;

create or replace function public.prevent_adle_lesson_route_metadata_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.lesson_route_metadata is distinct from new.lesson_route_metadata then
    raise exception 'ADLE lesson route metadata is immutable';
  end if;
  return new;
end;
$$;

create trigger daily_assignments_lesson_route_metadata_immutable
before update of lesson_route_metadata on public.daily_assignments
for each row
execute function public.prevent_adle_lesson_route_metadata_update();

-- Keep the composed-plan v1 signature compatible. New callers include
-- lessonRouteMetadata in p_header; old callers omit it and continue to write
-- NULL. Existing payload/item-count patches remain intact because the live
-- function definition is amended in place.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)'::regprocedure
  ) into definition;
  if definition is null then
    raise exception 'Missing composed ADLE persistence function';
  end if;

  definition := replace(
    definition,
    $needle$  if jsonb_typeof(p_items) <> 'array'$needle$,
    $replacement$  if p_header ? 'lessonRouteMetadata'
    and p_header->'lessonRouteMetadata' <> 'null'::jsonb
    and not public.adle_lesson_route_metadata_is_valid_v1(p_header->'lessonRouteMetadata')
  then
    raise exception 'ADLE composed plan route metadata validation failed';
  end if;

  if jsonb_typeof(p_items) <> 'array'$replacement$
  );
  definition := replace(
    definition,
    $needle$target_words, review_words, assignment_generation_source
  ) values ($needle$,
    $replacement$target_words, review_words, assignment_generation_source,
    lesson_route_metadata
  ) values ($replacement$
  );
  definition := replace(
    definition,
    $needle$    p_header->>'assignmentGenerationSource'
  )
  returning id into v_assignment_id;$needle$,
    $replacement$    p_header->>'assignmentGenerationSource',
    case
      when jsonb_typeof(p_header->'lessonRouteMetadata') = 'object'
        then p_header->'lessonRouteMetadata'
      else null
    end
  )
  returning id into v_assignment_id;$replacement$
  );

  if definition not like '%route metadata validation failed%'
    or definition not like '%lesson_route_metadata%'
  then
    raise exception 'Could not safely amend composed ADLE persistence function';
  end if;
  execute definition;
end;
$migration$;

revoke all on function public.persist_adle_composed_daily_plan_v1(
  uuid, uuid, date, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_adle_composed_daily_plan_v1(
  uuid, uuid, date, jsonb, jsonb, jsonb
) to service_role;

-- Base Word keeps its stronger dedicated persistence boundary. Clone the
-- current, forward-patched v1 implementation into a v2 signature and amend
-- only the assignment insert so route metadata is present from creation.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)'::regprocedure
  ) into definition;
  if definition is null then
    raise exception 'Missing base-word persistence function';
  end if;

  definition := regexp_replace(
    definition,
    'FUNCTION public[.]persist_adle_base_word_family_pilot_v1[(]([^)]*)[)]',
    E'FUNCTION public.persist_adle_base_word_family_pilot_v2(\\1, p_route_metadata jsonb)'
  );
  definition := replace(
    definition,
    $needle$begin
  if not exists$needle$,
    $replacement$begin
  if not public.adle_lesson_route_metadata_is_valid_v1(p_route_metadata) then
    raise exception 'ADLE base-word route metadata validation failed';
  end if;
  if not exists$replacement$
  );
  definition := replace(
    definition,
    $needle$insert into public.daily_assignments (child_id, parent_user_id, assignment_date, title, status, target_words, review_words, assignment_generation_source)
  values ($needle$,
    $replacement$insert into public.daily_assignments (child_id, parent_user_id, assignment_date, title, status, target_words, review_words, assignment_generation_source, lesson_route_metadata)
  values ($replacement$
  );
  definition := replace(
    definition,
    $needle$array[]::text[], array[]::text[], 'adle_base_word_family_pilot_v1') returning id into v_assignment_id;$needle$,
    $replacement$array[]::text[], array[]::text[], 'adle_base_word_family_pilot_v1', p_route_metadata) returning id into v_assignment_id;$replacement$
  );

  if definition not like '%persist_adle_base_word_family_pilot_v2%'
    or definition not like '%base-word route metadata validation failed%'
    or definition not like '%lesson_route_metadata%'
  then
    raise exception 'Could not safely create base-word v2 persistence function';
  end if;
  execute definition;
end;
$migration$;

revoke all on function public.persist_adle_base_word_family_pilot_v2(
  uuid, uuid, date, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_adle_base_word_family_pilot_v2(
  uuid, uuid, date, jsonb, jsonb, jsonb
) to service_role;
