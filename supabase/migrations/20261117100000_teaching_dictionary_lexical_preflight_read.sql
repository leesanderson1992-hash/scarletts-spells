begin;

-- Fetch the inputs to Base Word lexical-family validation in one snapshot.
-- The compiler still validates reviewed morphology and the finished lesson.
create function public.teaching_dictionary_lexical_preflight_read(
  p_candidate_words uuid[], p_micro_skill_key text, p_environment text
)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp as $$
  with touching as (
    select distinct m.family_key, m.revision
    from public.canonical_teaching_dictionary_lexical_base_family_members m
    where m.canonical_word_id = any (p_candidate_words)
  ), latest as (
    select distinct on (f.family_key)
      f.family_key, f.revision, f.base_lemma, f.base_kind, f.canonical_base_word_id,
      f.base_meaning, f.semantic_fingerprint
    from public.canonical_teaching_dictionary_lexical_base_families f
    where f.review_status = 'approved'
      and exists (select 1 from touching t where t.family_key = f.family_key)
    order by f.family_key, f.revision desc
  ), families as (
    select f.*
    from latest f
    where f.base_kind = 'free_base' and f.canonical_base_word_id is not null
      and exists (select 1 from touching t where t.family_key = f.family_key and t.revision = f.revision)
      and exists (
        select 1 from public.adle_base_word_lexical_family_authorizations a
        where a.family_key = f.family_key and a.revision = f.revision
          and a.semantic_fingerprint = f.semantic_fingerprint and a.withdrawn_at is null
      )
  ), members as (
    select m.family_key, m.canonical_word_id, m.word_part_of_speech, m.relationship_kind,
      m.canonical_morphology_id, m.word_sum, m.morphology_parts, m.morphology_joins,
      m.morphology_transformations, m.intended_meaning
    from public.canonical_teaching_dictionary_lexical_base_family_members m
    join families f on f.family_key = m.family_key and f.revision = m.revision
  ), member_words as (
    select distinct canonical_word_id from members
  ), approved_targets as (
    select distinct p.canonical_word_id
    from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id = p.release_id
    where p.canonical_word_id = any (p_candidate_words)
      and p.micro_skill_key = p_micro_skill_key
      and p.relationship_role = 'demonstrates'
      and r.environment_key = p_environment
      and not exists (select 1 from public.adle_reviewed_word_skill_withdrawals w where w.release_id = p.release_id)
  ), bands as (
    select b.canonical_word_id, b.complexity_level
    from member_words w
    join public.canonical_teaching_dictionary_word_banding b on b.canonical_word_id = w.canonical_word_id
    join public.canonical_teaching_dictionary_banding_versions v on v.banding_version = b.banding_version
    where b.row_status = 'active' and v.is_active
  ), morphology as (
    select m.id, m.canonical_word_id, m.row_status, m.review_status, m.analysis_status,
      m.word_sum, m.morphology_parts, m.morphology_joins, m.morphology_transformations
    from member_words w
    join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id = w.canonical_word_id
  )
  select jsonb_build_object(
    'families', coalesce((select jsonb_agg(f order by f.revision desc, f.family_key) from families f), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(m order by m.family_key, m.canonical_word_id, m.word_part_of_speech) from members m), '[]'::jsonb),
    'approved_targets', coalesce((select jsonb_agg(t.canonical_word_id) from approved_targets t), '[]'::jsonb),
    'bands', coalesce((select jsonb_agg(b) from bands b), '[]'::jsonb),
    'morphology', coalesce((select jsonb_agg(m) from morphology m), '[]'::jsonb)
  );
$$;

revoke all on function public.teaching_dictionary_lexical_preflight_read(uuid[], text, text)
  from public, anon, authenticated;
grant execute on function public.teaching_dictionary_lexical_preflight_read(uuid[], text, text)
  to service_role;

commit;
