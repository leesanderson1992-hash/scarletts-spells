begin;

-- An approved clip is immutable. A later approval supersedes it for new
-- playback without rewriting an older lesson's frozen content.
create table public.teaching_dictionary_british_recording_versions (
  id uuid primary key default gen_random_uuid(),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  kind text not null check (kind in ('word', 'sentence')),
  spoken_text text not null check (btrim(spoken_text) <> ''),
  recording_src text not null check (recording_src ~ '^/audio/[a-zA-Z0-9/_-]+\.(mp3|m4a|wav)$'),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source_reference text not null check (btrim(source_reference) <> ''),
  reviewed_by uuid not null,
  approved_at timestamptz not null default clock_timestamp()
);

create index teaching_dictionary_british_recording_current_idx
  on public.teaching_dictionary_british_recording_versions
  (canonical_word_id, kind, approved_at desc, id desc);

alter table public.teaching_dictionary_british_recording_versions enable row level security;
revoke all on public.teaching_dictionary_british_recording_versions from public, anon, authenticated;
grant select, insert on public.teaching_dictionary_british_recording_versions to service_role;

-- The dictionary queue includes every active word, even before a skill is
-- assigned. Existing reviewed Schwa clips count; an active Schwa publication
-- still using device speech remains in the improvement queue.
create function public.teaching_dictionary_awaiting_british_recording_ids()
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  with current_schwa as (
    select distinct on (p.canonical_word_id, p.micro_skill_key)
      p.canonical_word_id, p.micro_skill_key,
      v.content #>> '{content,weakVowel,wordRecording,src}' as word_src,
      v.content #>> '{content,weakVowel,sentenceRecording,src}' as sentence_src
    from public.adle_weak_vowel_content_publications p
    join public.teaching_dictionary_route_content_versions v on v.id = p.content_version_id
    order by p.canonical_word_id, p.micro_skill_key, p.published_at desc, p.content_version_id desc
  )
  select coalesce(array_agg(w.id order by w.normalised_word, w.id), '{}'::uuid[])
  from public.canonical_teaching_dictionary_words w
  left join lateral (
    select d.dictation_sentence from public.canonical_teaching_dictionary_dictation_sentences d
    where d.canonical_word_id = w.id and d.row_status = 'active'
      and d.review_status = 'approved_for_first_exposure'
    order by d.created_at desc, d.id desc limit 1
  ) sentence on true
  where w.row_status = 'active' and (
    (
      not exists (
        select 1 from public.teaching_dictionary_british_recording_versions r
        where r.canonical_word_id = w.id and r.kind = 'word' and r.spoken_text = w.display_word
      )
      and not exists (
        select 1 from current_schwa s where s.canonical_word_id = w.id and s.word_src like '/audio/%'
      )
    )
    or (sentence.dictation_sentence is not null
      and not exists (
        select 1 from public.teaching_dictionary_british_recording_versions r
        where r.canonical_word_id = w.id and r.kind = 'sentence'
          and r.spoken_text = sentence.dictation_sentence
      )
      and not exists (
        select 1 from current_schwa s where s.canonical_word_id = w.id and s.sentence_src like '/audio/%'
      ))
    or exists (
      select 1 from current_schwa s where s.canonical_word_id = w.id
        and (s.word_src like 'device-speech:%' or s.sentence_src like 'device-speech:%')
    )
  );
$$;

revoke all on function public.teaching_dictionary_awaiting_british_recording_ids()
  from public, anon, authenticated;
grant execute on function public.teaching_dictionary_awaiting_british_recording_ids()
  to service_role;

-- Reuse the governed word pager for the new queue. Candidate IDs come only
-- from the service-role function above; this RPC retains its existing bounds.
create or replace function public.teaching_dictionary_admin_filtered_page(
  p_filter text,
  p_search text default '',
  p_word_ids uuid[] default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if p_filter not in ('all','missing_metadata','evidence_approved','route_blocked','awaiting_british_recording')
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
        or (p_filter in ('evidence_approved','route_blocked','awaiting_british_recording')
          and w.id = any(coalesce(p_word_ids,'{}'::uuid[])))
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

commit;
