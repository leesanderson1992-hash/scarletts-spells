-- Synthetic adult proof may use a deployment-bound Preview approval.
create or replace function public.context_shadow_scope_authorised(p_snapshot uuid,p_authorisation uuid default null) returns boolean
language sql volatile security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.writing_source_snapshots s
    join public.writing_context_shadow_policy p on p.singleton and p.dispatch_scope=s.source_purpose
    join public.writing_context_provider_approvals a on a.id=p.provider_approval_id
      and a.environment in ('production','staging') and a.dispatch_scope=p.dispatch_scope
    join public.writing_context_learner_authorisations l on l.child_id=s.child_id and l.parent_user_id=s.parent_user_id
      and l.policy_version=p.learner_policy_version and l.approved_at<=s.occurred_at and l.expires_at>clock_timestamp()
      and (p_authorisation is null or l.id=p_authorisation)
    where s.id=p_snapshot and p.dispatch_scope<>'DENY'
      and not exists(select 1 from public.writing_context_approval_revocations r where r.learner_authorisation_id=l.id)
      and ((s.source_purpose='REAL_LEARNER' and l.authorisation_kind='ADULT_SUBMISSION'
          and l.approved_by=s.parent_user_id and a.retention_mode='STANDARD_API'
          and not public.context_provider_proof_child(s.child_id))
        or (s.source_purpose='DISPOSABLE_PROVIDER_PROOF' and l.authorisation_kind='OPERATOR_PROOF'
          and l.approved_by=s.parent_user_id and exists(select 1 from public.writing_context_provider_proof_learners f
            where f.child_id=s.child_id and f.parent_user_id=s.parent_user_id and f.task_id=s.task_id
              and f.approved_at<=s.occurred_at and f.expires_at>clock_timestamp()))));
$$;
