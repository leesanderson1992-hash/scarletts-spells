begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Numbers also occur in the historical function-word catalogue. Their precise
-- role must come from the approved sense, never from a guessed spelling list.
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
      and base_part_of_speech in ('preposition','adverb','conjunction','pronoun','determiner','interjection','verb','number'))
  );

do $$
declare body text; original text;
begin
 select pg_get_functiondef('public.reconcile_legacy_function_word_family(text,integer,text,timestamptz,uuid,text)'::regprocedure) into body;
 original:=body;
 body:=replace(body,
  $old$('preposition','adverb','conjunction','pronoun','determiner','interjection','verb')$old$,
  $new$('preposition','adverb','conjunction','pronoun','determiner','interjection','verb','number')$new$);
 if body=original then raise exception 'LEGACY_FAMILY_POS_GUARD_CHANGED'; end if;
 execute body;

 select pg_get_functiondef('public.review_teaching_dictionary_sense_family_membership(uuid,uuid,text,uuid,text,text,text,text,uuid,text)'::regprocedure) into body;
 original:=body;
 -- Use the same family lock order as the service reconciliation RPC.
 body:=replace(body,
  $old$  select * into v_family from public.canonical_teaching_dictionary_lexical_base_families f$old$,
  $new$  perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||p_family_key,0));
  select * into v_family from public.canonical_teaching_dictionary_lexical_base_families f$new$);
 if body=original then raise exception 'LEGACY_FAMILY_LOCK_GUARD_CHANGED'; end if;
 original:=body;
 body:=replace(body,
  $old$  if p_relationship_kind='free_base' and (v_family.base_kind<>'free_base'$old$,
  $new$  -- Reconcile only an editor's explicit approval of the exact anchor word.
  -- The service RPC requires one approved sense and approved whole-base parts,
  -- creates a successor revision, and copies every member and variant intact.
  -- Other POS/sense mismatches, bound roots and ambiguous anchors still fail.
  if p_action='approve' and p_relationship_kind='free_base'
    and v_family.base_kind='free_base'
    and v_family.canonical_base_word_id=p_word_id
    and v_family.base_part_of_speech='function_word'
    and v_family.canonical_base_sense_id is null then
    perform public.reconcile_legacy_function_word_family(
      p_family_key,v_family.revision,p_sense_id,
      (select reviewed_at from public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=p_word_id),
      p_actor,p_source_reference||'; reconcile legacy family from approved anchor facts');
    select * into v_family from public.canonical_teaching_dictionary_lexical_base_families
      where family_key=p_family_key order by revision desc limit 1;
  end if;
  if p_relationship_kind='free_base' and (v_family.base_kind<>'free_base'$new$);
 if body=original then raise exception 'LEGACY_FAMILY_ANCHOR_GUARD_CHANGED'; end if;
 execute body;
end $$;
notify pgrst,'reload schema';
commit;
