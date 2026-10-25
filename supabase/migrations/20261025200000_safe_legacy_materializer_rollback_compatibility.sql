begin;

-- Keep the previous Production worker deployable during this release's
-- rollback window. Its one-argument RPC was removed when the worker moved to
-- the environment-scoped entrypoint. The compatibility signature delegates
-- to the same withdrawal-aware implementation with the Production scope;
-- it must not restore the old unscoped materialization query.
create function public.materialize_writing_known_error_review_candidates(
  p_limit integer default 100
) returns integer
language sql security definer set search_path = public, pg_temp as $$
  select public.materialize_writing_known_error_review_candidates_scoped(
    p_limit, 'production'
  );
$$;

revoke all on function public.materialize_writing_known_error_review_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.materialize_writing_known_error_review_candidates(integer)
  to service_role;

commit;
