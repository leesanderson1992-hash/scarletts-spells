begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- An explicit editorial equivalence decision, not an inference from spelling
-- or POS. Immutable source families remain available to historical snapshots.
create table public.teaching_dictionary_lexical_family_successions (
 old_family_key text primary key,
 old_revision integer not null,
 canonical_family_key text not null,
 canonical_revision integer not null,
 canonical_base_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
 canonical_base_sense_id text not null,
 reviewed_by uuid not null references auth.users(id),
 source_reference text not null check(btrim(source_reference)<>''),
 reviewed_at timestamptz not null default now(),
 foreign key(old_family_key,old_revision) references public.canonical_teaching_dictionary_lexical_base_families(family_key,revision),
 foreign key(canonical_family_key,canonical_revision) references public.canonical_teaching_dictionary_lexical_base_families(family_key,revision),
 check(old_family_key<>canonical_family_key)
);
alter table public.teaching_dictionary_lexical_family_successions enable row level security;
revoke all on public.teaching_dictionary_lexical_family_successions from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_lexical_family_successions to service_role;
create trigger lexical_family_succession_immutable before update or delete
 on public.teaching_dictionary_lexical_family_successions for each row execute function public.reject_writing_fact_update();
create function public.validate_teaching_dictionary_lexical_family_succession()
returns trigger language plpgsql set search_path=public as $$
declare old_family record; target record;
begin
 select * into strict old_family from canonical_teaching_dictionary_lexical_base_families
 where family_key=new.old_family_key and revision=new.old_revision;
 select * into strict target from canonical_teaching_dictionary_lexical_base_families
 where family_key=new.canonical_family_key and revision=new.canonical_revision;
 if old_family.review_status<>'approved' or target.review_status<>'approved'
   or old_family.canonical_base_word_id is distinct from new.canonical_base_word_id
   or target.canonical_base_word_id is distinct from new.canonical_base_word_id
   or target.canonical_base_sense_id is distinct from new.canonical_base_sense_id
   or old_family.base_kind is distinct from target.base_kind
   or (old_family.canonical_base_sense_id is not null and old_family.canonical_base_sense_id is distinct from new.canonical_base_sense_id)
   or exists(select 1 from teaching_dictionary_lexical_family_successions
      where old_family_key=new.canonical_family_key or canonical_family_key=new.old_family_key)
 then raise exception 'FAMILY_SUCCESSION_IDENTITY_MISMATCH'; end if;
 return new;
end;
$$;
create trigger lexical_family_succession_identity before insert
 on public.teaching_dictionary_lexical_family_successions for each row
 execute function public.validate_teaching_dictionary_lexical_family_succession();

create or replace view public.teaching_dictionary_families_with_current_meaning as
select f.family_key,f.revision,f.base_lemma,
 case when a.sense_id is not null then coalesce(base.value->>'partOfSpeech',f.base_part_of_speech) else f.base_part_of_speech end as base_part_of_speech,
 case when base.value->>'partOfSpeech'='root' then 'bound_root' else f.base_kind end as base_kind,f.canonical_base_word_id,
 coalesce(f.canonical_base_sense_id,a.sense_id) as canonical_base_sense_id,f.review_status,
 case when coalesce(f.canonical_base_sense_id,a.sense_id) is null then f.base_meaning else coalesce(base.value->>'definition',f.base_meaning) end as base_meaning,
 coalesce(successor.canonical_family_key,f.family_key) as canonical_family_key,
 successor.old_family_key is null as is_current_family
from public.canonical_teaching_dictionary_lexical_base_families f
left join public.teaching_dictionary_lexical_family_successions successor on successor.old_family_key=f.family_key
left join public.teaching_dictionary_legacy_family_sense_anchors a on a.family_key=f.family_key
 and a.canonical_word_id=f.canonical_base_word_id and f.canonical_base_sense_id is null
left join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=f.canonical_base_word_id
left join lateral (
 select value from jsonb_array_elements(s.sense_set->'senses') where value->>'id'=coalesce(f.canonical_base_sense_id,a.sense_id)
) base on true;

-- Old workbooks may still name an archived key. New approvals use its reviewed
-- successor; withdrawals retain their original key and historical evidence.
do $compatibility$
declare body text; original text;
begin
 select pg_get_functiondef('public.review_teaching_dictionary_sense_family_membership(uuid,uuid,text,uuid,text,text,text,text,uuid,text)'::regprocedure) into body;
 original:='begin';
 if position(original in lower(body))=0 then raise exception 'FAMILY_REVIEW_FUNCTION_CHANGED'; end if;
 body:=overlay(body placing $new$begin
  if p_action='approve' and not exists(select 1 from public.teaching_dictionary_sense_family_membership_events
    where request_id=p_request_id and family_key=p_family_key) then
    p_family_key:=coalesce((select canonical_family_key from public.teaching_dictionary_lexical_family_successions
      where old_family_key=p_family_key),p_family_key);
  end if;$new$ from position(original in lower(body)) for length(original));
 execute body;
end;
$compatibility$;
notify pgrst,'reload schema';
commit;
