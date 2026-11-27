begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

update public.micro_skill_catalog set is_active=false,is_assignable=false,
 metadata=metadata||jsonb_build_object('retired_reason','Owner retained only Latin and Greek root micro-skills, 2026-11-27',
 'successor_keys',jsonb_build_array('D4_MOR_ROOTS_COMMON_LATIN_ROOTS','D4_MOR_ROOTS_COMMON_GREEK_ROOTS')),updated_at=now()
where micro_skill_key in ('D4_MOR_ROOTS_ROOT_FAMILY_SPELLING','D4_MOR_ROOTS_SCIENCE_MATH_ROOTS');
update public.micro_skill_catalog set display_name=case micro_skill_key
 when 'D4_MOR_ROOTS_COMMON_LATIN_ROOTS' then 'Common Latin roots' else 'Common Greek roots' end,
 metadata=metadata||jsonb_build_object('root_assignment_source','reviewed_historical_language_v1'),updated_at=now()
where micro_skill_key in ('D4_MOR_ROOTS_COMMON_LATIN_ROOTS','D4_MOR_ROOTS_COMMON_GREEK_ROOTS');

create function public.root_micro_skill_for_historical_language(p_language text)
returns text language sql immutable set search_path=public,pg_temp as $$
 select case
 when lower(btrim(p_language)) ~ '^(ancient |classical )?greek( via .+)?$' then 'D4_MOR_ROOTS_COMMON_GREEK_ROOTS'
 when lower(btrim(p_language)) ~ '^((classical|late|medieval) )?latin([- ]derived)?( via .+)?$' then 'D4_MOR_ROOTS_COMMON_LATIN_ROOTS'
 end;
$$;
revoke all on function public.root_micro_skill_for_historical_language(text) from public,anon,authenticated;
grant execute on function public.root_micro_skill_for_historical_language(text) to service_role;

-- Editing a historical language creates a new immutable root-family revision.
create function public.review_root_historical_language(
 p_family text,p_expected_revision integer,p_origin text,p_actor uuid,p_source text
) returns integer language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
 r public.canonical_teaching_dictionary_lexical_root_metadata%rowtype;
 v_next integer;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor)
 or coalesce(length(btrim(p_origin)),0) not between 1 and 120
 or nullif(btrim(p_source),'') is null then raise exception 'ROOT_LANGUAGE_REVIEW_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||p_family,0));
 select * into f from public.canonical_teaching_dictionary_lexical_base_families
 where family_key=p_family order by revision desc limit 1;
 if f.family_key is null or f.review_status<>'approved'
 or not exists(select 1 from public.teaching_dictionary_families_with_current_meaning v
 where v.family_key=p_family and v.revision=f.revision and v.is_current_family and v.base_kind='bound_root')
 then raise exception 'ROOT_LANGUAGE_APPROVED_FAMILY_REQUIRED'; end if;
 select * into r from public.canonical_teaching_dictionary_lexical_root_metadata
 where family_key=p_family and revision=f.revision;
 if r.family_key is null then raise exception 'ROOT_LANGUAGE_METADATA_REQUIRED'; end if;
 if r.origin_language=btrim(p_origin) then return f.revision; end if;
 if f.revision<>p_expected_revision then raise exception 'ROOT_LANGUAGE_REVIEW_STALE'; end if;
 v_next:=f.revision+1;
 insert into public.canonical_teaching_dictionary_lexical_base_families
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_base_families,
 to_jsonb(f)||jsonb_build_object('revision',v_next,'review_status','draft','reviewed_by',null,
 'reviewed_at',null,'approval_reference',null,'semantic_fingerprint',null,'source_reference',p_source,'created_at',clock_timestamp()))).*;
 insert into public.canonical_teaching_dictionary_lexical_base_family_members
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_base_family_members,
 to_jsonb(m)||jsonb_build_object('revision',v_next))).*
 from public.canonical_teaching_dictionary_lexical_base_family_members m where family_key=p_family and revision=f.revision;
 insert into public.canonical_teaching_dictionary_lexical_base_variants
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_base_variants,
 to_jsonb(v)||jsonb_build_object('revision',v_next))).*
 from public.canonical_teaching_dictionary_lexical_base_variants v where family_key=p_family and revision=f.revision;
 insert into public.canonical_teaching_dictionary_lexical_root_metadata
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_root_metadata,
 to_jsonb(r)||jsonb_build_object('revision',v_next,'origin_language',btrim(p_origin),'source_reference',p_source,
 'approval_reference',p_source,'reviewed_by',p_actor::text,'reviewed_at',clock_timestamp(),'created_at',clock_timestamp()))).*;
 update public.canonical_teaching_dictionary_lexical_base_families set review_status='approved',
 reviewed_by=p_actor::text,reviewed_at=clock_timestamp(),approval_reference=p_source,
 semantic_fingerprint=public.adle_generic_snapshot_json_sha256_v1(jsonb_build_object(
 'prior',f.semantic_fingerprint,'revision',v_next,'historicalLanguage',btrim(p_origin)))
 where family_key=p_family and revision=v_next;
 return v_next;
