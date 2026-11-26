begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table public.teaching_dictionary_family_link_edit_events (
 request_id uuid primary key, canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
 family_key text not null, action text not null check(action in ('remove','restore')),
 source_memberships jsonb not null, reviewed_by uuid not null references auth.users(id),
 reviewed_at timestamptz not null default now()
);
alter table public.teaching_dictionary_family_link_edit_events enable row level security;
revoke all on public.teaching_dictionary_family_link_edit_events from public,anon,authenticated;
grant select on public.teaching_dictionary_family_link_edit_events to service_role;
create trigger teaching_family_link_edits_immutable before update or delete
 on public.teaching_dictionary_family_link_edit_events for each row execute function public.reject_writing_fact_update();

create function public.remove_teaching_dictionary_spelling_family_member(
 p_request uuid,p_word uuid,p_family text,p_actor uuid
) returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare f record; keys text[]; snapshots jsonb; link record;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) or p_request is null then
   raise exception 'FAMILY_REMOVE_REVIEWER_REQUIRED'; end if;
 if exists(select 1 from teaching_dictionary_family_link_edit_events where request_id=p_request
   and canonical_word_id=p_word and family_key=p_family and action='remove') then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('spelling-family-remove:'||p_word::text,0));
 select * into f from teaching_dictionary_families_with_current_meaning where family_key=p_family order by revision desc limit 1;
 if f.family_key is null then
   select base_family_key family_key,base_word_id canonical_base_word_id,base_meaning into f
   from canonical_teaching_dictionary_base_word_families where base_family_key=p_family and row_status='active';
 end if;
 if f.family_key is null then
   select family_key,base_word_id canonical_base_word_id,base_meaning into f from teaching_dictionary_base_family_definitions where family_key=p_family;
 end if;
 if f.family_key is null then raise exception 'FAMILY_REMOVE_FAMILY_REQUIRED'; end if;
 if f.canonical_base_word_id=p_word then raise exception 'FAMILY_REMOVE_BASE_ANCHOR'; end if;
 select array_agg(distinct k) into keys from (
   select p_family k union
   select a.source_key from canonical_teaching_dictionary_base_family_registry_aliases a where a.canonical_family_id in (
     select id from canonical_teaching_dictionary_base_family_registry where family_key=p_family
     union select canonical_family_id from canonical_teaching_dictionary_base_family_registry_aliases where source_key=p_family)
   union select family_key from teaching_dictionary_base_family_definitions
     where base_word_id=f.canonical_base_word_id and base_meaning=f.base_meaning
 ) candidates;
 snapshots:=coalesce((select jsonb_agg(to_jsonb(m)) from teaching_dictionary_sense_family_membership_events m where canonical_word_id=p_word and family_key=any(keys)),'[]'::jsonb)
 ||coalesce((select jsonb_agg(to_jsonb(m)) from canonical_teaching_dictionary_lexical_base_family_members m where canonical_word_id=p_word and family_key=any(keys)),'[]'::jsonb)
 ||coalesce((select jsonb_agg(to_jsonb(m)) from canonical_teaching_dictionary_base_word_family_members m join canonical_teaching_dictionary_base_word_families b on b.id=m.base_word_family_id where m.canonical_word_id=p_word and b.base_family_key=any(keys)),'[]'::jsonb)
 ||coalesce((select jsonb_agg(to_jsonb(m)) from teaching_dictionary_base_family_member_reviews m where canonical_word_id=p_word and (legacy_family_id in(select id from canonical_teaching_dictionary_base_word_families where base_family_key=any(keys)) or definition_id in(select id from teaching_dictionary_base_family_definitions where family_key=any(keys)))),'[]'::jsonb);
 if jsonb_array_length(snapshots)=0 then raise exception 'FAMILY_REMOVE_MEMBERSHIP_REQUIRED'; end if;
 -- Withdrawal events do not require reapproving stale parts just to remove a link.
 for link in select * from teaching_dictionary_current_sense_family_memberships where canonical_word_id=p_word and family_key=any(keys) loop
   insert into teaching_dictionary_sense_family_membership_events(request_id,canonical_word_id,sense_id,sense_morphology_id,family_key,family_revision,component_part_id,base_meaning,relationship_kind,action,reviewed_by,source_reference)
   values(gen_random_uuid(),p_word,link.sense_id,link.sense_morphology_id,link.family_key,link.current_family_revision,link.component_part_id,link.base_meaning,link.relationship_kind,'withdraw',p_actor,'Confirmed spelling-family removal from word editor');
 end loop;
 insert into teaching_dictionary_base_family_member_withdrawals(review_id,withdrawn_by,reason)
 select r.id,p_actor,'Confirmed spelling-family removal from word editor' from teaching_dictionary_base_family_member_reviews r
 where r.canonical_word_id=p_word and (r.legacy_family_id in(select id from canonical_teaching_dictionary_base_word_families where base_family_key=any(keys)) or r.definition_id in(select id from teaching_dictionary_base_family_definitions where family_key=any(keys)))
 on conflict(review_id) do nothing;
 insert into teaching_dictionary_spelling_family_link_removals(canonical_word_id,family_key,reason,source_memberships,reviewed_by)
 select p_word,k,'Confirmed spelling-family removal from word editor',snapshots,p_actor from unnest(keys) k
 on conflict(canonical_word_id,family_key) do nothing;
 insert into teaching_dictionary_family_link_edit_events(request_id,canonical_word_id,family_key,action,source_memberships,reviewed_by)
 values(p_request,p_word,p_family,'remove',snapshots,p_actor);
end $$;
revoke all on function public.remove_teaching_dictionary_spelling_family_member(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.remove_teaching_dictionary_spelling_family_member(uuid,uuid,text,uuid) to service_role;

-- Removal overrides apply to modern facts too, including stale workbook retries.
do $views$
declare name text; body text;
begin
 foreach name in array array['teaching_dictionary_current_sense_family_memberships','teaching_dictionary_current_sense_family_links'] loop
   select pg_get_viewdef(('public.'||name)::regclass,true) into body;
   execute format('create or replace view public.%I as select kept.* from (%s) kept where not exists(select 1 from public.teaching_dictionary_spelling_family_link_removals removed where removed.canonical_word_id=kept.canonical_word_id and removed.family_key=kept.family_key)',name,rtrim(body,E';\n '));
 end loop;
end;
$views$;

-- Only an explicit fresh editor join restores a removed spelling link.
create function public.approve_teaching_dictionary_spelling_family_member(
 p_request uuid,p_word uuid,p_sense text,p_morphology uuid,p_family text,p_part text,p_relationship text,p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result uuid; removed jsonb;
begin
 result:=public.review_teaching_dictionary_sense_family_membership(p_request,p_word,p_sense,p_morphology,p_family,p_part,p_relationship,'approve',p_actor,'Explicit family assignment in word editor');
 select to_jsonb(r) into removed from teaching_dictionary_spelling_family_link_removals r where canonical_word_id=p_word and family_key=p_family for update;
 if removed is not null then
   insert into teaching_dictionary_family_link_edit_events(request_id,canonical_word_id,family_key,action,source_memberships,reviewed_by)
   values(p_request,p_word,p_family,'restore',jsonb_build_array(removed),p_actor) on conflict(request_id) do nothing;
   delete from teaching_dictionary_spelling_family_link_removals where canonical_word_id=p_word and family_key=p_family;
 end if;
 return result;
end $$;
revoke all on function public.approve_teaching_dictionary_spelling_family_member(uuid,uuid,text,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.approve_teaching_dictionary_spelling_family_member(uuid,uuid,text,uuid,text,text,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
