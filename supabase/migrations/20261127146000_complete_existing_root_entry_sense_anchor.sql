begin;
-- Complete a legacy anchor for the same reviewed entry; never rebind a family
-- to another word. Its approved definition still has to match exactly.
do $$
declare body text; old_guard text := 'or f.canonical_base_word_id is not null then';
begin
 select pg_get_functiondef('public.attach_reviewed_root_family_entry(text,integer,uuid,text,text,uuid,text)'::regprocedure) into body;
 if position(old_guard in body)=0 then raise exception 'ROOT_ANCHOR_GUARD_CHANGED'; end if;
 execute replace(body,old_guard,'or (f.canonical_base_word_id is not null and f.canonical_base_word_id<>p_word) then');
end;
$$;
notify pgrst,'reload schema';
commit;
