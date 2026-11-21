begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Extend the existing canonical publisher only to the three reviewed lessons.
-- Its fact/sense, complete-set, sentence, CAS and environment checks stay intact.
do $$
declare body text; original text;
begin
 select pg_get_functiondef('public.publish_homophone_dictionary_v3(text,jsonb,uuid,uuid)'::regprocedure) into body;
 original:=body;
 body:=replace(body,
  $old$'D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY'
    ))$old$,
  $new$'D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY',
      'D4_HOM_CONTENT_WORD_HOMOPHONES_ALLOWED_ALOUD',
      'D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T',
      'D4_HOM_CONTENT_WORD_HOMOPHONES_MORNING_MOURNING'
    ))$new$);
 if body=original then raise exception 'CONTENT_HOMOPHONE_PUBLISHER_SCOPE_CHANGED'; end if;
 execute body;
end $$;
notify pgrst,'reload schema';
commit;