end $$;
revoke all on function public.review_root_historical_language(text,integer,text,uuid,text) from public,anon,authenticated;
grant execute on function public.review_root_historical_language(text,integer,text,uuid,text) to service_role;

create view public.teaching_dictionary_root_skill_families as
with latest as (
 select distinct on(family_key) * from public.teaching_dictionary_families_with_current_meaning
 where is_current_family and review_status='approved' and base_kind='bound_root'
 order by family_key,revision desc
)
select f.family_key,f.revision,f.canonical_base_word_id root_word_id,f.canonical_base_sense_id root_sense_id,
 r.root_text,r.origin_language,c.micro_skill_key,c.display_name,r.reviewed_at
from latest f join public.canonical_teaching_dictionary_lexical_root_metadata r using(family_key,revision)
join public.micro_skill_catalog c on c.micro_skill_key=public.root_micro_skill_for_historical_language(r.origin_language)
where c.is_active and c.is_assignable;

-- Family classification is automatic; it does not approve a spelling target.
-- Whole-word members inherit the classification only from approved family links.
create view public.teaching_dictionary_root_language_assignments as
with aliases as (
 select distinct family_key,canonical_family_key from public.teaching_dictionary_families_with_current_meaning
), members as (
 select m.canonical_word_id,m.sense_id,f.family_key,f.revision,f.root_text,f.origin_language,f.micro_skill_key,
 f.display_name,greatest(f.reviewed_at,m.reviewed_at) source_reviewed_at
 from public.teaching_dictionary_current_sense_family_memberships m
 join aliases a on a.family_key=m.family_key
 join public.teaching_dictionary_root_skill_families f on f.family_key=a.canonical_family_key
 join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=m.canonical_word_id
 join lateral jsonb_array_elements(s.sense_set->'senses') sense on sense->>'id'=m.sense_id
 where sense->>'partOfSpeech'<>'root'
 union all
 select m.canonical_word_id,
 case when jsonb_array_length(s.sense_set->'senses')=1 and s.sense_set#>>'{senses,0,partOfSpeech}'<>'root'
 then s.sense_set#>>'{senses,0,id}' end,
 f.family_key,f.revision,f.root_text,f.origin_language,f.micro_skill_key,f.display_name,f.reviewed_at
 from public.teaching_dictionary_spelling_lexical_members m
 join (select distinct on(family_key) family_key,revision,canonical_family_key
 from public.teaching_dictionary_families_with_current_meaning where review_status='approved'
 order by family_key,revision desc) a on a.family_key=m.family_key and a.revision=m.revision
 join public.teaching_dictionary_root_skill_families f on f.family_key=a.canonical_family_key
 left join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=m.canonical_word_id
 where m.canonical_word_id<>f.root_word_id
), combined as (
 select f.root_word_id canonical_word_id,f.root_sense_id sense_id,'root_support'::text assignment_role,
 f.family_key,f.revision,f.root_text,f.origin_language,f.micro_skill_key,f.display_name,f.reviewed_at source_reviewed_at
 from public.teaching_dictionary_root_skill_families f
 union all
 select m.canonical_word_id,m.sense_id,'family_member',m.family_key,m.revision,m.root_text,m.origin_language,
 m.micro_skill_key,m.display_name,m.source_reviewed_at from members m
 where not exists(select 1 from public.teaching_dictionary_root_only_entries r where r.canonical_word_id=m.canonical_word_id)
)
select a.canonical_word_id,a.sense_id,a.assignment_role,a.family_key,a.revision,a.root_text,a.origin_language,
 a.micro_skill_key,a.display_name,max(a.source_reviewed_at) source_reviewed_at
from combined a join public.canonical_teaching_dictionary_words w on w.id=a.canonical_word_id
 and w.row_status='active' and w.review_status='approved_for_first_exposure'
group by a.canonical_word_id,a.sense_id,a.assignment_role,a.family_key,a.revision,a.root_text,a.origin_language,a.micro_skill_key,a.display_name;
revoke all on public.teaching_dictionary_root_skill_families,public.teaching_dictionary_root_language_assignments from public,anon,authenticated;
grant select on public.teaching_dictionary_root_skill_families,public.teaching_dictionary_root_language_assignments to service_role;

