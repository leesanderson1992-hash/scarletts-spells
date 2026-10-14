begin;

create or replace function public.preserve_teaching_dictionary_written_syllables()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  previous public.canonical_teaching_dictionary_word_metadata%rowtype;
begin
  if new.written_syllable_breakdown is null then
    new.written_syllable_breakdown := nullif(new.source_metadata->>'humanApprovedWrittenSyllableBreakdown', '');
  end if;
  if new.written_syllable_breakdown is null and new.canonical_word_id is not null then
    select * into previous
      from public.canonical_teaching_dictionary_word_metadata
      where canonical_word_id = new.canonical_word_id
        and written_syllable_breakdown is not null
      order by created_at desc, id desc limit 1;
    if previous.id is not null then
      new.written_syllable_breakdown := previous.written_syllable_breakdown;
      new.source_metadata := jsonb_strip_nulls(jsonb_build_object(
        'humanReviewDate', previous.source_metadata->>'humanReviewDate',
        'humanReviewManifestSha256', previous.source_metadata->>'humanReviewManifestSha256'
      )) || new.source_metadata || jsonb_build_object(
        'humanApprovedWrittenSyllableBreakdown', previous.written_syllable_breakdown);
    end if;
  end if;
  if new.written_syllable_breakdown is not null then
    if btrim(new.written_syllable_breakdown) = '' or
       lower(regexp_replace(new.written_syllable_breakdown, '[^[:alnum:]]', '', 'g')) <>
       (select lower(regexp_replace(display_word, '[^[:alnum:]]', '', 'g'))
        from public.canonical_teaching_dictionary_words where id = new.canonical_word_id) then
      raise exception 'WRITTEN_SYLLABLE_BREAKDOWN_WORD_MISMATCH';
    end if;
  end if;
  return new;
end $$;

commit;
