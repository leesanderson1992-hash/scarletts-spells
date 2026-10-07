-- Production scheduler is inert until a separate owner-approved activation.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.writing_context_recovery_scheduler (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  target_url text not null default 'https://scarletts-spells.vercel.app/api/internal/context-recovery',
  cron_job_name text not null default 'writing-context-production-recovery-v1',
  cron_schedule text not null default '*/5 * * * *',
  vault_secret_name text not null default 'writing_context_production_cron_secret',
  cron_job_id bigint,
  last_request_id bigint,
  last_dispatched_at timestamptz,
  approved_deployment_sha text check(approved_deployment_sha is null or approved_deployment_sha ~ '^[a-f0-9]{40}$'),
  check(target_url='https://scarletts-spells.vercel.app/api/internal/context-recovery'),
  check(cron_job_name='writing-context-production-recovery-v1' and cron_schedule='*/5 * * * *')
);
insert into public.writing_context_recovery_scheduler(singleton) values(true);
alter table public.writing_context_recovery_scheduler enable row level security;
revoke all on public.writing_context_recovery_scheduler from public,anon,authenticated;
grant select on public.writing_context_recovery_scheduler to service_role;

create function public.dispatch_writing_context_recovery() returns bigint
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare c public.writing_context_recovery_scheduler%rowtype;
  v_secret text; v_request bigint;
begin
  select * into c from public.writing_context_recovery_scheduler where singleton and enabled for update;
  if c.singleton is null then return null; end if;
  if not exists(select 1 from public.writing_context_shadow_policy p
    join public.writing_context_provider_approvals a on a.id=p.provider_approval_id
    where p.singleton and a.deployment_sha=c.approved_deployment_sha
      and a.expires_at>clock_timestamp()) then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name=c.vault_secret_name;
  if nullif(btrim(v_secret),'') is null then raise exception 'context_scheduler_secret_unavailable'; end if;
  select net.http_get(url:=c.target_url,
    headers:=jsonb_build_object('Authorization','Bearer '||v_secret,
      'Accept','application/json','User-Agent','scarletts-spells-context-supabase-cron/1'),
    timeout_milliseconds:=15000) into v_request;
  update public.writing_context_recovery_scheduler
    set last_request_id=v_request,last_dispatched_at=clock_timestamp() where singleton;
  return v_request;
end $$;

create function public.activate_writing_context_recovery_scheduler(p_deployment_sha text,p_approval_id uuid)
returns bigint language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_secret text; v_job bigint;
begin
  if not exists(select 1 from public.writing_context_provider_approvals a
    join public.writing_context_shadow_policy p on p.provider_approval_id=a.id and p.singleton
    where a.id=p_approval_id and a.deployment_sha=p_deployment_sha
      and a.environment='production' and a.expires_at>clock_timestamp()
      and p.execution_policy_kind='ADULT_RELEASE' and p.dispatch_scope='REAL_LEARNER'
      and public.context_shadow_execution_ready(p.revision_id)) then
    raise exception 'context_scheduler_approval_unavailable'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
    where name='writing_context_production_cron_secret';
  if nullif(btrim(v_secret),'') is null then raise exception 'context_scheduler_secret_unavailable'; end if;
  select cron.schedule('writing-context-production-recovery-v1','*/5 * * * *',
    'select public.dispatch_writing_context_recovery();') into v_job;
  update public.writing_context_recovery_scheduler set enabled=true,
    approved_deployment_sha=p_deployment_sha,cron_job_id=v_job where singleton;
  return v_job;
end $$;

create function public.deactivate_writing_context_recovery_scheduler()
returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_job bigint;
begin
  select cron_job_id into v_job from public.writing_context_recovery_scheduler where singleton for update;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  update public.writing_context_recovery_scheduler set enabled=false,cron_job_id=null where singleton;
  return true;
end $$;
revoke all on function public.dispatch_writing_context_recovery(),
  public.activate_writing_context_recovery_scheduler(text,uuid),
  public.deactivate_writing_context_recovery_scheduler() from public,anon,authenticated;
grant execute on function public.dispatch_writing_context_recovery() to postgres;
grant execute on function public.activate_writing_context_recovery_scheduler(text,uuid),
  public.deactivate_writing_context_recovery_scheduler() to service_role;
