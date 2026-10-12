-- Preserve the shared activation CAS; reviewed homophone lessons bind one authority per skill.
begin;
create or replace function public.set_adle_route_activation_revision_v2(
  p_release_manifest_sha256 text,
  p_micro_skill_key text,
  p_environment_key text,
  p_activation_status text,
  p_incomplete_assignment_policy text,
  p_readiness_report jsonb,
  p_expected_current_revision_id uuid,
  p_changed_by text,
  p_change_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release public.adle_curriculum_release_manifests%rowtype;
  v_current_revision_id uuid;
  v_current public.adle_route_activation_revisions%rowtype;
  v_revision_id uuid;
begin
  if p_environment_key not in ('local', 'staging', 'production')
     or p_activation_status not in ('enabled', 'paused', 'safety_revoked')
     or (p_activation_status in ('enabled', 'paused') and p_incomplete_assignment_policy <> 'allow_existing')
     or (p_activation_status = 'safety_revoked' and p_incomplete_assignment_policy <> 'block_incomplete')
     or jsonb_typeof(p_readiness_report) <> 'object'
     or (p_activation_status = 'enabled' and p_readiness_report = '{}'::jsonb)
     or nullif(btrim(p_changed_by), '') is null
     or nullif(btrim(p_change_reason), '') is null then
    raise exception 'invalid ADLE activation revision';
  end if;
  select * into v_release from public.adle_curriculum_release_manifests
  where release_manifest_sha256 = p_release_manifest_sha256;
  if not found then raise exception 'ADLE curriculum release is unavailable'; end if;
  if not exists (
    select 1 from public.adle_curriculum_release_dependencies
    where release_manifest_id = v_release.id and micro_skill_key = p_micro_skill_key
    group by release_manifest_id, micro_skill_key
    having count(*) = case when v_release.route_id = 'homophone_word_lab' and v_release.route_version = 'v2'
      then 1 else 3 end
  ) then raise exception 'ADLE curriculum release does not bind the requested micro-skill'; end if;
  if exists (
    select 1 from public.adle_curriculum_release_dependencies dependency
    left join public.adle_curriculum_dependency_authorities authority
      on authority.id = dependency.authority_id
     and authority.authority_type = dependency.authority_type
     and authority.authority_key = dependency.authority_key
     and authority.schema_version = dependency.authority_schema_version
     and authority.semantic_fingerprint = dependency.semantic_fingerprint
    where dependency.release_manifest_id = v_release.id
      and dependency.micro_skill_key = p_micro_skill_key
      and authority.id is null
  ) then raise exception 'ADLE curriculum release dependency authority is unavailable or mismatched'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_environment_key || ':' || v_release.route_id || ':' || v_release.route_version || ':' || p_micro_skill_key,
    0
  ));
  select current_revision_id into v_current_revision_id
  from public.adle_route_activation_heads
  where environment_key = p_environment_key
    and route_id = v_release.route_id
    and route_version = v_release.route_version
    and micro_skill_key = p_micro_skill_key
  for update;
  if v_current_revision_id is distinct from p_expected_current_revision_id then
    raise exception 'ADLE activation revision compare-and-swap failed';
  end if;
  if v_current_revision_id is not null then
    select * into strict v_current from public.adle_route_activation_revisions
    where id = v_current_revision_id;
    if v_current.release_manifest_id = v_release.id
       and v_current.activation_status = p_activation_status
       and v_current.incomplete_assignment_policy = p_incomplete_assignment_policy
       and v_current.readiness_report = p_readiness_report then
      return v_current.id;
    end if;
  end if;

  insert into public.adle_route_activation_revisions (
    environment_key, release_manifest_id, release_manifest_sha256,
    dependency_fingerprint, route_id, route_version, activation_route_key,
    micro_skill_key, activation_status, incomplete_assignment_policy,
    readiness_report, previous_revision_id, change_reason, changed_by
  ) values (
    p_environment_key, v_release.id, v_release.release_manifest_sha256,
    v_release.dependency_fingerprint, v_release.route_id, v_release.route_version,
    v_release.activation_route_key, p_micro_skill_key, p_activation_status,
    p_incomplete_assignment_policy, p_readiness_report, v_current_revision_id,
    p_change_reason, p_changed_by
  ) returning id into v_revision_id;
  insert into public.adle_route_activation_heads (
    environment_key, route_id, route_version, micro_skill_key,
    current_revision_id, updated_at
  ) values (
    p_environment_key, v_release.route_id, v_release.route_version,
    p_micro_skill_key, v_revision_id, timezone('utc', now())
  ) on conflict (environment_key, route_id, route_version, micro_skill_key)
  do update set current_revision_id = excluded.current_revision_id,
                updated_at = excluded.updated_at;
  return v_revision_id;
end;
$$;
commit;
