begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Approved sense identity governs whether a family is a free base or a bound
-- root. Preserve immutable family revisions and all membership history.
create or replace view public.teaching_dictionary_families_with_current_meaning as
select f.family_key,f.revision,f.base_lemma,
 case when a.sense_id is not null then coalesce(base.value->>'partOfSpeech',f.base_part_of_speech) else f.base_part_of_speech end as base_part_of_speech,
 case when base.value->>'partOfSpeech'='root' then 'bound_root' else f.base_kind end as base_kind,f.canonical_base_word_id,
 coalesce(f.canonical_base_sense_id,a.sense_id) as canonical_base_sense_id,f.review_status,
 case when coalesce(f.canonical_base_sense_id,a.sense_id) is null then f.base_meaning else coalesce(base.value->>'definition',f.base_meaning) end as base_meaning
from public.canonical_teaching_dictionary_lexical_base_families f
left join public.teaching_dictionary_legacy_family_sense_anchors a on a.family_key=f.family_key
 and a.canonical_word_id=f.canonical_base_word_id and f.canonical_base_sense_id is null
left join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=f.canonical_base_word_id
left join lateral (
 select value from jsonb_array_elements(s.sense_set->'senses') where value->>'id'=coalesce(f.canonical_base_sense_id,a.sense_id)
) base on true;

-- Family linking uses the same effective classification as family search.
do $classification$
declare body text; original text;
begin
 select pg_get_functiondef('public.review_teaching_dictionary_sense_family_membership(uuid,uuid,text,uuid,text,text,text,text,uuid,text)'::regprocedure) into body;
 original:='select base_meaning,canonical_base_sense_id,base_part_of_speech
    into v_family.base_meaning,v_family.canonical_base_sense_id,v_family.base_part_of_speech';
 if position(original in body)=0 then raise exception 'FAMILY_CLASSIFICATION_READER_GUARD_CHANGED'; end if;
 execute replace(body,original,'select base_meaning,canonical_base_sense_id,base_part_of_speech,base_kind
    into v_family.base_meaning,v_family.canonical_base_sense_id,v_family.base_part_of_speech,v_family.base_kind');
end;
$classification$;
notify pgrst,'reload schema';
commit;
