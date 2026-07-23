-- Optional, reviewed child-facing explanation for a Dynamic Prefix profile.
-- The immutable assignment snapshot retains the rendered screens, so this
-- field affects only subsequently compiled lessons.
alter table public.canonical_teaching_dictionary_prefix_profiles
  add column if not exists intro_content jsonb;

alter table public.canonical_teaching_dictionary_prefix_profiles
  add constraint ctd_prefix_profiles_intro_content
  check (
    intro_content is null
    or (
      jsonb_typeof(intro_content) = 'object'
      and jsonb_typeof(intro_content->'title') = 'string'
      and btrim(intro_content->>'title') <> ''
      and jsonb_typeof(intro_content->'paragraphs') = 'array'
      and jsonb_array_length(intro_content->'paragraphs') > 0
    )
  ) not valid;
