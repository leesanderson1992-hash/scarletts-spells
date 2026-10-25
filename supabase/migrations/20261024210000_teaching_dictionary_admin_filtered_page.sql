begin;

-- Keep the manager's word paging in Postgres. Approved relationship identities
-- are supplied by the existing governed relationship interpreter; this RPC
-- does not attempt to reinterpret its approval or release decisions.
create function public.teaching_dictionary_admin_filtered_page(
  p_filter text,
  p_search text default '',
  p_word_ids uuid[] default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if p_filter not in ('all','missing_metadata','evidence_approved','route_blocked')
    or p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'Invalid teaching dictionary page request';
  end if;
  with filtered as materialized (
    select w.id,w.normalised_word,w.display_word,w.age_band,w.frequency_band,w.row_status
    from public.canonical_teaching_dictionary_words w
    where w.row_status = 'active'
      and (coalesce(p_search,'') = '' or position(lower(p_search) in lower(w.normalised_word)) > 0)
      and (
        p_filter = 'all'
        or (p_filter in ('evidence_approved','route_blocked') and w.id = any(coalesce(p_word_ids,'{}'::uuid[])))
        or (p_filter = 'missing_metadata' and (
          nullif(btrim(w.age_band),'') is null or nullif(btrim(w.frequency_band),'') is null
          or not exists (
            select 1 from public.canonical_teaching_dictionary_word_metadata m
            where m.canonical_word_id = w.id and m.row_status = 'active'
              and m.review_status = 'approved_for_first_exposure'
              and nullif(btrim(m.syllables),'') is not null
              and nullif(btrim(m.phoneme_hint),'') is not null
              and nullif(btrim(m.stress_pattern),'') is not null
              and m.has_schwa is not null and nullif(btrim(m.morphemes),'') is not null
              and m.morphology_notes is not null
          )
          or not exists (
            select 1 from public.canonical_teaching_dictionary_dictation_sentences d
            where d.canonical_word_id = w.id and d.row_status = 'active'
              and d.review_status = 'approved_for_first_exposure'
          )
        ))
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'words', (select coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb)
      from (select * from filtered order by normalised_word,id limit p_limit offset p_offset) page)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.teaching_dictionary_admin_filtered_page(text,text,uuid[],integer,integer)
  from public, anon, authenticated;
grant execute on function public.teaching_dictionary_admin_filtered_page(text,text,uuid[],integer,integer)
  to service_role;

create index if not exists canonical_teaching_dictionary_word_metadata_active_approved_word_idx
  on public.canonical_teaching_dictionary_word_metadata(canonical_word_id)
  where row_status = 'active' and review_status = 'approved_for_first_exposure';
create index if not exists canonical_teaching_dictionary_dictation_active_approved_word_idx
  on public.canonical_teaching_dictionary_dictation_sentences(canonical_word_id)
  where row_status = 'active' and review_status = 'approved_for_first_exposure';

commit;
