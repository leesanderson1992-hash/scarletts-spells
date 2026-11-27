begin;
-- Assignment facts stay frozen when a larger dictionary release is activated.
-- Finish follows the shared allow-existing / safety-revoked runtime policy.
do $migration$ declare original text; patched text; old_guard text;
begin
 select pg_get_functiondef('public.complete_adle_latin_root_lesson_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)'::regprocedure) into original;
 old_guard:=$guard$(not public.adle_release_activation_allows_child_v2(
      (h.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,p_child_id)
    or not public.adle_route_activation_revision_is_current_v2(
      (h.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,
      (h.lesson_route_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid,
      h.lesson_route_metadata#>>'{curriculumRelease,releaseManifestSha256}',
      h.lesson_route_metadata#>>'{curriculumRelease,dependencyFingerprint}'))$guard$;
 patched:=replace(original,old_guard,$guard$(public.adle_incomplete_assignment_runtime_policy_v2(
      (h.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid)
      is distinct from 'allow_existing')$guard$);
 if patched=original then raise exception 'LATIN_ROOT_EXISTING_FINISH_PATCH_NOT_FOUND'; end if;
 execute patched;
end $migration$;
notify pgrst,'reload schema';
commit;
