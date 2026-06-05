begin;

alter table public.spelling_canonical_mappings
  add column if not exists resolver_visibility_status text not null default 'hidden';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mappings_resolver_visibility_status_check'
  ) then
    alter table public.spelling_canonical_mappings
      add constraint spelling_canonical_mappings_resolver_visibility_status_check
      check (
        resolver_visibility_status in (
          'hidden',
          'visible',
          'disabled'
        )
      );
  end if;
end $$;

alter table public.spelling_canonical_mapping_events
  add column if not exists previous_resolver_visibility_status text,
  add column if not exists new_resolver_visibility_status text;

alter table public.spelling_canonical_mapping_events
  drop constraint if exists spelling_canonical_mapping_events_type_check;

alter table public.spelling_canonical_mapping_events
  add constraint spelling_canonical_mapping_events_type_check
  check (
    event_type in (
      'created',
      'disabled',
      'deprecated',
      'superseded',
      'metadata_updated',
      'resolver_visibility_enabled',
      'resolver_visibility_disabled'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mapping_events_resolver_visibility_status_check'
  ) then
    alter table public.spelling_canonical_mapping_events
      add constraint spelling_canonical_mapping_events_resolver_visibility_status_check
      check (
        (
          previous_resolver_visibility_status is null
          or previous_resolver_visibility_status in (
            'hidden',
            'visible',
            'disabled'
          )
        )
        and (
          new_resolver_visibility_status is null
          or new_resolver_visibility_status in (
            'hidden',
            'visible',
            'disabled'
          )
        )
      );
  end if;
end $$;

create index if not exists spelling_canonical_mappings_resolver_visible_exact_pair_idx
  on public.spelling_canonical_mappings (
    misspelling_normalized,
    correct_spelling_normalized,
    dialect_code,
    normalization_version
  )
  where mapping_status = 'active'
    and resolver_visibility_status = 'visible';

commit;
