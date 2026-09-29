-- A canonical-word package must not borrow the Base Word family release role.
-- That role intentionally gained INSERT on two family tables in 20260809160000.
-- This dedicated role restores the canonical importer's strict table boundary
-- without weakening or disrupting the separate Base Word publisher.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'canonical_word_releaser') then
    create role canonical_word_releaser nologin noinherit bypassrls;
  elsif not exists (
    select 1 from pg_roles
    where rolname = 'canonical_word_releaser'
      and not rolcanlogin and not rolinherit and rolbypassrls
  ) then
    raise exception 'canonical_word_releaser exists with incompatible attributes';
  end if;
end
$$;

grant usage on schema public to canonical_word_releaser;
grant canonical_word_releaser to postgres;

-- Remove any pre-existing direct table grants before applying this exact
-- canonical-word package allowlist. The role has no generic content rights.
do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'revoke all privileges on table %I.%I from canonical_word_releaser',
      table_record.schemaname, table_record.tablename
    );
  end loop;
end
$$;

grant select, insert, update on table
  public.canonical_teaching_dictionary_import_batches,
  public.canonical_teaching_dictionary_sources,
  public.canonical_teaching_dictionary_words,
  public.canonical_teaching_dictionary_word_metadata,
  public.canonical_teaching_dictionary_word_morphology,
  public.canonical_teaching_dictionary_dictation_sentences
to canonical_word_releaser;

commit;
