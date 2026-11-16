begin;

-- Hydrate only the requested candidate page. Keep the original per-sense
-- evaluator in the application and return the same inputs in one round trip.
create function public.teaching_dictionary_bulk_candidate_page_facts(
  p_word_ids uuid[], p_candidate_rule boolean
) returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp as $$
begin
  if coalesce(cardinality(p_word_ids), 0) not between 1 and 50 then
    raise exception 'Invalid teaching dictionary candidate page';
  end if;
  return jsonb_build_object(
    'metadata', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from (
      select distinct on (canonical_word_id) canonical_word_id, has_schwa, syllables,
        written_syllable_breakdown, phoneme_hint
      from public.canonical_teaching_dictionary_word_metadata
      where canonical_word_id = any(p_word_ids) and row_status = 'active'
      order by canonical_word_id, created_at desc, id
    ) m),
    'morphology', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from (
      select distinct on (canonical_word_id) id, canonical_word_id, morphology_parts,
        morphology_joins, analysis_status, review_status, word_sum
      from public.canonical_teaching_dictionary_word_morphology
      where canonical_word_id = any(p_word_ids) and row_status = 'active'
      order by canonical_word_id, created_at desc, id
    ) m),
    'senses', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (
      select canonical_word_id, sense_set from public.teaching_dictionary_reviewed_sense_sets
      where canonical_word_id = any(p_word_ids)
    ) s),
    'links', case when p_candidate_rule then (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb) from (
      select id, canonical_word_id, sense_id, family_key, component_part_id, relationship_kind
      from public.teaching_dictionary_current_sense_family_links where canonical_word_id = any(p_word_ids)
    ) l) else '[]'::jsonb end,
    'analyses', case when p_candidate_rule then (select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb) from (
      select id, canonical_word_id, sense_id, morphology_parts, morphology_joins, word_sum
      from public.teaching_dictionary_current_sense_morphology where canonical_word_id = any(p_word_ids)
    ) a) else '[]'::jsonb end,
    'memberships', case when p_candidate_rule then (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb) from (
      select id, canonical_word_id, sense_id, sense_morphology_id, family_key,
        component_part_id, relationship_kind, base_meaning
      from public.teaching_dictionary_current_sense_family_memberships where canonical_word_id = any(p_word_ids)
    ) l) else '[]'::jsonb end
  );
end;
$$;

-- The specialist index only needs filter inputs. Definitions, sentences, and
-- the rest of each reviewed sense are loaded with the visible page.
create function public.teaching_dictionary_bulk_filter_inputs(p_after uuid default null)
returns jsonb language sql stable security invoker
set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(input) order by input.id), '[]'::jsonb)
  from (
    select w.id, w.normalised_word, w.display_word, w.review_status,
      m.has_schwa, m.syllables, m.phoneme_hint, a.morphology_parts,
      (select coalesce(jsonb_agg(jsonb_build_object('id', item->'id', 'pronunciationId', item->'pronunciationId') order by n), '[]'::jsonb)
        from jsonb_array_elements(s.sense_set->'senses') with ordinality as senses(item, n)) as senses,
      (select coalesce(jsonb_agg(jsonb_build_object('id', item->'id', 'ipa', item->'ipa',
          'spokenSyllableCount', item->'spokenSyllableCount') order by n), '[]'::jsonb)
        from jsonb_array_elements(s.sense_set->'pronunciations') with ordinality as pronunciations(item, n)) as pronunciations
    from (
      select id, normalised_word, display_word, review_status
      from public.canonical_teaching_dictionary_words
      where row_status = 'active' and (p_after is null or id > p_after)
      order by id limit 1000
    ) w
    left join lateral (
      select has_schwa, syllables, phoneme_hint
      from public.canonical_teaching_dictionary_word_metadata
      where canonical_word_id = w.id and row_status = 'active'
      order by created_at desc, id limit 1
    ) m on true
    left join lateral (
      select morphology_parts from public.canonical_teaching_dictionary_word_morphology
      where canonical_word_id = w.id and row_status = 'active'
      order by created_at desc, id limit 1
    ) a on true
    left join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id = w.id
  ) input;
$$;

revoke all on function public.teaching_dictionary_bulk_candidate_page_facts(uuid[], boolean),
  public.teaching_dictionary_bulk_filter_inputs(uuid) from public, anon, authenticated;
grant execute on function public.teaching_dictionary_bulk_candidate_page_facts(uuid[], boolean),
  public.teaching_dictionary_bulk_filter_inputs(uuid) to service_role;

commit;
