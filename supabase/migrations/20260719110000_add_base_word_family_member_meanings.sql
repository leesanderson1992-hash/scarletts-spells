-- Reviewed child-facing meanings are required for interactive base-word
-- construction. This adds curriculum metadata only; it creates no runtime
-- activation, assignment, scheduling, reward, or resolver behaviour.

alter table public.canonical_teaching_dictionary_base_word_family_members
  add column if not exists child_friendly_meaning text;

-- The read model, rather than this broad table constraint, fails closed when a
-- member lacks a reviewed child-facing meaning. This keeps historic and
-- research-only records importable while making the pilot safe by default.
