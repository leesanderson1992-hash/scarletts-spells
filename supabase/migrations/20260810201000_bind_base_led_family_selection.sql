-- Bind family-authority v2 to canonical intake, assignment persistence and
-- completion. Historical v1 authorities/assignments keep their exact legacy
-- interpretation; v2 uses learner evidence plus assignment-time slot roles.

begin;

do $migration$
declare
  v_signature constant text :=
    'public.adle_persist_canonical_intake(uuid,uuid,text,uuid,uuid,text,text,text,date,text,text,uuid,uuid,text,text)';
  v_definition text;
  v_old text := $old$and member->>'memberRole' = 'authentic_target'
            and (member->>'assignmentEligible')::boolean$old$;
  v_new text := $new$and (member->>'assignmentEligible')::boolean
            and (
              (family_authority.schema_version = 1
                and family_authority.semantic_projection->>'schemaVersion' = '1'
                and member->>'memberRole' = 'authentic_target')
              or
              (family_authority.schema_version = 2
                and family_authority.semantic_projection->>'schemaVersion' = '2'
                and family_authority.semantic_projection->>'skillClusterKey' = 'D4_MOR_BASE_WORDS'
                and member->>'structuralRole' in ('base','family_member')
                and member->'applicableMicroSkillKeys' ? p_micro_skill_key)
            )$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null
     or v_definition not like '%v_is_base_word boolean := public.adle_micro_skill_owns_base_word_lab_v2(p_micro_skill_key);%'
     or position(v_old in v_definition) = 0 then
    raise exception 'canonical-intake Base Word predecessor differs from the reviewed contract';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_definition := replace(v_definition,
    'Base Word candidate is not an exact release-bound authentic target',
    'Base Word candidate lacks an exact release-bound reviewed family relationship');
  if position(v_old in v_definition) > 0 or position(v_new in v_definition) = 0 then
    raise exception 'canonical-intake Base Word family-authority v2 replacement was not exact';
  end if;
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_signature constant text :=
    'public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)';
  v_definition text;
  v_old_skill text := $old$or v_micro_skill_key not in ('D4_MOR_BASE_WORDS_IDENTIFY_BASE','D4_MOR_BASE_WORDS_PRESERVE_BASE')$old$;
  v_new_skill text := $new$or not public.adle_micro_skill_owns_base_word_lab_v2(v_micro_skill_key)$new$;
  v_old_member text := $old$and ((slot->>'provenance'='authentic_target' and member->>'memberRole'='authentic_target')
              or (slot->>'provenance'='transfer' and member->>'memberRole' in ('base','transfer')))$old$;
  v_new_member text := $new$and (
              (authority.schema_version = 1 and (
                (slot->>'provenance'='authentic_target' and member->>'memberRole'='authentic_target')
                or (slot->>'provenance'='transfer' and member->>'memberRole' in ('base','transfer'))
              ))
              or
              (authority.schema_version = 2
                and authority.semantic_projection->>'schemaVersion' = '2'
                and authority.semantic_projection->>'skillClusterKey' = 'D4_MOR_BASE_WORDS'
                and member->>'structuralRole' in ('base','family_member')
                and member->'applicableMicroSkillKeys' ? v_micro_skill_key)
            )$new$;
  v_old_evidence text := $old$where (slot->>'provenance'='authentic_target' and (
      nullif(slot->>'learningItemId','') is null or not exists (
        select 1 from public.adle_learning_items item
        where item.id=(slot->>'learningItemId')::uuid and item.child_id=p_child_id
          and item.canonical_word_id=(slot->>'canonicalWordId')::uuid
          and item.micro_skill_key=v_micro_skill_key and item.row_status='active'
          and item.source_kind='verified_misspelling'
      )
    )) or (slot->>'provenance'='transfer' and nullif(slot->>'learningItemId','') is not null)$old$;
  v_new_evidence text := $new$where (
      exists (
        select 1 from public.adle_curriculum_release_dependencies dependency
        join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id
        where dependency.release_manifest_id=p_release_manifest_id
          and dependency.micro_skill_key=v_micro_skill_key
          and dependency.authority_type='family_membership'
          and authority.schema_version=2
      ) and (
        slot->>'assignmentRole' not in ('primary_authentic_target','queued_family_practice','generated_family_practice')
        or slot->>'learnerProvenance' not in ('verified_misspelling','generated_family_practice')
        or (slot->>'assignmentRole'='primary_authentic_target' and (
          slot->>'provenance'<>'authentic_target'
          or not exists (select 1 from jsonb_array_elements(p_payload->'authenticTargets') target
            where target->>'canonicalWordId'=slot->>'canonicalWordId'
              and target->>'learningItemId'=slot->>'learningItemId')
        ))
        or (slot->>'assignmentRole'<>'primary_authentic_target' and slot->>'provenance'<>'transfer')
        or (slot->>'assignmentRole' in ('primary_authentic_target','queued_family_practice') and (
          slot->>'learnerProvenance'<>'verified_misspelling'
          or nullif(slot->>'learningItemId','') is null
          or not exists (
            select 1 from public.adle_learning_items item
            where item.id=(slot->>'learningItemId')::uuid and item.child_id=p_child_id
              and item.canonical_word_id=(slot->>'canonicalWordId')::uuid
              and item.micro_skill_key=v_micro_skill_key and item.row_status='active'
              and item.item_status in ('pending','pending_reteach')
              and item.source_kind='verified_misspelling'
          )
        ))
        or (slot->>'assignmentRole'='generated_family_practice' and (
          slot->>'learnerProvenance'<>'generated_family_practice'
          or nullif(slot->>'learningItemId','') is not null
        ))
      )
    ) or (
      not exists (
        select 1 from public.adle_curriculum_release_dependencies dependency
        join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id
        where dependency.release_manifest_id=p_release_manifest_id
          and dependency.micro_skill_key=v_micro_skill_key
          and dependency.authority_type='family_membership'
          and authority.schema_version=2
      ) and (
        (slot->>'provenance'='authentic_target' and (
          nullif(slot->>'learningItemId','') is null or not exists (
            select 1 from public.adle_learning_items item
            where item.id=(slot->>'learningItemId')::uuid and item.child_id=p_child_id
              and item.canonical_word_id=(slot->>'canonicalWordId')::uuid
              and item.micro_skill_key=v_micro_skill_key and item.row_status='active'
              and item.source_kind='verified_misspelling'
          )
        )) or (slot->>'provenance'='transfer' and nullif(slot->>'learningItemId','') is not null)
      )
    )$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_old_skill in v_definition) = 0
     or position(v_old_member in v_definition) = 0
     or position(v_old_evidence in v_definition) = 0 then
    raise exception 'Base Word assignment writer predecessor differs from the reviewed contract';
  end if;
  v_definition := replace(v_definition, v_old_skill, v_new_skill);
  v_definition := replace(v_definition, v_old_member, v_new_member);
  v_definition := replace(v_definition, v_old_evidence, v_new_evidence);
  v_definition := replace(v_definition,
    'Base Word assignment authentic evidence provenance is invalid',
    'Base Word assignment learner evidence and slot-role provenance is invalid');
  if position(v_old_skill in v_definition) > 0 or position(v_old_member in v_definition) > 0
     or position(v_old_evidence in v_definition) > 0
     or position(v_new_skill in v_definition) = 0
     or position(v_new_member in v_definition) = 0
     or position(v_new_evidence in v_definition) = 0 then
    raise exception 'Base Word assignment writer family-authority v2 replacement was not exact';
  end if;
  execute v_definition;
