begin;

create table public.writing_context_parent_authorisation_decisions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null check (policy_version ~ '^[A-Za-z0-9_.-]{1,80}$'),
  choice text not null check (choice in ('approve', 'decline')),
  copy_version text not null check (copy_version = 'PARENT_WRITING_CONTEXT_BULK_V1'),
  recorded_at timestamptz not null default clock_timestamp()
);
create index writing_context_parent_authorisation_decisions_latest_idx
  on public.writing_context_parent_authorisation_decisions(parent_user_id,child_id,policy_version,recorded_at desc,id desc);
alter table public.writing_context_parent_authorisation_decisions enable row level security;
revoke all on public.writing_context_parent_authorisation_decisions from public,anon,authenticated;
grant select on public.writing_context_parent_authorisation_decisions to service_role;

create function public.apply_parent_writing_context_decisions_v1(
  p_decisions jsonb,
  p_copy_version text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_parent uuid := auth.uid();
  v_policy text;
  v_item jsonb;
  v_child uuid;
  v_choice text;
  v_seen uuid[] := '{}';
  v_now timestamptz := clock_timestamp();
  v_existing timestamptz;
  v_approved integer := 0;
  v_declined integer := 0;
begin
  if v_parent is null or p_copy_version <> 'PARENT_WRITING_CONTEXT_BULK_V1'
     or jsonb_typeof(p_decisions) is distinct from 'array'
     or jsonb_array_length(p_decisions) not between 1 and 100 then
    raise exception 'CONTEXT_BULK_DECISIONS_INVALID';
  end if;
  select learner_policy_version into v_policy from public.writing_context_shadow_policy
  where singleton and dispatch_scope='REAL_LEARNER';
  if nullif(v_policy,'') is null then raise exception 'CONTEXT_BULK_POLICY_UNAVAILABLE'; end if;

  for v_item in select value from jsonb_array_elements(p_decisions) loop
    if jsonb_typeof(v_item) is distinct from 'object' or
       v_item->>'childId' is null or v_item->>'choice' is null or
       v_item->>'choice' not in ('approve','decline') then
      raise exception 'CONTEXT_BULK_ROW_INVALID';
    end if;
    v_child := (v_item->>'childId')::uuid;
    v_choice := v_item->>'choice';
    if v_child = any(v_seen) then raise exception 'CONTEXT_BULK_DUPLICATE_CHILD'; end if;
    v_seen := array_append(v_seen,v_child);
    -- The snapshot trigger locks this same child row. A submission cannot
    -- pass the authorisation check halfway through this batch decision.
    perform 1 from public.children c where c.id=v_child and c.parent_user_id=v_parent
      and not c.is_archived for update;
    if not found or public.context_provider_proof_child(v_child) then
      raise exception 'CONTEXT_BULK_CHILD_NOT_ELIGIBLE';
    end if;

    if v_choice='approve' then
      select max(a.expires_at) into v_existing
      from public.writing_context_learner_authorisations a
      where a.child_id=v_child and a.parent_user_id=v_parent
        and a.policy_version=v_policy and a.authorisation_kind='ADULT_SUBMISSION'
        and a.approved_by=v_parent and a.expires_at>v_now
        and not exists (select 1 from public.writing_context_approval_revocations r
          where r.learner_authorisation_id=a.id);
      if v_existing is null or v_existing<=v_now+interval '7 days' then
        insert into public.writing_context_learner_authorisations
          (child_id,parent_user_id,policy_version,evidence_ref,approved_by,
           approved_at,expires_at,authorisation_kind)
        values (v_child,v_parent,v_policy,'parent-dashboard/context-bulk-v1',v_parent,
          v_now,v_now+interval '30 days','ADULT_SUBMISSION');
      end if;
      v_approved := v_approved+1;
    else
      -- Revoking every still-unrevoked authorisation also stops a pinned
      -- pending send that refers to an older authorisation for this child.
      insert into public.writing_context_approval_revocations
        (learner_authorisation_id,revoked_by,evidence_ref)
      select a.id,v_parent,'parent-dashboard/context-decline-v1'
      from public.writing_context_learner_authorisations a
      where a.child_id=v_child and a.parent_user_id=v_parent
        and a.policy_version=v_policy and a.authorisation_kind='ADULT_SUBMISSION'
        and not exists (select 1 from public.writing_context_approval_revocations r
          where r.learner_authorisation_id=a.id);
      v_declined := v_declined+1;
    end if;
    insert into public.writing_context_parent_authorisation_decisions
      (child_id,parent_user_id,policy_version,choice,copy_version)
    values (v_child,v_parent,v_policy,v_choice,p_copy_version);
  end loop;
  return jsonb_build_object('approved',v_approved,'declined',v_declined);
end $$;
revoke all on function public.apply_parent_writing_context_decisions_v1(jsonb,text)
  from public,anon;
grant execute on function public.apply_parent_writing_context_decisions_v1(jsonb,text)
  to authenticated;

-- Parent approval is now explicit. A previous decline can be reversed by a
-- later approval, while an ordinary adult submission cannot restore consent.
create or replace function public.stamp_context_source_purpose() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype;
begin
  perform 1 from public.children where id=new.child_id for update;
  new.source_purpose:=case when public.context_provider_proof_child(new.child_id)
    then 'DISPOSABLE_PROVIDER_PROOF' else 'REAL_LEARNER' end;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.dispatch_scope is distinct from new.source_purpose or p.dispatch_scope='DENY' then
    new.envelope:=new.envelope || jsonb_build_object('contextAiShadowCapture',false,'contextAiModeAtCapture','disabled');
    return new;
  end if;
  if new.source_purpose='REAL_LEARNER' and new.envelope->>'contextAiShadowCapture'='true' then
    select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
    if a.id is null or a.retention_mode<>'STANDARD_API' or a.zdr_verified
      or not a.data_sharing_disabled or a.dispatch_scope<>'REAL_LEARNER'
      or a.expires_at<=clock_timestamp() or new.occurred_at<a.approved_at
      or exists(select 1 from public.writing_context_approval_revocations r
        where r.provider_approval_id=a.id)
      or not exists(select 1 from public.writing_context_learner_authorisations l
        where l.child_id=new.child_id and l.parent_user_id=new.parent_user_id
          and l.policy_version=p.learner_policy_version
          and l.authorisation_kind='ADULT_SUBMISSION' and l.approved_by=new.parent_user_id
          and l.approved_at<=new.occurred_at and l.expires_at>clock_timestamp()
          and not exists(select 1 from public.writing_context_approval_revocations r
            where r.learner_authorisation_id=l.id)) then
      new.envelope:=new.envelope || jsonb_build_object('contextAiShadowCapture',false,'contextAiModeAtCapture','disabled');
    end if;
  end if;
  return new;
end $$;

commit;
