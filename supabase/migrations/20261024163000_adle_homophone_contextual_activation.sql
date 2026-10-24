-- Route-specific activation keeps the one-authority contextual release separate
-- from the three-authority morphology activation contract.
begin;
create function public.set_adle_homophone_contextual_activation_v1(
  p_release_manifest_sha256 text,p_micro_skill_key text,p_environment_key text,
  p_activation_status text,p_readiness_report jsonb,
  p_expected_current_revision_id uuid,p_changed_by text,p_change_reason text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare release_row public.adle_curriculum_release_manifests%rowtype;
  previous_id uuid; previous public.adle_route_activation_revisions%rowtype;
  revision_id uuid;
begin
  if p_environment_key not in ('local','production')
    or p_activation_status not in ('enabled','paused','safety_revoked')
    or jsonb_typeof(p_readiness_report) is distinct from 'object'
    or (p_activation_status='enabled' and p_readiness_report='{}'::jsonb)
    or nullif(btrim(p_changed_by),'') is null
    or nullif(btrim(p_change_reason),'') is null
  then raise exception 'contextual homophone activation input invalid'; end if;
  select * into strict release_row from public.adle_curriculum_release_manifests
    where release_manifest_sha256=p_release_manifest_sha256
      and route_id='homophone_contextual_choice' and route_version='v1'
      and activation_route_key='homophone_contextual_choice:v1' and payload_version=1;
  if (select count(*) from public.adle_curriculum_release_dependencies
      where release_manifest_id=release_row.id and micro_skill_key=p_micro_skill_key
        and authority_type='homophone_contextual_content')<>1
    or exists(select 1 from public.adle_curriculum_release_dependencies d
      left join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
      where d.release_manifest_id=release_row.id and d.micro_skill_key=p_micro_skill_key
        and (d.authority_type<>'homophone_contextual_content'
          or a.authority_type<>d.authority_type or a.authority_key<>d.authority_key
          or a.schema_version<>d.authority_schema_version
          or a.semantic_fingerprint<>d.semantic_fingerprint
          or a.semantic_fingerprint<>public.adle_generic_snapshot_json_sha256_v1(a.semantic_projection)))
  then raise exception 'contextual homophone dependency invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_environment_key||':homophone_contextual_choice:v1:'||p_micro_skill_key,0));
  select current_revision_id into previous_id from public.adle_route_activation_heads
    where environment_key=p_environment_key and route_id='homophone_contextual_choice'
      and route_version='v1' and micro_skill_key=p_micro_skill_key for update;
  if previous_id is distinct from p_expected_current_revision_id
  then raise exception 'contextual homophone activation compare-and-swap failed'; end if;
  if previous_id is not null then
    select * into strict previous from public.adle_route_activation_revisions where id=previous_id;
    if previous.release_manifest_id=release_row.id
      and previous.activation_status=p_activation_status
      and previous.incomplete_assignment_policy=(case when p_activation_status='safety_revoked'
        then 'block_incomplete' else 'allow_existing' end)
      and previous.readiness_report=p_readiness_report
    then return previous.id; end if;
  end if;
  insert into public.adle_route_activation_revisions(
    environment_key,release_manifest_id,release_manifest_sha256,dependency_fingerprint,
    route_id,route_version,activation_route_key,micro_skill_key,activation_status,
    incomplete_assignment_policy,readiness_report,previous_revision_id,change_reason,changed_by)
  values(p_environment_key,release_row.id,release_row.release_manifest_sha256,
    release_row.dependency_fingerprint,'homophone_contextual_choice','v1',
    'homophone_contextual_choice:v1',p_micro_skill_key,p_activation_status,
    case when p_activation_status='safety_revoked' then 'block_incomplete' else 'allow_existing' end,
    p_readiness_report,previous_id,p_change_reason,p_changed_by)
  returning id into revision_id;
  insert into public.adle_route_activation_heads(environment_key,route_id,route_version,
    micro_skill_key,current_revision_id,updated_at)
  values(p_environment_key,'homophone_contextual_choice','v1',p_micro_skill_key,
    revision_id,timezone('utc',now()))
  on conflict(environment_key,route_id,route_version,micro_skill_key)
  do update set current_revision_id=excluded.current_revision_id,updated_at=excluded.updated_at;
  return revision_id;
end $$;
revoke all on function public.set_adle_homophone_contextual_activation_v1(
  text,text,text,text,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_adle_homophone_contextual_activation_v1(
  text,text,text,text,jsonb,uuid,text,text) to service_role;
commit;
