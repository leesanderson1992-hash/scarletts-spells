-- Forward correction for staging: ordinary authenticated updates to
-- daily_assignments re-evaluate the route-metadata CHECK constraint and must
-- be allowed to execute its pure structural predicate.

grant execute on function public.adle_lesson_route_metadata_is_valid_v1(jsonb)
to authenticated, service_role;
