-- The release role is non-login and has grants only on Teaching Dictionary
-- release tables. RLS bypass lets the guarded transactional importer use
-- those grants without granting write capability on protected tables.

do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'teaching_dictionary_releaser'
      and not rolcanlogin
      and not rolinherit
  ) then
    raise exception 'teaching_dictionary_releaser must exist as NOLOGIN NOINHERIT';
  end if;
end
$$;

alter role teaching_dictionary_releaser bypassrls;

do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'children',
    'learning_items',
    'learning_item_evidence',
    'assignment_items',
    'daily_assignments',
    'adle_learning_items',
    'adle_assignment_attempt_events',
    'adle_authentic_use_events',
    'adle_slippage_events',
    'adle_word_proficiency',
    'spelling_canonical_mappings',
    'spelling_canonical_mapping_events',
    'spelling_catalog_review_cases',
    'child_word_treasures',
    'child_word_treasure_events'
  ]
  loop
    if to_regclass('public.' || protected_table) is not null then
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on table public.%I from teaching_dictionary_releaser',
        protected_table
      );
    end if;
  end loop;
end
$$;
