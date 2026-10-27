-- Read-only projection of immutable, currently enabled inflection releases.
-- A word detail request receives only that word's membership facts, rather
-- than transferring every reviewed JSON authority to the application.
begin;

create or replace function public.adle_released_inflection_memberships_v1(
  p_environment_key text,
  p_word_ids uuid[] default null
) returns table (
  canonical_word_id uuid,
  micro_skill_key text,
  member_role text,
  row_status text,
  review_status text,
  content_valid boolean,
  provenance_id text,
  release_manifest_id uuid,
  release_key text,
  release_manifest_sha256 text,
  authority_id uuid,
  authority_fingerprint text,
  family_key text
) language sql stable security definer set search_path=public,pg_temp as $$
  with active as materialized (
    select h.route_id, h.micro_skill_key, r.release_manifest_id,
      m.release_key, m.release_manifest_sha256, a.id as authority_id,
      a.semantic_fingerprint as authority_fingerprint,
      a.semantic_projection, d.authority_type
    from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    join public.adle_curriculum_release_manifests m on m.id=r.release_manifest_id
    join public.adle_curriculum_release_dependencies d
      on d.release_manifest_id=m.id and d.micro_skill_key=h.micro_skill_key
    join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where p_environment_key in ('local','staging','production')
      and h.environment_key=p_environment_key
      and h.route_id in ('ing_endings_word_lab','comparative_superlative_word_lab')
      and h.route_version='v1' and r.route_id=h.route_id
      and r.route_version=h.route_version and r.micro_skill_key=h.micro_skill_key
      and r.activation_status='enabled'
      and m.route_id=h.route_id and m.route_version=h.route_version
      and m.release_manifest_sha256=r.release_manifest_sha256
      and m.dependency_fingerprint=r.dependency_fingerprint
      and a.authority_type=d.authority_type and a.authority_key=d.authority_key
      and a.schema_version=1 and a.semantic_fingerprint=d.semantic_fingerprint
      and public.adle_generic_snapshot_json_sha256_v1(a.semantic_projection)=a.semantic_fingerprint
      and a.semantic_projection->>'microSkillKey'=h.micro_skill_key
      and ((h.route_id='ing_endings_word_lab' and d.authority_type='ing_word_members')
        or (h.route_id='comparative_superlative_word_lab' and d.authority_type='adjective_degree_families'))
  )
  select (w.value->>'canonicalWordId')::uuid, a.micro_skill_key, 'derived_target'::text,
    w.value->>'rowStatus', w.value->>'reviewStatus',
    public.adle_ing_word_valid_v1(w.value) and w.value->>'microSkillKey'=a.micro_skill_key,
    a.authority_id::text||':'||(w.value->>'canonicalWordId'),
    a.release_manifest_id,a.release_key,a.release_manifest_sha256,
    a.authority_id,a.authority_fingerprint,null::text
  from active a cross join lateral jsonb_array_elements(a.semantic_projection->'words') w
  where a.route_id='ing_endings_word_lab'
    and (p_word_ids is null or (w.value->>'canonicalWordId')::uuid=any(p_word_ids))
  union all
  select (w.value->>'canonicalWordId')::uuid,a.micro_skill_key,
    case when w.value->>'degree'='base' then 'support_base' else 'derived_target' end,
    f.value->>'rowStatus',f.value->>'reviewStatus',
    public.adle_degree_family_valid_v1(f.value) and f.value->>'microSkillKey'=a.micro_skill_key,
    a.authority_id::text||':'||(f.value->>'familyKey')||':'||(w.value->>'canonicalWordId'),
    a.release_manifest_id,a.release_key,a.release_manifest_sha256,
    a.authority_id,a.authority_fingerprint,f.value->>'familyKey'
  from active a cross join lateral jsonb_array_elements(a.semantic_projection->'families') f
    cross join lateral jsonb_array_elements(f.value->'words') w
  where a.route_id='comparative_superlative_word_lab'
    and (p_word_ids is null or (w.value->>'canonicalWordId')::uuid=any(p_word_ids));
$$;

revoke all on function public.adle_released_inflection_memberships_v1(text,uuid[]) from public,anon,authenticated;
grant execute on function public.adle_released_inflection_memberships_v1(text,uuid[]) to service_role;
commit;
