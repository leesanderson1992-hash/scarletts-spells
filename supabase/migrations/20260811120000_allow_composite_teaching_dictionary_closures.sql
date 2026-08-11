-- Permit one immutable Teaching Dictionary closure to bind a precise mixture
-- of verified release-ledger rows and immutable pre-ledger projections.  The
-- closure still snapshots every consumed semantic value and source identity;
-- this does not add a mutable/global fallback or weaken the legacy cutoff.

begin;

do $migration$
declare
  v_signature constant text := 'public.publish_adle_teaching_dictionary_closure_v1(jsonb,text,jsonb,text,text)';
  v_definition text;
  v_old_classification text := $old$p_source_classification not in ('release_ledger', 'legacy_pre_release_ledger_projection')$old$;
  v_new_classification text := $new$p_source_classification not in ('release_ledger', 'legacy_pre_release_ledger_projection', 'composite_release_and_legacy_projection')$new$;
  v_legacy_guard text := $old$if p_source_classification = 'legacy_pre_release_ledger_projection' and (
      v_word_batch.release_id is not null or v_dictation_batch.release_id is not null
      or v_word_batch.created_at >= v_legacy_cutoff or v_dictation_batch.created_at >= v_legacy_cutoff
    ) then raise exception 'legacy closure is restricted to pre-ledger source batches: %', v_word->>'wordKey'; end if;$old$;
  v_composite_guard text := $new$if p_source_classification = 'legacy_pre_release_ledger_projection' and (
      v_word_batch.release_id is not null or v_dictation_batch.release_id is not null
      or v_word_batch.created_at >= v_legacy_cutoff or v_dictation_batch.created_at >= v_legacy_cutoff
    ) then raise exception 'legacy closure is restricted to pre-ledger source batches: %', v_word->>'wordKey'; end if;
    if p_source_classification = 'composite_release_and_legacy_projection' and not (
      (
        (v_word_batch.release_id is not null and v_word_batch.package_sha256 is not null and v_word_batch.verified_at is not null)
        or (v_word_batch.release_id is null and v_word_batch.created_at < v_legacy_cutoff)
      ) and (
        (v_dictation_batch.release_id is not null and v_dictation_batch.package_sha256 is not null and v_dictation_batch.verified_at is not null)
        or (v_dictation_batch.release_id is null and v_dictation_batch.created_at < v_legacy_cutoff)
      )
    ) then raise exception 'composite closure contains an ungoverned source batch: %', v_word->>'wordKey'; end if;$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null
     or position(v_old_classification in v_definition) = 0
     or position(v_legacy_guard in v_definition) = 0
     or position('composite closure contains an ungoverned source batch' in v_definition) > 0 then
    raise exception 'Teaching Dictionary closure publisher predecessor differs from the reviewed contract';
  end if;

  v_definition := replace(v_definition, v_old_classification, v_new_classification);
  v_definition := replace(v_definition, v_legacy_guard, v_composite_guard);

  if position(v_old_classification in v_definition) > 0
     or position(v_new_classification in v_definition) = 0
     or position(v_legacy_guard in v_definition) = 0
     or position('composite closure contains an ungoverned source batch' in v_definition) = 0 then
    raise exception 'Teaching Dictionary composite closure replacement was not exact';
  end if;

  execute v_definition;
end;
$migration$;

comment on function public.publish_adle_teaching_dictionary_closure_v1(jsonb,text,jsonb,text,text) is
  'Publishes an immutable semantic closure over exact canonical-word and dictation rows. Composite provenance validates each bound source as either verified release-ledger data or an immutable pre-ledger projection before the hard cutoff.';

commit;
