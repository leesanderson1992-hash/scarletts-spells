begin;
create table public.teaching_dictionary_root_candidate_dismissals (
 environment_key text not null check(environment_key in('staging','production')),
 root_text text not null check(root_text ~ '^[a-z]+$'),
 canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
 sense_id text not null,
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 reviewed_by uuid not null references auth.users(id),
 source_reference text not null check(btrim(source_reference)<>''),
 reviewed_at timestamptz not null default now(),
 primary key(environment_key,root_text,canonical_word_id,sense_id,source_fingerprint)
);
alter table public.teaching_dictionary_root_candidate_dismissals enable row level security;
revoke all on public.teaching_dictionary_root_candidate_dismissals from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_root_candidate_dismissals to service_role;
create trigger root_candidate_dismissals_immutable before update or delete
 on public.teaching_dictionary_root_candidate_dismissals for each row execute function public.reject_writing_fact_update();

-- A legacy unanchored 'to carry' free-base family may be an editorial duplicate
-- of an existing reviewed bound-root meaning. Require explicit review, the
-- same canonical word, exact single-root facts and equivalent meaning. This is
-- not permission to merge a harbour noun meaning into the carry root.
do $patch$ declare body text; old text; replacement text;
begin
 select pg_get_functiondef('public.validate_teaching_dictionary_lexical_family_succession()'::regprocedure) into body;
 old:='reclassified:=old_effective.base_kind=''bound_root''';
 replacement:=$sql$if old_effective.base_kind='free_base' and target_effective.base_kind='bound_root'
    and old_effective.canonical_base_sense_id is null then
   reclassified:=lower(regexp_replace(btrim(old_family.base_meaning,' .'),'^[Tt][Oo][[:space:]]+',''))=lower(btrim(target_effective.base_meaning,' .'))
    and exists(select 1 from teaching_dictionary_reviewed_sense_sets s
     join teaching_dictionary_current_sense_morphology m on m.canonical_word_id=s.canonical_word_id and m.sense_id=new.canonical_base_sense_id
     cross join lateral jsonb_array_elements(s.sense_set->'senses') sense
     where s.canonical_word_id=new.canonical_base_word_id and sense->>'id'=new.canonical_base_sense_id
      and sense->>'partOfSpeech'='root' and jsonb_array_length(m.morphology_parts)=1
      and m.morphology_parts#>>'{0,kind}'='root'
      and m.morphology_parts#>>'{0,sourceText}'=target.base_lemma
      and m.morphology_parts#>>'{0,surfaceText}'=target.base_lemma);
  else
   reclassified:=old_effective.base_kind='bound_root'$sql$;
 if position(old in body)=0 then raise exception 'FAMILY_RECLASSIFICATION_PATCH_NOT_FOUND';end if;
 body:=replace(body,old,replacement);
 body:=replace(body,'if not reclassified then raise exception','end if; if not reclassified then raise exception');
 execute body;
end $patch$;
notify pgrst,'reload schema';
commit;
