-- Tighten the original generic Teaching Dictionary release role for canonical
-- word batches. Existing applied migrations are preserved; this forward
-- migration removes access to every canonical table outside the package's
-- explicit write set.

do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'teaching_dictionary_releaser'
      and not rolcanlogin
      and not rolinherit
      and rolbypassrls
  ) then
    raise exception 'teaching_dictionary_releaser must be NOLOGIN NOINHERIT BYPASSRLS';
  end if;
end
$$;

do $$
declare
  table_record record;
  canonical_word_release_tables text[] := array[
    'canonical_teaching_dictionary_import_batches',
    'canonical_teaching_dictionary_sources',
    'canonical_teaching_dictionary_words',
    'canonical_teaching_dictionary_word_metadata',
    'canonical_teaching_dictionary_word_morphology',
    'canonical_teaching_dictionary_dictation_sentences'
  ];
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'canonical_teaching_dictionary_%'
  loop
    if table_record.tablename = any(canonical_word_release_tables) then
      execute format(
        'grant select, insert, update on table %I.%I to teaching_dictionary_releaser',
        table_record.schemaname,
        table_record.tablename
      );
    else
      execute format(
        'revoke all privileges on table %I.%I from teaching_dictionary_releaser',
        table_record.schemaname,
        table_record.tablename
      );
    end if;
  end loop;
end
$$;

-- The release role is intentionally not a future generic content-authoring
-- role. A later micro-skill-content package needs its own reviewed migration
-- and least-privilege role.
