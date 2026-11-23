begin;
-- New assignments derive cuts from approved Dictionary divisions. Publications
-- and existing lesson snapshots remain immutable. Explicit alternatives retain
-- their published cuts; unresolved review holds cannot enter new assignments.
create function public.teaching_dictionary_schwa_current_division_facts(p_word uuid,p_skill text,p_environment text,p_facts jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare divisions text; spelling text; cuts jsonb; source text; syllable integer;
begin
 if exists(select 1 from public.teaching_dictionary_schwa_syllable_reviews where canonical_word_id=p_word and micro_skill_key=p_skill and environment_key=p_environment and resolved_at is null) then return null; end if;
 select m.written_syllable_breakdown,w.display_word into divisions,spelling
 from public.canonical_teaching_dictionary_word_metadata m join public.canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
 where m.canonical_word_id=p_word and m.row_status='active' and m.review_status='approved_for_first_exposure' order by m.created_at desc,m.id desc limit 1;
 if divisions is null or replace(divisions,'·','')<>spelling or divisions ~ '(^·|··|·$)' then return null; end if;
 select coalesce(jsonb_agg(edge order by n),'[]'::jsonb) into cuts from (
   select n,sum(length(part)) over(order by n) edge from unnest(string_to_array(divisions,'·')) with ordinality t(part,n)
 ) t where n<cardinality(string_to_array(divisions,'·'));
 source:=p_facts->>'syllableSource';
 if source='reviewed_alternative' then return p_facts; end if;
 if source is not null and source<>'dictionary' then return null; end if;
 if source is null and p_facts->'acceptedCutSets' is distinct from jsonb_build_array(cuts) then return null; end if;
 select 1+count(*)::integer into syllable from jsonb_array_elements_text(cuts) edge where edge.value::integer<=(p_facts#>>'{target,start}')::integer;
 return jsonb_set(jsonb_set(p_facts,'{acceptedCutSets}',jsonb_build_array(cuts)),'{target,syllableIndex}',to_jsonb(syllable));
end $$;
revoke all on function public.teaching_dictionary_schwa_current_division_facts(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_schwa_current_division_facts(uuid,text,text,jsonb) to service_role;
do $$
declare definition text; original text;
begin
 select pg_get_functiondef('public.assert_adle_weak_vowel_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid)'::regprocedure) into original;
 definition:=replace(original,
   'c.content#>''{content,weakVowel,target}'' is distinct from w#>''{dinner,target}''',
   '(public.teaching_dictionary_schwa_current_division_facts(c.canonical_word_id,r.micro_skill_key,r.environment_key,c.content#>''{content,weakVowel}''))->''target'' is distinct from w#>''{dinner,target}''');
 definition:=replace(definition,
   'c.content#>''{content,weakVowel,acceptedCutSets}'' is distinct from w#>''{dinner,acceptedCutSets}''',
   '(public.teaching_dictionary_schwa_current_division_facts(c.canonical_word_id,r.micro_skill_key,r.environment_key,c.content#>''{content,weakVowel}''))->''acceptedCutSets'' is distinct from w#>''{dinner,acceptedCutSets}''');
 if definition=original or position('c.content#>''{content,weakVowel,acceptedCutSets}'' is distinct' in definition)>0 or position('c.content#>''{content,weakVowel,target}'' is distinct' in definition)>0 then raise exception 'Schwa assignment validator shape changed; review migration'; end if;
 execute definition;
end $$;
commit;
