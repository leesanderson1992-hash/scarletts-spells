begin;

-- Compound snapshots contain componentToWholeRelationship and components.
-- Their key ordering differs under the database locale and JavaScript's
-- canonical order. Use the existing C-collated snapshot hash at this boundary,
-- while retaining reads of the historical database hash. Do not change any
-- shared hash function, immutable row, or structural validation requirement.
do $$
declare body text;
  old_hash text := $old$public.adle_generic_snapshot_json_sha256_v1(
    p_snapshot #- '{provenance,sourceFingerprint}'
  ) <> p_snapshot#>>'{provenance,sourceFingerprint}'$old$;
  new_hash text := $new$(public.adle_generic_snapshot_json_sha256_v1(
    p_snapshot #- '{provenance,sourceFingerprint}'
  ) <> p_snapshot#>>'{provenance,sourceFingerprint}'
    and public.adle_snapshot_json_sha256_v1(p_snapshot #- '{provenance,sourceFingerprint}')
      <> p_snapshot#>>'{provenance,sourceFingerprint}')$new$;
begin
  select pg_get_functiondef('public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(jsonb)'::regprocedure) into body;
  if position(new_hash in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_hash,'')))/length(old_hash)<>1 then
    raise exception 'TEACHING_COMPOUND_SNAPSHOT_VALIDATOR_CHANGED';
  end if;
  execute replace(body,old_hash,new_hash);
end $$;

notify pgrst,'reload schema';
commit;
