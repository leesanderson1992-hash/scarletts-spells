-- D3 prerequisite: optional, governed generic Lesson Reflection content.
--
-- Existing teaching-content rows remain valid and retain their stored
-- source_row_hash values. New content versions may author both fields; the
-- guarded importer owns compatible source-shape hashing and field review.

alter table public.canonical_teaching_dictionary_content_versions
  add column if not exists reflection_prompt_key text,
  add column if not exists reflection_prompt_text text;

alter table public.canonical_teaching_dictionary_content_versions
  drop constraint if exists canonical_teaching_dictionary_content_versions_reflection_prompt_pair_check;

alter table public.canonical_teaching_dictionary_content_versions
  add constraint canonical_teaching_dictionary_content_versions_reflection_prompt_pair_check
  check (
    (reflection_prompt_key is null and reflection_prompt_text is null)
    or (
      btrim(coalesce(reflection_prompt_key, '')) <> ''
      and btrim(coalesce(reflection_prompt_text, '')) <> ''
    )
  );

comment on column public.canonical_teaching_dictionary_content_versions.reflection_prompt_key is
  'Optional governed child-facing Lesson Reflection prompt key. Must be populated with reflection_prompt_text and reviewed before generic Snapshot v3 eligibility.';

comment on column public.canonical_teaching_dictionary_content_versions.reflection_prompt_text is
  'Optional governed child-facing Lesson Reflection prompt. Historical rows may remain null and are then generic Snapshot v3-ineligible.';
