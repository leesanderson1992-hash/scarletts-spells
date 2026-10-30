begin;

-- The owner confirmed all 86 provisional family mappings without exceptions
-- on 2026-10-30. Preserve their original source manifest and decision file
-- fingerprints while promoting only the exact previously interpreted set.
do $$
declare
  affected integer;
begin
  if (select count(*) from public.canonical_teaching_dictionary_base_family_registry
      where decision_status = 'owner_decision_interpreted'
        and source_manifest_sha256 = 'e186ebfaff78d3f101b5d13302dec4de8070666ef690962aae430dd9e4d1feeb'
        and decision_reference = 'Owner-edited family-match-candidates.csv; SHA-256 4d039288a7615dfe8157414325d4afe7360ce69965f47662a0524e1a272cd68b') <> 86
  then
    raise exception 'CANONICAL_FAMILY_CONFIRMATION_SOURCE_MISMATCH';
  end if;

  if (select count(*) from public.canonical_teaching_dictionary_base_family_registry
      where decision_status = 'owner_decision_interpreted') <> 86
  then
    raise exception 'CANONICAL_FAMILY_CONFIRMATION_SCOPE_CHANGED';
  end if;

  update public.canonical_teaching_dictionary_base_family_registry
  set decision_status = 'owner_reviewed',
      decision_reference = decision_reference || '; owner confirmed all 86 provisional mappings without exceptions in chat 2026-10-30'
  where decision_status = 'owner_decision_interpreted'
    and source_manifest_sha256 = 'e186ebfaff78d3f101b5d13302dec4de8070666ef690962aae430dd9e4d1feeb';
  get diagnostics affected = row_count;
  if affected <> 86 then
    raise exception 'CANONICAL_FAMILY_CONFIRMATION_COUNT_MISMATCH: %', affected;
  end if;
end $$;

commit;
