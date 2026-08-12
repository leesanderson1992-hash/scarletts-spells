-- Govern the product-owner authored three-page Compound reading correction.
-- This migration adds no authority, release, activation, assignment, or learner row.

begin;

create or replace function public.publish_adle_reviewed_teaching_content_authority_v1(
  p_manifest jsonb,
  p_manifest_file_sha256 text,
  p_approval jsonb,
  p_approval_file_sha256 text,
  p_published_by text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_pages jsonb;
  v_projection jsonb;
  v_manifest_sha text;
  v_fingerprint text;
begin
  if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$'
     or p_approval_file_sha256 !~ '^[a-f0-9]{64}$'
     or nullif(btrim(p_published_by), '') is null
     or jsonb_typeof(p_manifest) <> 'object'
     or (select count(*) from jsonb_object_keys(p_manifest)) <> 5
     or p_manifest->>'schemaVersion' <> '1'
     or jsonb_typeof(p_manifest->'content') <> 'object'
     or jsonb_typeof(p_manifest#>'{content,readingPages}') <> 'array'
     or jsonb_array_length(p_manifest#>'{content,readingPages}') <> 3
     or jsonb_typeof(p_manifest#>'{content,instructionalPurpose}') <> 'array'
     or jsonb_array_length(p_manifest#>'{content,instructionalPurpose}') <> 3
     or nullif(p_manifest#>>'{content,contentVersionId}', '') is null
     or nullif(p_manifest#>>'{content,contentVersion}', '') is null
     or nullif(p_manifest#>>'{content,teachingObjective}', '') is null
     or nullif(p_manifest#>>'{content,childFriendlyExplanation}', '') is null
     or nullif(p_manifest#>>'{content,ruleExplanation}', '') is null
     or jsonb_typeof(p_approval) <> 'object'
     or p_approval->>'schema_version' <> '1'
     or p_approval->>'approval_status' <> 'approved'
     or nullif(p_approval->>'reviewer', '') is null
     or (p_approval->>'approval_date') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
     or (p_approval->>'source_commit') !~ '^[a-f0-9]{40}$'
     or (p_approval->>'source_file_sha256') !~ '^[a-f0-9]{64}$'
     or (p_approval->>'content_hash') !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_approval->'pages') <> 'array'
     or jsonb_array_length(p_approval->'pages') <> 3
     or p_manifest->>'microSkillKey' <> p_approval->>'micro_skill_key'
     or not (p_manifest->'approvalRefs' @> jsonb_build_array('sha256:' || p_approval_file_sha256)) then
    raise exception 'invalid reviewed teaching-content authority package';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_approval->'pages') page
    where page->>'micro_skill_key' <> p_manifest->>'microSkillKey'
       or (page->>'page_ordinal')::integer not between 1 and 3
       or page->>'approval_status' <> 'approved'
       or page->>'reviewer' <> p_approval->>'reviewer'
       or page->>'approval_date' <> p_approval->>'approval_date'
       or page->>'source_file' <> p_approval->>'source_file'
       or page->>'source_commit' <> p_approval->>'source_commit'
       or page->>'content_hash' <> public.adle_canonical_json_sha256_v1(page->'page_content')
       or page->>'page_title' <> page#>>'{page_content,title}'
       or nullif(page->>'teaching_purpose', '') is null
  ) or (
    select count(distinct (page->>'page_ordinal')::integer)
    from jsonb_array_elements(p_approval->'pages') page
  ) <> 3 then
    raise exception 'reviewed teaching pages are incomplete or inconsistent';
  end if;

  select jsonb_agg(page->'page_content' order by (page->>'page_ordinal')::integer)
    into v_pages
    from jsonb_array_elements(p_approval->'pages') page;
  if v_pages <> p_manifest#>'{content,readingPages}'
     or public.adle_canonical_json_sha256_v1(v_pages) <> p_approval->>'content_hash'
     or p_manifest#>'{content,instructionalPurpose}' <> (
       select jsonb_agg(to_jsonb(page->>'teaching_purpose') order by (page->>'page_ordinal')::integer)
       from jsonb_array_elements(p_approval->'pages') page
     ) then
    raise exception 'teaching-content manifest differs from the exact approved pages';
  end if;

  v_projection := jsonb_build_object(
    'schemaVersion', 1,
    'microSkillKey', p_manifest->>'microSkillKey'
  ) || (p_manifest->'content');
  v_manifest_sha := public.adle_canonical_json_sha256_v1(p_manifest);
  v_fingerprint := public.adle_canonical_json_sha256_v1(v_projection);

  insert into public.adle_curriculum_dependency_authorities(
    authority_key, authority_type, schema_version, source_classification,
    manifest_file_sha256, authority_manifest, authority_manifest_sha256,
    semantic_projection, semantic_fingerprint, source_provenance,
    approval_refs, published_by
  ) values (
    p_manifest->>'authorityKey', 'teaching_content', 1, 'mixed_governed_sources',
    p_manifest_file_sha256, p_manifest, v_manifest_sha, v_projection, v_fingerprint,
    jsonb_build_object(
      'sourceFile', p_approval->>'source_file',
      'sourceCommit', p_approval->>'source_commit',
      'sourceFileSha256', p_approval->>'source_file_sha256',
      'contentHash', p_approval->>'content_hash',
      'reviewer', p_approval->>'reviewer',
      'approvalDate', p_approval->>'approval_date',
      'approvalFileSha256', p_approval_file_sha256
    ),
    p_manifest->'approvalRefs', p_published_by
  ) on conflict(authority_type, authority_key) do nothing returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.adle_curriculum_dependency_authorities
    where authority_type = 'teaching_content'
      and authority_key = p_manifest->>'authorityKey'
      and schema_version = 1
      and authority_manifest = p_manifest
      and manifest_file_sha256 = p_manifest_file_sha256
      and semantic_fingerprint = v_fingerprint
      and source_provenance->>'approvalFileSha256' = p_approval_file_sha256;
    if v_id is null then
      raise exception 'reviewed teaching-content key names different immutable semantics';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.publish_adle_reviewed_teaching_content_authority_v1(jsonb,text,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.publish_adle_reviewed_teaching_content_authority_v1(jsonb,text,jsonb,text,text)
  to service_role;

do $current_release_guard$
declare
  v_signature constant text :=
    'public.adle_compound_word_release_is_intake_ready_v2(uuid,text,text,text,uuid,text)';
  v_definition text;
  v_anchor constant text := E'      and release.payload_version = 2\n';
  v_replacement constant text := E'      and release.payload_version = 2\n' ||
    E'      and not exists (\n' ||
    E'        select 1\n' ||
    E'        from public.adle_curriculum_release_manifests newer_release\n' ||
    E'        where newer_release.route_id = release.route_id\n' ||
    E'          and newer_release.route_version = release.route_version\n' ||
    E'          and newer_release.manifest_payload#>>''{microSkills,0,microSkillKey}'' = p_micro_skill_key\n' ||
    E'          and (newer_release.published_at, newer_release.id) > (release.published_at, release.id)\n' ||
    E'      )\n';
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null
     or v_definition not like '%canonical_teaching_dictionary_compound_structures_v2%'
     or v_definition like '%newer_release.published_at%' then
    raise exception 'Compound Word intake-ready predecessor differs from reviewed state';
  end if;
  if position(v_anchor in v_definition) = 0 then
    raise exception 'Compound Word intake-ready payload-version anchor is unavailable';
  end if;
  v_definition := replace(v_definition, v_anchor, v_replacement);
  execute v_definition;
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition not like '%newer_release.published_at%' then
    raise exception 'current immutable Compound release guard was not installed';
  end if;
end;
$current_release_guard$;

comment on function public.publish_adle_reviewed_teaching_content_authority_v1(jsonb,text,jsonb,text,text) is
  'Publishes one immutable teaching-content dependency authority bound to exact product-owner reviewed repository content. It cannot activate a route.';

commit;
