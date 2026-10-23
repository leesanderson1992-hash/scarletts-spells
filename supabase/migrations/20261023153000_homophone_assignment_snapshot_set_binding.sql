begin;

create or replace function public.validate_homophone_assignment_contrast_set()
returns trigger language plpgsql set search_path = public as $$
declare v_set public.homophone_contrast_sets%rowtype;
  v_snapshot jsonb;
begin
  select * into v_set from public.homophone_contrast_sets s
    where s.set_key = new.set_key and s.revision = new.revision
      and s.review_status = 'approved'
      and s.semantic_fingerprint = new.semantic_fingerprint;
  if not found then
    raise exception 'Assignment contrast set requires its exact approved revision';
  end if;
  select a.compiled_lesson_snapshot into v_snapshot
    from public.daily_assignments a where a.id = new.assignment_id for update;
  if not found or v_snapshot->'route'->>'routeId' is distinct from 'homophone_contextual_choice'
    or v_snapshot->'route'->>'routeVersion' is distinct from 'v1'
    or v_snapshot->>'microSkillKey' is distinct from v_set.micro_skill_key
    or not exists (
      select 1 from jsonb_array_elements(v_snapshot->'selectedSets') with ordinality as selected(item, ordinal)
      where selected.ordinal = new.selected_ordinal
        and selected.item->>'setKey' = new.set_key
        and (selected.item->>'revision')::integer = new.revision
        and selected.item->>'semanticFingerprint' = new.semantic_fingerprint
    ) then
    raise exception 'Assignment contrast set differs from its frozen contextual-choice snapshot';
  end if;
  return new;
end;
$$;

commit;
