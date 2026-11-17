begin;

-- Both compound groups share a closure containing whole and component words.
-- Take the route lock before either package can lock its dictionary rows.
-- Other lesson routes retain their existing locking and concurrency.
do $$
declare body text;
  marker text := E'begin\n';
  guarded text := E'begin\n  if p_route_id=''compound_word_lab'' then\n    perform pg_advisory_xact_lock(hashtextextended(''teaching-dictionary-compound-publication'',0));\n  end if;\n';
begin
  select pg_get_functiondef('public.launch_teaching_dictionary_governed_package_v1(text,text,uuid[],jsonb,text,uuid,text,text,uuid,jsonb)'::regprocedure) into body;
  if position('teaching-dictionary-compound-publication' in body)>0 then return; end if;
  if position(marker in body)=0 then raise exception 'TEACHING_COMPOUND_LAUNCH_BODY_CHANGED'; end if;
  execute overlay(body placing guarded from position(marker in body) for length(marker));
end $$;

do $$
declare body text;
  marker text := E'begin\n';
  guarded text := E'begin\n  if exists(select 1 from public.teaching_dictionary_lesson_launches where id=p_launch and route_id=''compound_word_lab'') then\n    perform pg_advisory_xact_lock(hashtextextended(''teaching-dictionary-compound-publication'',0));\n  end if;\n';
begin
  select pg_get_functiondef('public.rollback_teaching_dictionary_launch_v2(uuid,uuid,text)'::regprocedure) into body;
  if position('teaching-dictionary-compound-publication' in body)>0 then return; end if;
  if position(marker in body)=0 then raise exception 'TEACHING_COMPOUND_ROLLBACK_BODY_CHANGED'; end if;
  execute overlay(body placing guarded from position(marker in body) for length(marker));
end $$;

notify pgrst,'reload schema';
commit;
