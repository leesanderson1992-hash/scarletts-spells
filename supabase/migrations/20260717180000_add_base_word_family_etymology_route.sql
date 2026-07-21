-- Structured, review-gated linguistic route for ADLE base-word families.
-- This migration does not activate curriculum or alter assignment behaviour.

alter table public.canonical_teaching_dictionary_base_word_families
  add column if not exists etymology_route jsonb;

alter table public.canonical_teaching_dictionary_base_word_families
  drop constraint if exists canonical_teaching_dictionary_base_word_families_etymology_route_check;

alter table public.canonical_teaching_dictionary_base_word_families
  add constraint canonical_teaching_dictionary_base_word_families_etymology_route_check check (
    etymology_route is null or (
      jsonb_typeof(etymology_route) = 'object'
      and etymology_route ?& array[
        'relation_type', 'origin_language', 'origin_form', 'literal_meaning',
        'child_facing_meaning', 'semantic_connection', 'evidence'
      ]
      and etymology_route->>'relation_type' = any (
        array['free_base', 'classical_root', 'etymological_root']
      )
      and btrim(coalesce(etymology_route->>'origin_language', '')) <> ''
      and btrim(coalesce(etymology_route->>'origin_form', '')) <> ''
      and btrim(coalesce(etymology_route->>'literal_meaning', '')) <> ''
      and btrim(coalesce(etymology_route->>'child_facing_meaning', '')) <> ''
      and btrim(coalesce(etymology_route->>'semantic_connection', '')) <> ''
      and jsonb_typeof(etymology_route->'evidence') = 'object'
      and etymology_route->'evidence' ?& array['source_name', 'source_url', 'verification_status']
      and btrim(coalesce(etymology_route->'evidence'->>'source_name', '')) <> ''
      and btrim(coalesce(etymology_route->'evidence'->>'source_url', '')) <> ''
      and etymology_route->'evidence'->>'verification_status' = 'linked_for_human_review'
    )
  );
