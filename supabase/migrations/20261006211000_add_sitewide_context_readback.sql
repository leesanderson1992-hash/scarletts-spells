-- No writing content or account identifiers in operational readback.
create function public.writing_context_sitewide_status()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'control',(select jsonb_build_object('enabled',c.enabled,'aiMode',c.ai_mode)
      from public.writing_context_advisory_control c where c.singleton),
    'policy',(select jsonb_build_object('executionPolicy',p.execution_policy_kind,
      'dispatchScope',p.dispatch_scope,'providerApprovalId',p.provider_approval_id,
      'revisionId',p.revision_id,'maxRequestsPerDay',p.max_requests_per_day,
      'maxUsdPerDay',p.max_usd_per_day,'maxUsdPerRequest',p.max_usd_per_request)
      from public.writing_context_shadow_policy p where p.singleton),
    'providerApproval',(select jsonb_build_object('deploymentSha',a.deployment_sha,
      'runtimeFingerprint',a.runtime_fingerprint,'approvedAt',a.approved_at,
      'expiresAt',a.expires_at,'environment',a.environment)
      from public.writing_context_provider_approvals a
      join public.writing_context_shadow_policy p on p.provider_approval_id=a.id and p.singleton),
    'scheduler',(select jsonb_build_object('enabled',s.enabled,'jobId',s.cron_job_id,
      'deploymentSha',s.approved_deployment_sha,'lastDispatchedAt',s.last_dispatched_at)
      from public.writing_context_recovery_scheduler s where s.singleton),
    'courseJobs',(select jsonb_object_agg(status,n) from (select status,count(*) n
      from public.writing_context_shadow_jobs group by status) x),
    'adleJobs',(select jsonb_object_agg(status,n) from (select status,count(*) n
      from public.adle_review_context_jobs group by status) x),
    'oldestReadyQueueSeconds',(select coalesce(max(extract(epoch from clock_timestamp()-created_at)),0)
      from (select created_at from public.writing_context_shadow_jobs
        where status='pending' or status='deferred' and next_eligible_at<=clock_timestamp()
        union all select created_at from public.adle_review_context_jobs
        where status='pending' or status='deferred' and next_eligible_at<=clock_timestamp()) q),
    'today',(select jsonb_build_object('requestsReserved',coalesce(sum(requests_reserved),0),
      'requestsAdmitted',coalesce(sum(requests_admitted),0),
      'reservedUsd',coalesce(sum(reserved_usd),0),
      'admittedExposureUsd',coalesce(sum(admitted_exposure_usd),0))
      from public.writing_context_shadow_consumption
      where budget_day=(clock_timestamp() at time zone 'UTC')::date),
    'unrecordedSends',
      (select count(*) from public.writing_context_shadow_dispatches d where d.sent_at is not null
        and d.sent_at<clock_timestamp()-interval '60 seconds' and not exists(
          select 1 from public.writing_context_ai_attempts a where a.dispatch_id=d.id))
      +(select count(*) from public.adle_review_context_dispatches d where d.sent_at is not null
        and d.sent_at<clock_timestamp()-interval '60 seconds' and not exists(
          select 1 from public.adle_review_context_attempts a where a.dispatch_id=d.id))
  );
$$;
revoke all on function public.writing_context_sitewide_status() from public,anon,authenticated;
grant execute on function public.writing_context_sitewide_status() to service_role;
