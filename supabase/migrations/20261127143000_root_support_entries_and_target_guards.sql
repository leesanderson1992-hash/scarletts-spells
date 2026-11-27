begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- A reviewed root meaning is curriculum support, not an ordinary target.
-- Mixed entries retain their separately reviewed whole-word meanings.
create view public.teaching_dictionary_root_only_entries as
select s.canonical_word_id
from public.teaching_dictionary_reviewed_sense_sets s
where jsonb_array_length(s.sense_set->'senses')>0
 and not exists(select 1 from jsonb_array_elements(s.sense_set->'senses') meaning
   where coalesce(meaning->>'partOfSpeech','')<>'root');
revoke all on public.teaching_dictionary_root_only_entries from public,anon,authenticated;
grant select on public.teaching_dictionary_root_only_entries to service_role;

create function public.teaching_dictionary_word_is_root_only(p_word uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.teaching_dictionary_root_only_entries where canonical_word_id=p_word);
$$;
revoke all on function public.teaching_dictionary_word_is_root_only(uuid) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_word_is_root_only(uuid) to service_role;

create function public.guard_root_only_spelling_target()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare word_id uuid;
begin
 if tg_table_name='adle_learning_items' then
   if new.row_status<>'active' then return new; end if;
   if tg_op='UPDATE' and old.canonical_word_id=new.canonical_word_id
     and old.micro_skill_key=new.micro_skill_key and old.row_status=new.row_status then return new; end if;
   word_id:=new.canonical_word_id;
 else
   if new.target_word is null then return new; end if;
   if tg_op='UPDATE' and new.target_word is not distinct from old.target_word
     and new.learning_item_id is not distinct from old.learning_item_id then return new; end if;
   if new.learning_item_id is not null then
     select canonical_word_id into word_id from public.adle_learning_items where id=new.learning_item_id;
   end if;
   if word_id is null then
     select w.id into word_id from public.canonical_teaching_dictionary_words w
      join public.teaching_dictionary_root_only_entries r on r.canonical_word_id=w.id
      where w.normalised_word=lower(translate(btrim(new.target_word),'’ʼ',chr(39)||chr(39)))
        and w.row_status='active' limit 1;
   end if;
 end if;
 if public.teaching_dictionary_word_is_root_only(word_id) then raise exception 'ROOT_SUPPORT_ONLY: root entries cannot be ordinary spelling targets'; end if;
 return new;
end;
$$;
revoke all on function public.guard_root_only_spelling_target() from public,anon,authenticated;
create trigger root_only_learning_item_guard before insert or update of canonical_word_id,micro_skill_key,row_status
 on public.adle_learning_items for each row execute function public.guard_root_only_spelling_target();
create trigger root_only_assignment_target_guard before insert or update of target_word,learning_item_id
 on public.assignment_items for each row execute function public.guard_root_only_spelling_target();

-- Attach an approved root support entry to an existing historical family.
-- Only the anchor changes; preserve all approved member/variant snapshots.
create function public.attach_reviewed_root_family_entry(
 p_family text,p_expected_revision integer,p_word uuid,p_sense text,p_origin text,p_actor uuid,p_source text
) returns integer language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
 w public.canonical_teaching_dictionary_words%rowtype; meaning jsonb; analysis record; next_revision integer; fp text;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor)
   or nullif(btrim(p_origin),'') is null or nullif(btrim(p_source),'') is null then raise exception 'ROOT_ANCHOR_REVIEW_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||p_family,0));
 select * into f from public.canonical_teaching_dictionary_lexical_base_families where family_key=p_family order by revision desc limit 1;
 if f.family_key is null or f.base_kind<>'bound_root' or f.review_status<>'approved' then raise exception 'ROOT_ANCHOR_FAMILY_INVALID'; end if;
 if f.canonical_base_word_id=p_word and f.canonical_base_sense_id=p_sense then return f.revision; end if;
 if f.revision<>p_expected_revision or f.canonical_base_word_id is not null then raise exception 'ROOT_ANCHOR_FAMILY_CHANGED'; end if;
 select * into w from public.canonical_teaching_dictionary_words where id=p_word and row_status='active'
  and review_status='approved_for_first_exposure' and dialect_code='en-GB' and normalised_word=lower(f.base_lemma);
 select value into meaning from public.teaching_dictionary_reviewed_sense_sets s,jsonb_array_elements(s.sense_set->'senses') value
  where s.canonical_word_id=p_word and value->>'id'=p_sense and value->>'partOfSpeech'='root';
 select * into analysis from public.teaching_dictionary_current_sense_morphology where canonical_word_id=p_word and sense_id=p_sense;
 if w.id is null or meaning is null or meaning->>'definition' is distinct from f.base_meaning or analysis.id is null
   or jsonb_array_length(analysis.morphology_parts)<>1 or analysis.morphology_parts#>>'{0,kind}'<>'root'
   or analysis.morphology_parts#>>'{0,sourceText}' is distinct from f.base_lemma
   or analysis.morphology_parts#>>'{0,surfaceText}' is distinct from w.display_word
 then raise exception 'ROOT_ANCHOR_APPROVED_ENTRY_REQUIRED'; end if;
 next_revision:=f.revision+1;
 insert into public.canonical_teaching_dictionary_lexical_base_families
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_base_families,
  to_jsonb(f)||jsonb_build_object('revision',next_revision,'canonical_base_word_id',p_word,'canonical_base_sense_id',p_sense,
   'review_status','draft','reviewed_by',null,'reviewed_at',null,'approval_reference',null,'semantic_fingerprint',null,
   'source_reference',p_source,'created_at',now()))).*;
 insert into public.canonical_teaching_dictionary_lexical_base_family_members
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_base_family_members,
   to_jsonb(m)||jsonb_build_object('revision',next_revision))).*
 from public.canonical_teaching_dictionary_lexical_base_family_members m where family_key=p_family and revision=f.revision;
 insert into public.canonical_teaching_dictionary_lexical_base_variants
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_base_variants,
   to_jsonb(v)||jsonb_build_object('revision',next_revision))).*
 from public.canonical_teaching_dictionary_lexical_base_variants v where family_key=p_family and revision=f.revision;
 insert into public.canonical_teaching_dictionary_lexical_root_metadata
  (family_key,revision,root_text,root_meaning,root_definition,origin_language,pronunciation_applicability,
   pronunciation_ipa,source_reference,approval_reference,reviewed_by,reviewed_at)
 values(p_family,next_revision,f.base_lemma,f.base_meaning,meaning->>'definition',p_origin,'not_applicable',null,p_source,p_source,p_actor::text,now());
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('previousFamilyFingerprint',f.semantic_fingerprint,
  'family',p_family,'revision',next_revision,'rootEntry',p_word,'rootSense',p_sense,'meaning',meaning,'origin',p_origin)::text,'UTF8'),'sha256'),'hex');
 update public.canonical_teaching_dictionary_lexical_base_families set review_status='approved',reviewed_by=p_actor::text,
  reviewed_at=now(),approval_reference=p_source,semantic_fingerprint=fp where family_key=p_family and revision=next_revision;
 return next_revision;
end;
$$;
revoke all on function public.attach_reviewed_root_family_entry(text,integer,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.attach_reviewed_root_family_entry(text,integer,uuid,text,text,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
