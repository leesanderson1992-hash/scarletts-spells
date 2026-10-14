begin;

alter table public.canonical_teaching_dictionary_word_metadata
  add column written_syllable_breakdown text;

update public.canonical_teaching_dictionary_word_metadata
set written_syllable_breakdown = nullif(source_metadata->>'humanApprovedWrittenSyllableBreakdown', '')
where row_status = 'active'
  and nullif(source_metadata->>'humanApprovedWrittenSyllableBreakdown', '') is not null;

-- Manager publication and canonical imports replace immutable metadata versions.
-- Carry the human review forward even when an older writer omits this field.
create function public.preserve_teaching_dictionary_written_syllables()
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
      new.source_metadata := new.source_metadata || jsonb_build_object(
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

create trigger preserve_teaching_dictionary_written_syllables_before_insert
  before insert on public.canonical_teaching_dictionary_word_metadata
  for each row execute function public.preserve_teaching_dictionary_written_syllables();

comment on column public.canonical_teaching_dictionary_word_metadata.written_syllable_breakdown
  is 'Human-reviewed written division; separate from numeric spoken syllable count and phoneme hint.';

commit;
