-- Forward correction for staging environments that applied 20260731120000
-- before the structural validator's object-key count was exercised by a live
-- writer. PostgreSQL object cardinality is derived from jsonb_object_keys().
-- Replacing the pure validator is safe for fresh and already-migrated schemas.

create or replace function public.adle_lesson_route_metadata_is_valid_v1(
  p_metadata jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_metadata) <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata)) <> 4
    or jsonb_typeof(p_metadata->'metadataSchemaVersion') <> 'number'
    or (p_metadata->>'metadataSchemaVersion') !~ '^[0-9]+$'
    or (p_metadata->>'metadataSchemaVersion')::integer <> 1
    or jsonb_typeof(p_metadata->'route') <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata->'route')) <> 2
    or nullif(btrim(p_metadata#>>'{route,routeId}'), '') is null
    or nullif(btrim(p_metadata#>>'{route,routeVersion}'), '') is null
    or jsonb_typeof(p_metadata->'recipe') <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata->'recipe')) <> 2
    or nullif(btrim(p_metadata#>>'{recipe,recipeKey}'), '') is null
    or nullif(btrim(p_metadata#>>'{recipe,recipeVersion}'), '') is null
    or jsonb_typeof(p_metadata->'payload') <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata->'payload')) <> 2
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
