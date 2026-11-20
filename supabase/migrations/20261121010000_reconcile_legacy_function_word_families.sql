begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Historical function-word family keys are stable identifiers. A reviewed
-- successor can name a precise sense/POS without renaming the family or members.
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
      and base_part_of_speech in ('preposition','adverb','conjunction','pronoun','determiner','interjection','verb'))
  );

-- A precise anchor must match the selected sense, even when two senses share POS.
do $$
declare body text; original text;
begin
  select pg_get_functiondef('public.review_teaching_dictionary_sense_family_membership(uuid,uuid,text,uuid,text,text,text,text,uuid,text)'::regprocedure) into body;
  original:=body;
  body:=replace(body,
    $old$or v_family.base_part_of_speech is distinct from v_sense->>'partOfSpeech')$old$,
    $new$or v_family.base_part_of_speech is distinct from v_sense->>'partOfSpeech'
    or (p_action='approve' and v_family.canonical_base_sense_id is not null and v_family.canonical_base_sense_id is distinct from p_sense_id))$new$);
  if body=original then raise exception 'SENSE_FAMILY_ANCHOR_GUARD_CHANGED'; end if;
  execute body;
end $$;

create function public.reconcile_legacy_function_word_family(
  p_family_key text,p_expected_revision integer,p_sense_id text,
  p_expected_reviewed_at timestamptz,p_actor uuid,p_source_reference text
) returns integer language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  s public.teaching_dictionary_reviewed_sense_sets%rowtype;
  m public.teaching_dictionary_current_sense_morphology%rowtype;
  sense jsonb; part jsonb; next_revision integer;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor)
    or nullif(btrim(p_source_reference),'') is null or nullif(btrim(p_sense_id),'') is null
    or p_expected_revision is null or p_expected_reviewed_at is null then
    raise exception 'LEGACY_FAMILY_RECONCILIATION_INPUT_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||p_family_key,0));
  select * into f from canonical_teaching_dictionary_lexical_base_families
    where family_key=p_family_key order by revision desc limit 1 for update;
  if f.family_key is null or f.review_status<>'approved' or f.base_kind<>'free_base' then
    raise exception 'LEGACY_FAMILY_APPROVED_FREE_BASE_REQUIRED'; end if;
  select * into s from teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=f.canonical_base_word_id for share;
  if s.canonical_word_id is null or s.reviewed_at is distinct from p_expected_reviewed_at
    or jsonb_array_length(s.sense_set->'senses')<>1 then
    raise exception 'LEGACY_FAMILY_REVIEWED_SINGLE_SENSE_REQUIRED'; end if;
  sense:=s.sense_set->'senses'->0;
  if sense->>'id' is distinct from p_sense_id or nullif(btrim(sense->>'definition'),'') is null
    or sense->>'partOfSpeech' not in ('preposition','adverb','conjunction','pronoun','determiner','interjection','verb') then
    raise exception 'LEGACY_FAMILY_REVIEWED_SINGLE_SENSE_REQUIRED'; end if;
  if f.canonical_base_sense_id=p_sense_id and f.base_part_of_speech=sense->>'partOfSpeech'
    and f.base_meaning=sense->>'definition' then return f.revision; end if;
  if f.revision<>p_expected_revision or f.base_part_of_speech<>'function_word'
    or f.canonical_base_sense_id is not null
    or f.family_key<>regexp_replace(lower(f.base_lemma),'[^a-z0-9]+','_','g')||'_function_word_base_family' then
    raise exception 'LEGACY_FAMILY_REVISION_CHANGED'; end if;
  select * into w from canonical_teaching_dictionary_words where id=f.canonical_base_word_id
    and normalised_word=f.base_lemma and row_status='active' and review_status='approved_for_first_exposure';
  select * into m from teaching_dictionary_current_sense_morphology
    where canonical_word_id=f.canonical_base_word_id and sense_id=p_sense_id;
  part:=m.morphology_parts->0;
  if w.id is null or m.id is null or jsonb_array_length(m.morphology_parts)<>1
    or jsonb_array_length(m.morphology_joins)<>0 or jsonb_array_length(m.morphology_transformations)<>0
    or part->>'kind' is distinct from 'base' or part->>'sourceText' is distinct from w.normalised_word
    or part->>'surfaceText' is distinct from w.display_word then
    raise exception 'LEGACY_FAMILY_REVIEWED_WHOLE_BASE_REQUIRED'; end if;
  if exists(select 1 from canonical_teaching_dictionary_lexical_base_families other
    where other.family_key<>f.family_key and other.canonical_base_word_id=w.id
      and other.canonical_base_sense_id=p_sense_id and other.review_status='approved'
      and not exists(select 1 from canonical_teaching_dictionary_lexical_base_families newer
        where newer.family_key=other.family_key and newer.revision>other.revision)) then
    raise exception 'LEGACY_FAMILY_SENSE_ALREADY_ANCHORED'; end if;
  next_revision:=f.revision+1;
  insert into canonical_teaching_dictionary_lexical_base_families
    (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,
      canonical_base_sense_id,base_meaning,source_reference,review_status)
  values(f.family_key,next_revision,f.base_lemma,sense->>'partOfSpeech',f.base_kind,
    f.canonical_base_word_id,p_sense_id,sense->>'definition',p_source_reference,'draft');
  insert into canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,
      word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference)
  select family_key,next_revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,
    word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference
  from canonical_teaching_dictionary_lexical_base_family_members where family_key=f.family_key and revision=f.revision;
  insert into canonical_teaching_dictionary_lexical_base_variants
    (family_key,revision,canonical_word_id,source_base_text,relation_kind,source_reference,approval_reference,reviewed_by,reviewed_at)
  select family_key,next_revision,canonical_word_id,source_base_text,relation_kind,source_reference,approval_reference,reviewed_by,reviewed_at
  from canonical_teaching_dictionary_lexical_base_variants where family_key=f.family_key and revision=f.revision;
  perform approve_canonical_lexical_base_family(f.family_key,next_revision,p_actor::text,p_source_reference);
  return next_revision;
end $$;
revoke all on function public.reconcile_legacy_function_word_family(text,integer,text,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.reconcile_legacy_function_word_family(text,integer,text,timestamptz,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
