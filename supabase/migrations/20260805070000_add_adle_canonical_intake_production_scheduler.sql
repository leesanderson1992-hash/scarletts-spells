begin;

-- Vercel Hobby permits only daily Cron jobs. The canonical-intake safety
-- sweep remains application-owned, while production Supabase Cron supplies
-- the reviewed five-minute trigger through the CRON_SECRET-protected route.
-- This migration is production-only; the staging scheduler retains its own
-- table, functions, target, secret name, and confirmation tokens.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.adle_canonical_intake_production_scheduler_config (
  scheduler_key text primary key,
  scheduler_kind text not null,
  environment text not null,
  target_url text not null,
  cron_job_name text not null unique,
  cron_schedule text not null,
  cron_secret_name text not null,
  enabled boolean not null default false,
  cron_job_id bigint,
  last_request_id bigint,
  last_dispatched_at timestamptz,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_canonical_intake_production_scheduler_key_check check (
    scheduler_key = 'production_supabase_cron_v1'
  ),
  constraint adle_canonical_intake_production_scheduler_kind_check check (
    scheduler_kind = 'supabase_cron_http'
  ),
  constraint adle_canonical_intake_production_scheduler_environment_check check (
    environment = 'production'
  ),
  constraint adle_canonical_intake_production_scheduler_target_check check (
    target_url = 'https://scarletts-spells.vercel.app/api/internal/adle-canonical-intake/reconcile'
  ),
  constraint adle_canonical_intake_production_scheduler_job_check check (
    cron_job_name = 'adle-canonical-intake-production-safety-sweep-v1'
    and cron_schedule = '*/5 * * * *'
  ),
  constraint adle_canonical_intake_production_scheduler_secret_name_check check (
    cron_secret_name = 'adle_canonical_intake_production_cron_secret'
  )
);

alter table public.adle_canonical_intake_production_scheduler_config enable row level security;
revoke all on table public.adle_canonical_intake_production_scheduler_config from public, anon, authenticated;

create or replace function public.adle_dispatch_canonical_intake_production_safety_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_config public.adle_canonical_intake_production_scheduler_config%rowtype;
  v_cron_secret text;
  v_request_id bigint;
begin
  select config.* into v_config
  from public.adle_canonical_intake_production_scheduler_config config
  where config.scheduler_key = 'production_supabase_cron_v1'
    and config.enabled
  for update;

  if not found then
    raise exception 'canonical intake production scheduler is not enabled';
  end if;

  select secret.decrypted_secret into v_cron_secret
  from vault.decrypted_secrets secret
  where secret.name = v_config.cron_secret_name;
  if not found or btrim(coalesce(v_cron_secret, '')) = '' then
    raise exception 'canonical intake production cron secret is unavailable';
  end if;

  select net.http_get(
    url := v_config.target_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_cron_secret,
      'Accept', 'application/json',
      'User-Agent', 'scarletts-spells-production-supabase-cron/1'
    ),
    timeout_milliseconds := 15000
  ) into v_request_id;

  update public.adle_canonical_intake_production_scheduler_config config set
    last_request_id = v_request_id,
    last_dispatched_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where config.scheduler_key = v_config.scheduler_key;

  return v_request_id;
end;
$$;

