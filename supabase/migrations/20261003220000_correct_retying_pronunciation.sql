-- Content-owner correction: retying is pronounced ree-TIE-ing /ˌriːˈtaɪɪŋ/.
do $$
declare
  v_word_id uuid;
  v_metadata_count integer;
  v_dictation_count integer;
begin
  select id into v_word_id
  from public.canonical_teaching_dictionary_words
  where word_key = 'retying_en_gb' and row_status = 'active';

  if v_word_id is null then raise exception 'retying_canonical_word_missing'; end if;

  update public.canonical_teaching_dictionary_word_metadata
  set phoneme_hint = '/ˌriːˈtaɪɪŋ/',
      stress_pattern = 'secondary-primary-unstressed',
      source_metadata = jsonb_set(
        jsonb_set(
          coalesce(source_metadata, '{}'::jsonb),
          '{row_source,phoneme_hint}',
          to_jsonb('/ˌriːˈtaɪɪŋ/'::text),
          true
        ),
        '{pronunciation_correction}',
        jsonb_build_object(
          'approvedBy', 'Katie Sanderson',
          'approvedOn', '2026-10-03',
          'phonetic', 'ree-TIE-ing',
          'ipa', '/ˌriːˈtaɪɪŋ/',
          'source', 'content_owner_correction'
        ),
        true
      ),
      source_row_hash = public.adle_canonical_json_sha256_v1(jsonb_build_object(
        'wordKey', 'retying_en_gb',
        'phonetic', 'ree-TIE-ing',
        'ipa', '/ˌriːˈtaɪɪŋ/',
        'approvedOn', '2026-10-03'
      )),
      updated_at = now()
  where canonical_word_id = v_word_id and row_status = 'active';
  get diagnostics v_metadata_count = row_count;

  update public.canonical_teaching_dictionary_dictation_sentences
  set audio_text = 'She is ree tying her loose shoelace.',
      source_metadata = jsonb_set(
        jsonb_set(
          coalesce(source_metadata, '{}'::jsonb),
          '{row_source,audio_text}',
          to_jsonb('She is ree tying her loose shoelace.'::text),
          true
        ),
        '{pronunciation_correction}',
        jsonb_build_object(
          'approvedBy', 'Katie Sanderson',
          'approvedOn', '2026-10-03',
          'phonetic', 'ree-TIE-ing',
          'ipa', '/ˌriːˈtaɪɪŋ/',
          'source', 'content_owner_correction'
        ),
        true
      ),
      source_row_hash = public.adle_canonical_json_sha256_v1(jsonb_build_object(
        'wordKey', 'retying_en_gb',
        'audioText', 'She is ree tying her loose shoelace.',
        'approvedOn', '2026-10-03'
      )),
      updated_at = now()
  where canonical_word_id = v_word_id and row_status = 'active';
  get diagnostics v_dictation_count = row_count;

  if v_metadata_count <> 1 or v_dictation_count <> 1 then
    raise exception 'retying_pronunciation_correction_cardinality';
  end if;
end $$;
