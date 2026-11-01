begin;

-- A renewal is a new immutable parent decision. The old authorisation and
-- any provider approval remain untouched.
create or replace function public.renew_parent_writing_context_authorisation_v1(
  p_child_id uuid,
  p_copy_version text
) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_parent uuid := auth.uid();
  v_policy text;
  v_existing timestamptz;
  v_now timestamptz := clock_timestamp();
  v_expiry timestamptz;
begin
  if v_parent is null or p_child_id is null
     or p_copy_version <> 'PARENT_WRITING_CONTEXT_RENEWAL_V1' then
    raise exception 'CONTEXT_RENEWAL_IDENTITY_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_parent::text || ':' || p_child_id::text, 0));
  if not exists (select 1 from public.children c where c.id=p_child_id
    and c.parent_user_id=v_parent and not c.is_archived) then
    raise exception 'CONTEXT_RENEWAL_CHILD_NOT_OWNED';
  end if;
  select learner_policy_version into v_policy
  from public.writing_context_shadow_policy
  where singleton and dispatch_scope='REAL_LEARNER';
  if nullif(v_policy,'') is null then raise exception 'CONTEXT_RENEWAL_POLICY_UNAVAILABLE'; end if;
  -- The existing source capture gate treats a prior revocation as a stop for
  -- this child and policy. A new consent must not appear to override it.
  if exists (select 1 from public.writing_context_approval_revocations r
    join public.writing_context_learner_authorisations a on a.id=r.learner_authorisation_id
    where a.child_id=p_child_id and a.parent_user_id=v_parent
      and a.policy_version=v_policy) then
    raise exception 'CONTEXT_RENEWAL_PRIOR_REVOCATION_REQUIRES_REVIEW';
  end if;
  select max(a.expires_at) into v_existing
  from public.writing_context_learner_authorisations a
  where a.child_id=p_child_id and a.parent_user_id=v_parent
    and a.policy_version=v_policy and a.authorisation_kind='ADULT_SUBMISSION'
    and a.approved_by=v_parent and a.expires_at>v_now;
  if v_existing>v_now+interval '7 days' then return v_existing; end if;
  v_expiry := v_now+interval '30 days';
  insert into public.writing_context_learner_authorisations
    (child_id,parent_user_id,policy_version,evidence_ref,approved_by,
     approved_at,expires_at,authorisation_kind)
  values (p_child_id,v_parent,v_policy,
    'parent-dashboard/context-renewal-v1',v_parent,v_now,v_expiry,'ADULT_SUBMISSION');
  return v_expiry;
end;
$$;

revoke all on function public.renew_parent_writing_context_authorisation_v1(uuid,text)
  from public, anon;
grant execute on function public.renew_parent_writing_context_authorisation_v1(uuid,text)
  to authenticated;

commit;
