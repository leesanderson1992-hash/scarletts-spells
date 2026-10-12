-- Parent-created homophone lessons have no R6 orchestration row. Keep their
-- checkpoint CAS and ownership checks while using the frozen route snapshot.
begin;
create or replace function public.persist_adle_homophone_checkpoint_v2(
  p_daily_assignment_id uuid,p_child_id uuid,p_parent_user_id uuid,
  p_lesson_snapshot_fingerprint text,p_checkpoint_payload jsonb,p_expected_state_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare assignment public.daily_assignments%rowtype; checkpoint public.adle_specialist_stage_checkpoints%rowtype;
begin
  select * into assignment from public.daily_assignments
    where id=p_daily_assignment_id and child_id=p_child_id and parent_user_id=p_parent_user_id for share;
  if not found or assignment.status='completed'
    or not public.adle_homophone_snapshot_valid_v3(assignment.compiled_lesson_snapshot)
    or assignment.compiled_lesson_snapshot#>>'{provenance,sourceFingerprint}' is distinct from p_lesson_snapshot_fingerprint
    or jsonb_typeof(p_checkpoint_payload->'state') is distinct from 'object'
    or p_checkpoint_payload#>>'{state,completed}' is distinct from 'false'
    or p_expected_state_version<0
    or not public.adle_release_activation_allows_child_v2(
      (assignment.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,p_child_id)
    or not public.adle_route_activation_revision_is_current_v2(
      (assignment.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,
      (assignment.lesson_route_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid,
      assignment.lesson_route_metadata#>>'{curriculumRelease,releaseManifestSha256}',
      assignment.lesson_route_metadata#>>'{curriculumRelease,dependencyFingerprint}')
  then raise exception 'homophone checkpoint authority conflict'; end if;
  select * into checkpoint from public.adle_specialist_stage_checkpoints
    where daily_assignment_id=p_daily_assignment_id for update;
  if found then
    if checkpoint.state_version<>p_expected_state_version or checkpoint.adapter_key<>'homophone_v2'
      or checkpoint.checkpoint_schema_version<>'homophone_progress_v1'
      or checkpoint.lesson_snapshot_fingerprint<>p_lesson_snapshot_fingerprint or checkpoint.completed_at is not null
    then raise exception 'homophone checkpoint state conflict'; end if;
    update public.adle_specialist_stage_checkpoints set checkpoint_payload=p_checkpoint_payload,
      state_version=state_version+1,updated_at=timezone('utc',now()) where daily_assignment_id=p_daily_assignment_id;
    return jsonb_build_object('stateVersion',p_expected_state_version+1);
  end if;
  if p_expected_state_version<>0 then raise exception 'homophone checkpoint state conflict'; end if;
  insert into public.adle_specialist_stage_checkpoints(daily_assignment_id,child_id,parent_user_id,adapter_key,
    checkpoint_schema_version,lesson_snapshot_fingerprint,checkpoint_payload,state_version)
  values(p_daily_assignment_id,p_child_id,p_parent_user_id,'homophone_v2','homophone_progress_v1',
    p_lesson_snapshot_fingerprint,p_checkpoint_payload,1);
  return jsonb_build_object('stateVersion',1);
end $$;
revoke all on function public.persist_adle_homophone_checkpoint_v2(uuid,uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.persist_adle_homophone_checkpoint_v2(uuid,uuid,uuid,text,jsonb,integer) to service_role;
commit;
