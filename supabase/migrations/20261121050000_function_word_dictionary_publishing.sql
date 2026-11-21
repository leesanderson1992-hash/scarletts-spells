begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare body text; original text;
begin
 select pg_get_functiondef('public.publish_homophone_dictionary_v3(text,jsonb,uuid,uuid)'::regprocedure) into body;
 if position('D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR' in body)>0 then return; end if;
 original:=body;
 body:=replace(body,
   $old$'D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS'
    ))$old$,
   $new$'D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS',
      'D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR',
      'D4_HOM_FUNCTION_WORD_HOMOPHONES_BY_BYE_BUY',
      'D4_HOM_FUNCTION_WORD_HOMOPHONES_OUR_HOUR',
      'D4_HOM_FUNCTION_WORD_HOMOPHONES_WHO_S_WHOSE',
      'D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE',
      'D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO',
      'D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR'
    ))$new$);
 if body=original then raise exception 'FUNCTION_WORD_PUBLISHER_SCOPE_CHANGED'; end if;
 execute body;
end $$;
-- Number words such as two and four were historically labelled function_word.
-- Reconcile their approved single-sense numeral anchors under the same gates.
do $$
declare body text; original text;
begin
 select pg_get_functiondef('public.reconcile_legacy_function_word_family(text,integer,text,timestamp with time zone,uuid,text)'::regprocedure) into body;
 if position('''numeral''' in body)>0 then return; end if;
 original:=body;
 body:=replace(body,$old$'interjection','verb'$old$,$new$'interjection','verb','numeral'$new$);
 if body=original then raise exception 'FUNCTION_WORD_NUMERAL_RECONCILIATION_CHANGED'; end if;
 execute body;
end $$;
alter table public.canonical_teaching_dictionary_lexical_base_families
  drop constraint lexical_family_key_matches_reviewed_base_sense;
alter table public.canonical_teaching_dictionary_lexical_base_families
  add constraint lexical_family_key_matches_reviewed_base_sense check (
    family_key = regexp_replace(lower(base_lemma),'[^a-z0-9]+','_','g') || '_'
      || regexp_replace(lower(base_part_of_speech),'[^a-z0-9]+','_','g')
      || case when canonical_base_sense_id is null then '' else '_'
        || regexp_replace(lower(canonical_base_sense_id),'[^a-z0-9]+','_','g') end || '_base_family'
    or (family_key = regexp_replace(lower(base_lemma),'[^a-z0-9]+','_','g') || '_function_word_base_family'
      and base_kind='free_base' and canonical_base_sense_id is not null
      and base_part_of_speech in ('preposition','adverb','conjunction','pronoun','determiner','interjection','verb','number','numeral'))
  );
notify pgrst,'reload schema';
commit;
