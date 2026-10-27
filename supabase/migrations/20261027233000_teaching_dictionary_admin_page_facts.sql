begin;

-- Return only facts needed to render the already-paginated manager word list.
-- Relationship approval remains owned by the governed relationship reader.
create or replace function public.teaching_dictionary_admin_page_facts(p_word_ids uuid[])
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if coalesce(array_length(p_word_ids, 1), 0) > 100 then
    raise exception 'Invalid teaching dictionary fact page';
  end if;

  select jsonb_build_object(
    'metadata', (select coalesce(jsonb_agg(jsonb_build_object(
      'canonical_word_id', m.canonical_word_id,
      'row_status', m.row_status,
      'review_status', m.review_status,
      'syllables', m.syllables,
      'written_syllable_breakdown', m.written_syllable_breakdown,
      'phoneme_hint', m.phoneme_hint,
      'stress_pattern', m.stress_pattern,
      'has_schwa', m.has_schwa,
      'morphemes', m.morphemes,
      'morphology_notes', m.morphology_notes
    ) order by m.id), '[]'::jsonb)
      from public.canonical_teaching_dictionary_word_metadata m
      where m.canonical_word_id = any(p_word_ids) and m.row_status = 'active'),
    'dictation', (select coalesce(jsonb_agg(jsonb_build_object(
      'canonical_word_id', d.canonical_word_id,
      'row_status', d.row_status,
      'review_status', d.review_status
    ) order by d.id), '[]'::jsonb)
      from public.canonical_teaching_dictionary_dictation_sentences d
      where d.canonical_word_id = any(p_word_ids) and d.row_status = 'active'
        and d.review_status = 'approved_for_first_exposure'),
    'route_members', (select coalesce(jsonb_agg(jsonb_build_object(
      'canonical_word_id', member.canonical_word_id,
      'micro_skill_key', member.micro_skill_key
    )), '[]'::jsonb) from (
      select m.canonical_word_id, p.micro_skill_key
      from public.canonical_teaching_dictionary_prefix_members m
      join public.canonical_teaching_dictionary_prefix_profiles p on p.id = m.prefix_profile_id
      where m.canonical_word_id = any(p_word_ids) and m.row_status = 'active'
        and p.row_status = 'active' and p.production_enabled
      union
      select m.canonical_word_id, p.micro_skill_key
      from public.canonical_teaching_dictionary_suffix_members m
      join public.canonical_teaching_dictionary_suffix_profiles p on p.id = m.suffix_profile_id
      where m.canonical_word_id = any(p_word_ids) and m.row_status = 'active'
        and p.row_status = 'active' and p.production_enabled
      union
      select m.canonical_word_id, 'base_word_lab'::text
      from public.canonical_teaching_dictionary_base_word_family_members m
      where m.canonical_word_id = any(p_word_ids) and m.row_status = 'active'
    ) member),
    'route_content', (select coalesce(jsonb_agg(jsonb_build_object(
      'canonical_word_id', c.canonical_word_id,
      'micro_skill_key', c.micro_skill_key
    )), '[]'::jsonb)
      from public.teaching_dictionary_route_content_versions c
      where c.canonical_word_id = any(p_word_ids))
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.teaching_dictionary_admin_page_facts(uuid[])
  from public, anon, authenticated;
grant execute on function public.teaching_dictionary_admin_page_facts(uuid[])
  to service_role;

commit;