alter function public.teaching_dictionary_lesson_review_queue(text,text,uuid)
 rename to teaching_dictionary_lesson_review_queue_before_root_language;
create function public.teaching_dictionary_lesson_review_queue(p_environment text,p_skill text,p_word uuid default null)
returns table(word_id uuid,word text,sense_id text,micro_skill_key text)
language sql stable security invoker set search_path=public,pg_temp as $$
 with sources as (
 select q.* from public.teaching_dictionary_lesson_review_queue_before_root_language(p_environment,p_skill,p_word) q
 join public.micro_skill_catalog c on c.micro_skill_key=q.micro_skill_key and c.is_active and c.is_assignable
 where q.micro_skill_key not in ('D4_MOR_ROOTS_COMMON_LATIN_ROOTS','D4_MOR_ROOTS_COMMON_GREEK_ROOTS')
 union all
 select a.canonical_word_id,w.display_word,a.sense_id,a.micro_skill_key
 from public.teaching_dictionary_root_language_assignments a
 join public.canonical_teaching_dictionary_words w on w.id=a.canonical_word_id
 where a.assignment_role='family_member' and p_environment in ('staging','production')
 and (p_skill is not null or p_word is not null)
 and (p_skill is null or a.micro_skill_key=p_skill) and (p_word is null or a.canonical_word_id=p_word)
 and not exists(select 1 from public.teaching_dictionary_bulk_review_exclusions x
 where x.environment_key=p_environment and x.micro_skill_key=a.micro_skill_key and x.canonical_word_id=a.canonical_word_id
 and x.reviewed_at>=a.source_reviewed_at)
 and not exists(select 1 from public.teaching_dictionary_pair_latest_decisions d
 join public.teaching_dictionary_pair_decision_events e on e.id=d.id
 where d.environment_key=p_environment and d.micro_skill_key=a.micro_skill_key and d.canonical_word_id=a.canonical_word_id
 and d.action='deassign' and e.decided_at>=a.source_reviewed_at)
 )
 select word_id,word,case when count(distinct sense_id)=1 and bool_and(sense_id is not null)
 then min(sense_id) end,micro_skill_key from sources group by word_id,word,micro_skill_key order by word_id,micro_skill_key;
$$;
revoke all on function public.teaching_dictionary_lesson_review_queue(text,text,uuid) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_lesson_review_queue(text,text,uuid) to service_role;

create function public.guard_retired_root_skill_new_work()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) end;
 k text; item_key text; previous_key text;
begin
 k:=case when tg_table_name='assignment_items' then n->'metadata'->>'microSkillKey' else n->>'micro_skill_key' end;
 if tg_table_name='assignment_items' and nullif(n->>'learning_item_id','') is not null then
 select micro_skill_key into item_key from public.adle_learning_items where id=(n->>'learning_item_id')::uuid;
 end if;
 if k in ('D4_MOR_ROOTS_ROOT_FAMILY_SPELLING','D4_MOR_ROOTS_SCIENCE_MATH_ROOTS')
 or item_key in ('D4_MOR_ROOTS_ROOT_FAMILY_SPELLING','D4_MOR_ROOTS_SCIENCE_MATH_ROOTS') then
 previous_key:=case when tg_table_name='assignment_items' then o->'metadata'->>'microSkillKey' else o->>'micro_skill_key' end;
 if tg_op='INSERT' or k is distinct from previous_key
 or n->>'canonical_word_id' is distinct from o->>'canonical_word_id'
 or n->>'learning_item_id' is distinct from o->>'learning_item_id'
 or (n->>'row_status'='active' and o->>'row_status' is distinct from 'active')
 or (n->>'mapping_status'='active' and o->>'mapping_status' is distinct from 'active')
 or n->>'correct_spelling' is distinct from o->>'correct_spelling'
 then raise exception 'RETIRED_ROOT_MICRO_SKILL: no new work for removed root skills'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_retired_root_skill_new_work() from public,anon,authenticated;
create trigger retired_root_mapping_guard before insert or update on public.spelling_canonical_mappings
 for each row execute function public.guard_retired_root_skill_new_work();
create trigger retired_root_learning_item_guard before insert or update on public.adle_learning_items
 for each row execute function public.guard_retired_root_skill_new_work();
create trigger retired_root_assignment_guard before insert or update of metadata,learning_item_id on public.assignment_items
 for each row execute function public.guard_retired_root_skill_new_work();
create trigger retired_root_review_request_guard before insert on public.teaching_dictionary_lesson_review_requests
 for each row execute function public.guard_retired_root_skill_new_work();
notify pgrst,'reload schema';
commit;
