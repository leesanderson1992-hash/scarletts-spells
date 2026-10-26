-- Every learner completion updates the assignment header as authenticated.
-- The structural dispatcher is pure, but PostgreSQL checks EXECUTE on all
-- referenced route validators while planning its CASE expression. The new
-- contextual homophone validator is service-role only, so unrelated routes
-- (including Dynamic Prefix) cannot finish. Run the dispatcher with its
-- existing postgres owner while keeping the individual validators private.
begin;

do $$
begin
  if pg_get_userbyid((select proowner from pg_proc
      where oid = 'public.adle_lesson_snapshot_is_structurally_valid(jsonb)'::regprocedure)) <> 'postgres'
    or (select prosecdef from pg_proc
      where oid = 'public.adle_lesson_snapshot_is_structurally_valid(jsonb)'::regprocedure)
  then
    raise exception 'Lesson snapshot dispatcher ownership/security preflight changed';
  end if;
end $$;

alter function public.adle_lesson_snapshot_is_structurally_valid(jsonb)
  security definer;

commit;
