begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Scope the existing publisher to the contraction/real-word contrast lesson.
-- Preserve its approved facts, sense, complete pair, CAS and environment gates.
do $$
declare body text; original text;
begin
 select pg_get_functiondef('public.publish_homophone_dictionary_v3(text,jsonb,uuid,uuid)'::regprocedure) into body;
 original:=body;
 if position('D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS' in body)=0 then
  body:=replace(body,
   $old$'D4_HOM_CONTENT_WORD_HOMOPHONES_MORNING_MOURNING'$old$,
   $new$'D4_HOM_CONTENT_WORD_HOMOPHONES_MORNING_MOURNING',
      'D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS'$new$);
  if body=original then raise exception 'CONTRACTION_PUBLISHER_SCOPE_CHANGED'; end if;
 end if;
 -- This roster has nine reviewed pairs; keep the existing limits for other lessons.
 body:=replace(body, $old$jsonb_array_length(p_content->'dictionaryFacts') not between 2 and 10$old$,
   $new$jsonb_array_length(p_content->'dictionaryFacts') not between 2 and
      (case when skill='D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS' then 18 else 10 end)$new$);
 body:=replace(body, $old$jsonb_array_length(p_content->'sets') not between 1 and 5$old$,
   $new$jsonb_array_length(p_content->'sets') not between 1 and
      (case when skill='D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS' then 9 else 5 end)$new$);
 if position('then 18 else 10 end' in body)=0 or position('then 9 else 5 end' in body)=0 then
   raise exception 'CONTRACTION_PUBLISHER_LIMITS_CHANGED';
 end if;
 execute body;
end $$;
notify pgrst,'reload schema';
commit;
