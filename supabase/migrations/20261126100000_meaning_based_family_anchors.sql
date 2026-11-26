begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Give legacy spelling families one explicit approved base meaning, without
-- renaming their keys or splitting the family when a word changes POS.
create table public.teaching_dictionary_legacy_family_sense_anchors (
 family_key text primary key,
 canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
 sense_id text not null,
 reviewed_by uuid not null references auth.users(id),
 reviewed_at timestamptz not null default now(),
 source_reference text not null check(btrim(source_reference)<>'')
);
alter table public.teaching_dictionary_legacy_family_sense_anchors enable row level security;
revoke all on public.teaching_dictionary_legacy_family_sense_anchors from public,anon,authenticated;
grant select on public.teaching_dictionary_legacy_family_sense_anchors to service_role;
create trigger teaching_legacy_family_anchor_immutable before update or delete
 on public.teaching_dictionary_legacy_family_sense_anchors for each row execute function public.reject_writing_fact_update();

create or replace view public.teaching_dictionary_families_with_current_meaning as
select f.family_key,f.revision,f.base_lemma,
 case when a.sense_id is not null then coalesce(base.value->>'partOfSpeech',f.base_part_of_speech) else f.base_part_of_speech end as base_part_of_speech,
 f.base_kind,f.canonical_base_word_id,
 coalesce(f.canonical_base_sense_id,a.sense_id) as canonical_base_sense_id,f.review_status,
 case when coalesce(f.canonical_base_sense_id,a.sense_id) is null then f.base_meaning else coalesce(base.value->>'definition',f.base_meaning) end as base_meaning
from public.canonical_teaching_dictionary_lexical_base_families f
left join public.teaching_dictionary_legacy_family_sense_anchors a on a.family_key=f.family_key
 and a.canonical_word_id=f.canonical_base_word_id and f.canonical_base_sense_id is null
left join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=f.canonical_base_word_id
left join lateral (
 select value from jsonb_array_elements(s.sense_set->'senses') where value->>'id'=coalesce(f.canonical_base_sense_id,a.sense_id)
) base on true;

-- Explicit family approval chooses a spelling/meaning relationship. The
-- word's noun/verb role stays on its own sense; it is not a family identity.
do $meaning$
declare body text; original text; replacement text;
begin
 select pg_get_functiondef('public.review_teaching_dictionary_sense_family_membership(uuid,uuid,text,uuid,text,text,text,text,uuid,text)'::regprocedure) into body;
 original:=$old$  if v_family.family_key is null then raise exception 'SENSE_FAMILY_CURRENT_FAMILY_REQUIRED'; end if;$old$;
 replacement:=original||$new$
  select base_meaning,canonical_base_sense_id,base_part_of_speech
    into v_family.base_meaning,v_family.canonical_base_sense_id,v_family.base_part_of_speech
    from public.teaching_dictionary_families_with_current_meaning
    where family_key=v_family.family_key and revision=v_family.revision;$new$;
 if position(original in body)=0 then raise exception 'FAMILY_MEANING_READER_GUARD_CHANGED'; end if;
 body:=replace(body,original,replacement);
 original:=$old$    or v_family.base_part_of_speech is distinct from v_sense->>'partOfSpeech'
    or (p_action='approve' and v_family.canonical_base_sense_id is not null and v_family.canonical_base_sense_id is distinct from p_sense_id)$old$;
 if position(original in body)=0 then raise exception 'FAMILY_MEANING_ANCHOR_GUARD_CHANGED'; end if;
 body:=replace(body,original,'');
 original:=$old$  return v_id;
end $old$;
 replacement:=$new$  if p_action='approve' and p_relationship_kind='free_base' and exists(
    select 1 from public.canonical_teaching_dictionary_lexical_base_families f
    where f.family_key=p_family_key and f.revision=v_family.revision
      and f.canonical_base_word_id=p_word_id and f.canonical_base_sense_id is null
  ) then
    insert into public.teaching_dictionary_legacy_family_sense_anchors
      (family_key,canonical_word_id,sense_id,reviewed_by,source_reference)
    values(p_family_key,p_word_id,p_sense_id,p_actor,p_source_reference)
    on conflict(family_key) do nothing;
  end if;
  return v_id;
end $new$;
 if position(original in body)=0 then raise exception 'FAMILY_MEANING_APPROVAL_GUARD_CHANGED'; end if;
 execute replace(body,original,replacement);
end;
$meaning$;
notify pgrst,'reload schema';
commit;
