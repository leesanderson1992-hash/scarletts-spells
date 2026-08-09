-- BW-2A-1: allow future release-ledger assignments to retain exact immutable
-- curriculum release and operational activation-revision provenance. Existing
-- writers continue to emit schema v1 until separately integrated.

begin;

create or replace function public.adle_lesson_route_metadata_is_valid_v2(
  p_metadata jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_metadata) <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata)) <> 5
    or jsonb_typeof(p_metadata->'metadataSchemaVersion') <> 'number'
    or (p_metadata->>'metadataSchemaVersion') !~ '^[0-9]+$'
    or (p_metadata->>'metadataSchemaVersion')::integer <> 2
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
    or jsonb_typeof(p_metadata->'curriculumRelease') <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata->'curriculumRelease')) <> 5
    or (p_metadata#>>'{curriculumRelease,activationRevisionId}') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or (p_metadata#>>'{curriculumRelease,releaseManifestId}') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or nullif(btrim(p_metadata#>>'{curriculumRelease,releaseKey}'), '') is null
    or (p_metadata#>>'{curriculumRelease,releaseManifestSha256}') !~ '^[a-f0-9]{64}$'
    or (p_metadata#>>'{curriculumRelease,dependencyFingerprint}') !~ '^[a-f0-9]{64}$'
  then
    return false;
  end if;
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.adle_lesson_route_metadata_is_valid_v2(jsonb)
from public, anon, authenticated;
grant execute on function public.adle_lesson_route_metadata_is_valid_v2(jsonb)
to authenticated, service_role;

alter table public.daily_assignments
  drop constraint daily_assignments_lesson_route_metadata_v1_check;

alter table public.daily_assignments
  add constraint daily_assignments_lesson_route_metadata_versioned_check
  check (
    lesson_route_metadata is null
    or public.adle_lesson_route_metadata_is_valid_v1(lesson_route_metadata)
    or public.adle_lesson_route_metadata_is_valid_v2(lesson_route_metadata)
  );

commit;
