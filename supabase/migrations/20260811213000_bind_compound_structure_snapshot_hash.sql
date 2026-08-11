-- CW-3B-1: bind only the new compound_structure authority type to the shared
-- TypeScript snapshot hash. Every established Model C authority type retains
-- its existing canonical hash and all historical rows remain valid.

begin;

alter table public.adle_curriculum_dependency_authorities
  drop constraint adle_curriculum_dependency_authorities_semantic_hash_check,
  add constraint adle_curriculum_dependency_authorities_semantic_hash_check check (
    case
      when authority_type = 'compound_structure'
        then semantic_fingerprint = public.adle_snapshot_json_sha256_v1(semantic_projection)
      else semantic_fingerprint = public.adle_canonical_json_sha256_v1(semantic_projection)
    end
  );

comment on constraint adle_curriculum_dependency_authorities_semantic_hash_check
  on public.adle_curriculum_dependency_authorities is
  'Compound structures use the shared C-collated snapshot fingerprint; established authority types retain the historical Model C canonical fingerprint.';

commit;