create or replace function public.adle_activate_canonical_intake_production_scheduler(
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job_id bigint;
  v_cron_secret_ready boolean;
begin
  if p_confirmation <> 'activate:adle-canonical-intake-production-supabase-cron-v1:wwohrqtunajrbwxyssjf' then
    raise exception 'canonical intake production scheduler confirmation is invalid';
  end if;

  select exists(
    select 1 from vault.decrypted_secrets secret
    where secret.name = 'adle_canonical_intake_production_cron_secret'
      and btrim(coalesce(secret.decrypted_secret, '')) <> ''
  ) into v_cron_secret_ready;
  if not v_cron_secret_ready then
    raise exception 'canonical intake production scheduler Vault secret is incomplete';
  end if;

  insert into public.adle_canonical_intake_production_scheduler_config(
    scheduler_key, scheduler_kind, environment, target_url,
    cron_job_name, cron_schedule, cron_secret_name,
    enabled, activated_at, deactivated_at
  ) values (
    'production_supabase_cron_v1', 'supabase_cron_http', 'production',
    'https://scarletts-spells.vercel.app/api/internal/adle-canonical-intake/reconcile',
    'adle-canonical-intake-production-safety-sweep-v1', '*/5 * * * *',
    'adle_canonical_intake_production_cron_secret',
    true, timezone('utc', now()), null
  )
  on conflict (scheduler_key) do update set
    enabled = true,
    activated_at = timezone('utc', now()),
    deactivated_at = null,
    updated_at = timezone('utc', now());

  select cron.schedule(
    'adle-canonical-intake-production-safety-sweep-v1',
    '*/5 * * * *',
    'select public.adle_dispatch_canonical_intake_production_safety_sweep();'
  ) into v_job_id;

  update public.adle_canonical_intake_production_scheduler_config config set
    cron_job_id = v_job_id,
    updated_at = timezone('utc', now())
  where config.scheduler_key = 'production_supabase_cron_v1';

  return jsonb_build_object(
    'schedulerKey', 'production_supabase_cron_v1',
    'environment', 'production',
    'targetHost', 'scarletts-spells.vercel.app',
    'schedule', '*/5 * * * *',
    'cronJobId', v_job_id,
    'enabled', true,
    'vaultSecretReady', true
  );
end;
$$;

create or replace function public.adle_deactivate_canonical_intake_production_scheduler(
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job_id bigint;
begin
  if p_confirmation <> 'deactivate:adle-canonical-intake-production-supabase-cron-v1:wwohrqtunajrbwxyssjf' then
    raise exception 'canonical intake production scheduler deactivation confirmation is invalid';
  end if;

  select job.jobid into v_job_id
  from cron.job job
  where job.jobname = 'adle-canonical-intake-production-safety-sweep-v1';
  if found then
    perform cron.unschedule(v_job_id);
  end if;

  update public.adle_canonical_intake_production_scheduler_config config set
    enabled = false,
    cron_job_id = null,
    deactivated_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where config.scheduler_key = 'production_supabase_cron_v1';

  return jsonb_build_object(
    'schedulerKey', 'production_supabase_cron_v1',
    'environment', 'production',
    'enabled', false,
    'unscheduledJobId', v_job_id
  );
end;
$$;

create or replace function public.adle_canonical_intake_production_scheduler_status()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'configured', config.scheduler_key is not null,
    'schedulerKey', config.scheduler_key,
    'environment', config.environment,
    'targetHost', case when config.target_url is null then null else split_part(split_part(config.target_url, '://', 2), '/', 1) end,
    'schedule', config.cron_schedule,
    'enabled', coalesce(config.enabled, false),
    'cronJobId', job.jobid,
    'cronJobActive', coalesce(job.active, false),
    'cronSecretReady', exists(
      select 1 from vault.decrypted_secrets secret
      where secret.name = config.cron_secret_name
        and btrim(coalesce(secret.decrypted_secret, '')) <> ''
    ),
    'lastRequestId', config.last_request_id,
    'lastDispatchedAt', config.last_dispatched_at,
    'lastHttpStatus', response.status_code,
    'lastHttpTimedOut', response.timed_out,
    'lastHttpError', response.error_msg,
    'lastHttpObservedAt', response.created
  )
  from (select 1) singleton
  left join public.adle_canonical_intake_production_scheduler_config config
    on config.scheduler_key = 'production_supabase_cron_v1'
  left join cron.job job
    on job.jobname = config.cron_job_name
  left join net._http_response response
    on response.id = config.last_request_id;
$$;

revoke all on function public.adle_dispatch_canonical_intake_production_safety_sweep() from public, anon, authenticated;
revoke all on function public.adle_activate_canonical_intake_production_scheduler(text) from public, anon, authenticated;
revoke all on function public.adle_deactivate_canonical_intake_production_scheduler(text) from public, anon, authenticated;
revoke all on function public.adle_canonical_intake_production_scheduler_status() from public, anon, authenticated;
grant execute on function public.adle_dispatch_canonical_intake_production_safety_sweep() to service_role;
grant execute on function public.adle_activate_canonical_intake_production_scheduler(text) to service_role;
grant execute on function public.adle_deactivate_canonical_intake_production_scheduler(text) to service_role;
grant execute on function public.adle_canonical_intake_production_scheduler_status() to service_role;

commit;
