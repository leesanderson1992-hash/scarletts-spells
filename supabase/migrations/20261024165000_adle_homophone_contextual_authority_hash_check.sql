-- Permit the new route's byte-ordered canonical fingerprint while preserving
-- the hash rule for every existing authority type.
begin;
alter table public.adle_curriculum_dependency_authorities
  drop constraint adle_curriculum_dependency_authorities_semantic_hash_check;
alter table public.adle_curriculum_dependency_authorities
  add constraint adle_curriculum_dependency_authorities_semantic_hash_check
  check (case
    when authority_type='compound_structure'
      then semantic_fingerprint=public.adle_snapshot_json_sha256_v1(semantic_projection)
    when authority_type='homophone_contextual_content'
      then semantic_fingerprint=public.adle_homophone_contextual_json_sha256_v1(semantic_projection)
    else semantic_fingerprint=public.adle_canonical_json_sha256_v1(semantic_projection)
  end);
commit;
