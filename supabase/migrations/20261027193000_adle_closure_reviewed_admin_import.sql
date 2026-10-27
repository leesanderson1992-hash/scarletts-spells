-- Approved admin imports are reviewed dictionary facts. Permit their exact
-- immutable word/dictation snapshots in a signed composite ADLE closure.
-- Require an applied batch, a named source reference, and an importing user.
begin;
do $bridge$
declare
  body text;
  old_word text := $old$(v_word_batch.release_id is null and v_word_batch.created_at < v_legacy_cutoff)$old$;
  new_word text := $new$((v_word_batch.release_id is null and v_word_batch.created_at < v_legacy_cutoff)
          or (v_word_batch.release_id is null and v_word_batch.import_mode = 'admin_import'
            and v_word_batch.imported_by is not null
            and nullif(btrim(v_word_batch.source_metadata->>'sourceReference'), '') is not null))$new$;
  old_dictation text := $old$(v_dictation_batch.release_id is null and v_dictation_batch.created_at < v_legacy_cutoff)$old$;
  new_dictation text := $new$((v_dictation_batch.release_id is null and v_dictation_batch.created_at < v_legacy_cutoff)
          or (v_dictation_batch.release_id is null and v_dictation_batch.import_mode = 'admin_import'
            and v_dictation_batch.imported_by is not null
            and nullif(btrim(v_dictation_batch.source_metadata->>'sourceReference'), '') is not null))$new$;
begin
  select pg_get_functiondef('public.publish_adle_teaching_dictionary_closure_v1(jsonb,text,jsonb,text,text)'::regprocedure)
    into body;
  if body is null or position(old_word in body) = 0 or position(old_dictation in body) = 0 then
    raise exception 'Composite closure publisher differs from the reviewed contract';
  end if;
  body := replace(body, old_word, new_word);
  body := replace(body, old_dictation, new_dictation);
  execute body;
end;
$bridge$;
commit;
