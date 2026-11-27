begin;
-- Lesson-only adoption uses the same checkpoint orchestration as Schwa. It does
-- not enrol a child in Review or change the Review rollout gate.
do $migration$ declare original text; patched text;
begin
 select pg_get_functiondef('public.adopt_adle_specialist_only_session_r6(uuid)'::regprocedure) into original;
 patched:=replace(original,
   '= ''weak_vowel_word_lab''',
   'in (''weak_vowel_word_lab'',''latin_root_word_lab'')');
 if patched=original then raise exception 'LATIN_ROOT_ADOPTION_PATCH_NOT_FOUND'; end if;
 execute patched;
end $migration$;
notify pgrst,'reload schema';
commit;
