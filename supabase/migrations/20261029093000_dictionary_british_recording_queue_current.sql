begin;

-- A retired skill or stale dictionary binding cannot satisfy the current
-- British-recording improvement queue.
create or replace function public.teaching_dictionary_awaiting_british_recording_ids()
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  with current_schwa as (
    select distinct on (p.canonical_word_id, p.micro_skill_key)
      p.canonical_word_id, p.micro_skill_key,
      v.content #>> '{content,weakVowel,wordRecording,src}' as word_src,
      v.content #>> '{content,weakVowel,sentenceRecording,src}' as sentence_src
    from public.adle_weak_vowel_content_publications p
    join public.teaching_dictionary_route_content_versions v on v.id = p.content_version_id
    join public.micro_skill_catalog skill on skill.micro_skill_key = p.micro_skill_key
      and skill.is_active = true and skill.is_assignable = true
    where p.dictionary_fingerprint = public.teaching_dictionary_route_dictionary_fingerprint(p.canonical_word_id)
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

commit;
