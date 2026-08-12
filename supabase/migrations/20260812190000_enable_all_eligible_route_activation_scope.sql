-- CW-3C-2: allow the existing shared release-bound assignment guard to admit
-- every otherwise-eligible child. This migration creates no activation,
-- learner item, assignment, evidence, completion, or schedule row.

begin;

create or replace function public.adle_release_activation_allows_child_v2(
  p_activation_revision_id uuid,
  p_child_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_child_id is not null and exists (
    select 1
    from public.adle_route_activation_revisions revision
    join public.adle_route_activation_heads head
      on head.current_revision_id = revision.id
     and head.environment_key = revision.environment_key
     and head.route_id = revision.route_id
     and head.route_version = revision.route_version
     and head.micro_skill_key = revision.micro_skill_key
    where revision.id = p_activation_revision_id
      and revision.activation_status = 'enabled'
      and revision.readiness_report->>'schemaVersion' = '1'
      and revision.readiness_report->>'emergencyDisableAvailable' = 'true'
      and (
        (
          revision.readiness_report#>>'{scope,kind}' = 'all_eligible'
          and jsonb_typeof(revision.readiness_report->'scope') = 'object'
          and jsonb_object_length(revision.readiness_report->'scope') = 1
        )
        or (
          revision.readiness_report#>>'{scope,kind}' = 'child_allowlist'
          and jsonb_typeof(revision.readiness_report#>'{scope,childIds}') = 'array'
          and jsonb_array_length(revision.readiness_report#>'{scope,childIds}') > 0
          and revision.readiness_report#>'{scope,childIds}' ? p_child_id::text
        )
      )
  );
$$;

revoke all on function public.adle_release_activation_allows_child_v2(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.adle_release_activation_allows_child_v2(uuid,uuid)
  to service_role;

commit;
