-- A concurrent claimed job is retried shortly without spending a reservation.
create function public.defer_writing_context_shadow_briefly(p_job_id uuid,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.writing_context_shadow_jobs set status='deferred',
    next_eligible_at=clock_timestamp()+interval '1 minute',claim_token=null,claimed_at=null
    where id=p_job_id and claim_token=p_claim_token and status='processing'
      and not exists(select 1 from public.writing_context_shadow_dispatches d
        where d.job_id=p_job_id and d.state in ('reserved','sent'));
  return found;
end $$;
create function public.defer_adle_review_context_briefly(p_job_id uuid,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.adle_review_context_jobs set status='deferred',
    next_eligible_at=clock_timestamp()+interval '1 minute',claim_token=null,claimed_at=null
    where id=p_job_id and claim_token=p_claim_token and status='processing'
      and not exists(select 1 from public.adle_review_context_dispatches d
        where d.job_id=p_job_id and d.state in ('reserved','sent'));
  return found;
end $$;
revoke all on function public.defer_writing_context_shadow_briefly(uuid,uuid),
  public.defer_adle_review_context_briefly(uuid,uuid) from public,anon,authenticated;
grant execute on function public.defer_writing_context_shadow_briefly(uuid,uuid),
  public.defer_adle_review_context_briefly(uuid,uuid) to service_role;