end;
$migration$;

-- Preserve the historical RPC identity while broadening the learner-backed
-- schedule cardinality from exactly two primary positions to the exact 2..6
-- verified learning items named by the immutable assignment snapshot.
do $migration$
declare
  v_signature constant text :=
    'public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)';
  v_definition text;
  v_old_skill text := $old$if p_micro_skill_key not in ('D4_MOR_BASE_WORDS_PRESERVE_BASE', 'D4_MOR_BASE_WORDS_IDENTIFY_BASE') or nullif(btrim(p_source_ref),'') is null$old$;
  v_new_skill text := $new$if not public.adle_micro_skill_owns_base_word_lab_v2(p_micro_skill_key) or nullif(btrim(p_source_ref),'') is null$new$;
  v_old_counts text := $old$if jsonb_array_length(coalesce(p_lesson->'scheduleWords','[]'::jsonb)) <> 2 or jsonb_array_length(coalesce(p_lesson->'taughtEvents','[]'::jsonb)) <> 2 or jsonb_array_length(coalesce(p_lesson->'itemTransitions','[]'::jsonb)) <> 2 or jsonb_typeof(p_lesson->'bundle') <> 'object' then$old$;
  v_new_counts text := $new$if jsonb_array_length(coalesce(p_lesson->'scheduleWords','[]'::jsonb)) not between 2 and 6
    or jsonb_array_length(coalesce(p_lesson->'taughtEvents','[]'::jsonb)) <> jsonb_array_length(p_lesson->'scheduleWords')
    or jsonb_array_length(coalesce(p_lesson->'itemTransitions','[]'::jsonb)) <> jsonb_array_length(p_lesson->'scheduleWords')
    or jsonb_typeof(p_lesson->'bundle') <> 'object' then$new$;
  v_old_schedule_guard text := $old$metadata->>'provenance'='authentic_target' and metadata->>'canonicalWordId'=v_row->>'canonicalWordId'$old$;
  v_new_schedule_guard text := $new$nullif(metadata->>'learningItemId','') is not null and metadata->>'canonicalWordId'=v_row->>'canonicalWordId'$new$;
  v_old_transfer_guard text := $old$metadata->>'provenance'='transfer' and metadata->>'canonicalWordId'=v_row->>'canonicalWordId'$old$;
  v_new_transfer_guard text := $new$metadata->>'canonicalWordId'=v_row->>'canonicalWordId'
        and (metadata->>'assignmentRole'='generated_family_practice'
          or (metadata->>'assignmentRole' is null and metadata->>'provenance'='transfer'))$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_old_skill in v_definition) = 0
     or position(v_old_counts in v_definition) = 0
     or position(v_old_schedule_guard in v_definition) = 0
     or position(v_old_transfer_guard in v_definition) = 0 then
    raise exception 'Base Word completion v1 predecessor differs from the reviewed contract';
  end if;
  v_definition := replace(v_definition, v_old_skill, v_new_skill);
  v_definition := replace(v_definition, v_old_counts, v_new_counts);
  v_definition := replace(v_definition, v_old_schedule_guard, v_new_schedule_guard);
  v_definition := replace(v_definition, v_old_transfer_guard, v_new_transfer_guard);
  v_definition := replace(v_definition,
    'ADLE base-word pilot requires normal outcomes for exactly two authentic targets',
    'ADLE base-word pilot requires normal outcomes for each learner-backed assignment word');
  v_definition := replace(v_definition,
    'Transfer words cannot enter base-word pilot scheduling',
    'Generated Base Word family-practice words cannot enter learner review scheduling');
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_signature constant text :=
    'public.complete_adle_base_word_family_pilot_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)';
  v_definition text;
  v_old text := $old$if jsonb_typeof(p_lesson) <> 'object'
     or jsonb_array_length(coalesce(p_lesson->'scheduleWords', '[]'::jsonb)) <> 2
     or jsonb_typeof(p_lesson->'bundle') <> 'object' then$old$;
  v_new text := $new$if jsonb_typeof(p_lesson) <> 'object'
     or jsonb_array_length(coalesce(p_lesson->'scheduleWords', '[]'::jsonb)) not between 2 and 6
     or jsonb_typeof(p_lesson->'bundle') <> 'object' then$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_old in v_definition) = 0 then
    raise exception 'Base Word completion v2 predecessor differs from the reviewed contract';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_definition := replace(v_definition,
    'Base Word Lab shared-route completion requires exactly two authentic schedule words',
    'Base Word Lab shared-route completion requires 2..6 exact learner-backed schedule words');
  execute v_definition;
end;
$migration$;

comment on function public.complete_adle_base_word_family_pilot_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) is
  'Atomic Base Word completion. Learner-backed verified misspellings schedule exactly once; generated family practice remains transfer evidence only.';

commit;
