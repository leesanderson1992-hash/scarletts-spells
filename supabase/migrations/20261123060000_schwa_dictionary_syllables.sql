begin;
create table public.teaching_dictionary_schwa_syllable_reviews (
 environment_key text not null check(environment_key in ('staging','production','local')),
 canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
 micro_skill_key text not null check(micro_skill_key like 'D4_SCHWA_%'),
 reset_at timestamptz not null default now(), reset_by uuid not null references auth.users(id),
 resolved_at timestamptz, resolved_by uuid references auth.users(id), content_version_id uuid,
 primary key(environment_key,canonical_word_id,micro_skill_key)
);
alter table public.teaching_dictionary_schwa_syllable_reviews enable row level security;
revoke all on public.teaching_dictionary_schwa_syllable_reviews from public,anon,authenticated;
grant all on public.teaching_dictionary_schwa_syllable_reviews to service_role;
create function public.review_dictionary_written_divisions(p_word uuid,p_divisions text,p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare old public.canonical_teaching_dictionary_word_metadata%rowtype; replacement public.canonical_teaching_dictionary_word_metadata%rowtype; spelling text; pronunciation jsonb; batch uuid; created uuid;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'REVIEW_ACTOR_REQUIRED'; end if;
 select display_word into spelling from public.canonical_teaching_dictionary_words where id=p_word and row_status='active' for update;
 if spelling is null or p_divisions is null or length(p_divisions)>300 or replace(p_divisions,'·','')<>spelling or p_divisions ~ '(^·|··|·$)' then raise exception 'WRITTEN_SYLLABLE_BREAKDOWN_WORD_MISMATCH'; end if;
 select * into old from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=p_word and row_status='active' order by created_at desc,id desc limit 1 for update;
 if old.id is null then
   select p.value into pronunciation from public.teaching_dictionary_reviewed_sense_sets s
     cross join lateral jsonb_array_elements(s.sense_set->'pronunciations') p where s.canonical_word_id=p_word limit 1;
   if pronunciation is null then raise exception 'Review the Dictionary pronunciation first.'; end if;
   select import_batch_id into batch from public.canonical_teaching_dictionary_words where id=p_word;
   insert into public.canonical_teaching_dictionary_word_metadata
     (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,
      source_category,source_use_note,confidence,review_status,reviewed_by,reviewed_at,written_syllable_breakdown,syllables,phoneme_hint,stress_pattern)
   values(batch,p_word,'active','Schwa written division review',2,
     encode(digest(convert_to(p_word::text||p_divisions,'UTF8'),'sha256'),'hex'),
     jsonb_build_object('humanApprovedWrittenSyllableBreakdown',p_divisions,'syllableReviewSource','Owner reviewed Schwa workbook'),
     'internal_authored','Admin reviewed written divisions; pronunciation reused from approved Dictionary sense','high','approved_for_first_exposure',p_actor::text,now(),p_divisions,
     pronunciation->>'spokenSyllableCount',pronunciation->>'ipa',pronunciation->>'stressPattern') returning id into created;
   return created;
 end if;
 if old.written_syllable_breakdown=p_divisions and old.review_status='approved_for_first_exposure' then return old.id; end if;
 replacement:=jsonb_populate_record(old,jsonb_build_object('id',gen_random_uuid(),'written_syllable_breakdown',p_divisions,
 'created_at',now(),'updated_at',now(),'reviewed_at',now(),'reviewed_by',p_actor::text,
 'source_row_hash',encode(digest(convert_to(old.id::text||p_divisions,'UTF8'),'sha256'),'hex'),
 'source_metadata',coalesce(old.source_metadata,'{}'::jsonb)||jsonb_build_object('humanApprovedWrittenSyllableBreakdown',p_divisions,'syllableReviewSource','Owner reviewed Schwa workbook')));
 update public.canonical_teaching_dictionary_word_metadata set row_status='superseded',updated_at=now() where canonical_word_id=p_word and row_status='active';
 insert into public.canonical_teaching_dictionary_word_metadata select replacement.*;
 return replacement.id;
end $$;
revoke all on function public.review_dictionary_written_divisions(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.review_dictionary_written_divisions(uuid,text,uuid) to service_role;
-- Publication is the only action that returns a reset pair to Active.
create function public.check_schwa_dictionary_divisions_at_publication()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.teaching_dictionary_route_content_versions%rowtype; f jsonb; divisions text; cuts jsonb; reset timestamptz; draft_created timestamptz;
begin
 select * into v from public.teaching_dictionary_route_content_versions where id=new.content_version_id;
 f:=v.content#>'{content,weakVowel}';
 select written_syllable_breakdown into divisions from public.canonical_teaching_dictionary_word_metadata
 where canonical_word_id=new.canonical_word_id and row_status='active' and review_status='approved_for_first_exposure' order by created_at desc,id desc limit 1;
 if divisions is null then raise exception 'Review Dictionary written syllable divisions before publishing.'; end if;
 select coalesce(jsonb_agg(edge order by n),'[]'::jsonb) into cuts from (
   select n,sum(length(part)) over(order by n) edge from unnest(string_to_array(divisions,'·')) with ordinality t(part,n)
 ) t where n<cardinality(string_to_array(divisions,'·'));
 if coalesce(f->>'syllableSource','dictionary')<>'reviewed_alternative' and (f->'acceptedCutSets' is distinct from jsonb_build_array(cuts)) then
   raise exception 'Activity cuts conflict with Dictionary divisions. Save and recheck the current Dictionary cuts.';
 end if;
 -- The publication table is shared within one environment database. Scope pending rows by the reviewed draft's actor and reset time.
 for reset in select reset_at from public.teaching_dictionary_schwa_syllable_reviews where canonical_word_id=new.canonical_word_id and micro_skill_key=new.micro_skill_key and resolved_at is null loop
   select created_at into draft_created from public.teaching_dictionary_manager_drafts where id=v.draft_id;
   if draft_created is null or draft_created<=reset or (v.content#>'{content,schwaWorkbookFields}' is not null and nullif(v.content#>>'{content,schwaWorkbookFields,syllable_review_epoch}','')::timestamptz is distinct from reset) then raise exception 'Review Dictionary divisions in a new saved review before publishing.'; end if;
 end loop;
 update public.teaching_dictionary_schwa_syllable_reviews set resolved_at=now(),resolved_by=new.published_by,content_version_id=new.content_version_id
 where canonical_word_id=new.canonical_word_id and micro_skill_key=new.micro_skill_key and resolved_at is null;
 return new;
end $$;
revoke all on function public.check_schwa_dictionary_divisions_at_publication() from public,anon,authenticated;
create trigger check_schwa_dictionary_divisions_before_publication before insert on public.adle_weak_vowel_content_publications
 for each row execute function public.check_schwa_dictionary_divisions_at_publication();
commit;
