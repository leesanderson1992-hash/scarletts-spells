begin;
-- Five/six words belong to the whole lesson. Two families may share six as
-- three plus three or four plus two; older five-word snapshots remain valid.
do $migration$ declare original text; patched text;
begin
 select pg_get_functiondef('public.adle_latin_root_snapshot_valid_v3(jsonb)'::regprocedure) into original;
 patched:=replace(original,
   'jsonb_array_length(family->''words'') not in(2,3)',
   '(jsonb_array_length(family->''words'')<2 or jsonb_array_length(family->''words'')>n-2)');
 if patched=original then raise exception 'LATIN_ROOT_COMBINED_CAPACITY_PATCH_NOT_FOUND'; end if;
 execute patched;
end $migration$;
notify pgrst,'reload schema';
commit;
