begin;

-- Read the content and its current editorial records from one snapshot.
create function public.teaching_dictionary_readiness_editorial_snapshot(
  p_route_id text, p_micro_skill_key text
)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp as $$
  with content as (
    select c.id, c.draft_id, c.canonical_word_id, c.route_id, c.route_version,
      c.micro_skill_key, c.published_at, c.content
    from public.teaching_dictionary_route_content_versions c
    where c.route_id = p_route_id and c.micro_skill_key = p_micro_skill_key
  ), drafts as (
    select distinct draft_id from content
  ), reviews as (
    select r.content_version_id, r.dictionary_fingerprint, r.reviewed_by
    from public.teaching_dictionary_route_content_reviews r
    join content c on c.id = r.content_version_id
  ), publications as (
    select p.content_version_id, p.route_profile_id
    from public.teaching_dictionary_route_content_publications p
    join content c on c.id = p.content_version_id
  ), rollbacks as (
    select r.content_version_id
    from public.teaching_dictionary_route_content_rollbacks r
    join content c on c.id = r.content_version_id
  ), overview_reviews as (
    select r.draft_id, r.content_fingerprint, r.base_dictionary_fingerprint
    from public.teaching_dictionary_overview_reviews r
    join drafts d using (draft_id)
  ), manager_publications as (
    select p.draft_id, p.published_at
    from public.teaching_dictionary_manager_publications p
    join drafts d using (draft_id)
  )
  select jsonb_build_object(
    'content', coalesce((select jsonb_agg(c order by c.id) from content c), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(r) from reviews r), '[]'::jsonb),
    'publications', coalesce((select jsonb_agg(p order by p.content_version_id) from publications p), '[]'::jsonb),
    'rollbacks', coalesce((select jsonb_agg(r) from rollbacks r), '[]'::jsonb),
    'overview_reviews', coalesce((select jsonb_agg(r) from overview_reviews r), '[]'::jsonb),
    'manager_publications', coalesce((select jsonb_agg(p) from manager_publications p), '[]'::jsonb)
  );
$$;

create function public.teaching_dictionary_readiness_word_facts(p_words uuid[])
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp as $$
  with requested as (select distinct id from unnest(p_words) as input(id)),
  words as (
    select w.id, w.display_word, w.row_status, w.review_status, w.dialect_code
    from public.canonical_teaching_dictionary_words w join requested r using (id)
  ), metadata as (
    select m.canonical_word_id, m.syllables, m.phoneme_hint, m.stress_pattern, m.has_schwa,
      m.morphemes, m.morphology_notes, m.row_status, m.review_status
    from public.canonical_teaching_dictionary_word_metadata m
    join requested r on r.id = m.canonical_word_id where m.row_status = 'active'
  ), dictation as (
    select d.canonical_word_id, d.dictation_sentence, d.audio_text, d.dictation_target_token_index,
      d.row_status, d.review_status
    from public.canonical_teaching_dictionary_dictation_sentences d
    join requested r on r.id = d.canonical_word_id where d.row_status = 'active'
  )
  select jsonb_build_object(
    'words', coalesce((select jsonb_agg(w) from words w), '[]'::jsonb),
    'metadata', coalesce((select jsonb_agg(m) from metadata m), '[]'::jsonb),
    'dictation', coalesce((select jsonb_agg(d) from dictation d), '[]'::jsonb)
  );
$$;

revoke all on function public.teaching_dictionary_readiness_editorial_snapshot(text, text),
  public.teaching_dictionary_readiness_word_facts(uuid[]) from public, anon, authenticated;
grant execute on function public.teaching_dictionary_readiness_editorial_snapshot(text, text),
  public.teaching_dictionary_readiness_word_facts(uuid[]) to service_role;

commit;
