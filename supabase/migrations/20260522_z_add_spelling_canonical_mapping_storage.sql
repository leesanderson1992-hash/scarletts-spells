begin;

create table if not exists public.spelling_canonical_mappings (
  id uuid primary key default gen_random_uuid(),
  misspelling_normalized text not null,
  correct_spelling_normalized text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  mapping_status text not null default 'active',
  dialect_code text not null default 'en-GB',
  normalization_version text not null default 'spelling_normalize_v1',
  source_case_id uuid references public.spelling_catalog_review_cases(id) on delete set null,
  source_decision_id uuid references public.spelling_catalog_review_case_decisions(id) on delete set null,
  created_by_admin_user_id uuid not null,
  created_by_admin_email text,
  decision_note text,
  metadata jsonb not null default '{}'::jsonb,
  replacement_mapping_id uuid references public.spelling_canonical_mappings(id) on delete set null,
  deactivated_at timestamptz,
  deactivated_by_admin_user_id uuid,
  deactivated_by_admin_email text,
  deactivation_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mappings_status_check'
  ) then
    alter table public.spelling_canonical_mappings
      add constraint spelling_canonical_mappings_status_check
      check (
        mapping_status in (
          'active',
          'disabled',
          'deprecated',
          'superseded'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mappings_normalized_words_check'
  ) then
    alter table public.spelling_canonical_mappings
      add constraint spelling_canonical_mappings_normalized_words_check
      check (
        btrim(misspelling_normalized) <> ''
        and btrim(correct_spelling_normalized) <> ''
        and btrim(misspelling_normalized) <> btrim(correct_spelling_normalized)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mappings_normalization_version_check'
  ) then
    alter table public.spelling_canonical_mappings
      add constraint spelling_canonical_mappings_normalization_version_check
      check (btrim(normalization_version) <> '');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mappings_dialect_code_check'
  ) then
    alter table public.spelling_canonical_mappings
      add constraint spelling_canonical_mappings_dialect_code_check
      check (btrim(dialect_code) <> '');
  end if;
end $$;

create unique index if not exists spelling_canonical_mappings_active_exact_pair_idx
  on public.spelling_canonical_mappings (
    misspelling_normalized,
    correct_spelling_normalized,
    dialect_code
  )
  where mapping_status = 'active';

create index if not exists spelling_canonical_mappings_micro_skill_idx
  on public.spelling_canonical_mappings (micro_skill_key, mapping_status, created_at desc);

create index if not exists spelling_canonical_mappings_source_case_idx
  on public.spelling_canonical_mappings (source_case_id, created_at desc);

create table if not exists public.spelling_canonical_mapping_events (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references public.spelling_canonical_mappings(id) on delete cascade,
  event_type text not null,
  previous_status text,
  new_status text,
  previous_misspelling_normalized text,
  new_misspelling_normalized text,
  previous_correct_spelling_normalized text,
  new_correct_spelling_normalized text,
  previous_micro_skill_key text,
  new_micro_skill_key text,
  admin_user_id uuid not null,
  admin_email text,
  source_case_id uuid references public.spelling_catalog_review_cases(id) on delete set null,
  source_decision_id uuid references public.spelling_catalog_review_case_decisions(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mapping_events_type_check'
  ) then
    alter table public.spelling_canonical_mapping_events
      add constraint spelling_canonical_mapping_events_type_check
      check (
        event_type in (
          'created',
          'disabled',
          'deprecated',
          'superseded',
          'metadata_updated'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mapping_events_status_check'
  ) then
    alter table public.spelling_canonical_mapping_events
      add constraint spelling_canonical_mapping_events_status_check
      check (
        (
          previous_status is null
          or previous_status in (
            'active',
            'disabled',
            'deprecated',
            'superseded'
          )
        )
        and (
          new_status is null
          or new_status in (
            'active',
            'disabled',
            'deprecated',
            'superseded'
          )
        )
      );
  end if;
end $$;

create index if not exists spelling_canonical_mapping_events_mapping_idx
  on public.spelling_canonical_mapping_events (mapping_id, created_at desc);

create index if not exists spelling_canonical_mapping_events_source_case_idx
  on public.spelling_canonical_mapping_events (source_case_id, created_at desc);

create or replace function public.validate_spelling_canonical_mapping_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_micro_skill public.micro_skill_catalog%rowtype;
begin
  new.misspelling_normalized := btrim(new.misspelling_normalized);
  new.correct_spelling_normalized := btrim(new.correct_spelling_normalized);
  new.micro_skill_key := btrim(new.micro_skill_key);
  new.dialect_code := btrim(coalesce(new.dialect_code, 'en-GB'));
  new.normalization_version := btrim(coalesce(new.normalization_version, 'spelling_normalize_v1'));
  new.created_by_admin_email := nullif(btrim(coalesce(new.created_by_admin_email, '')), '');
  new.deactivated_by_admin_email := nullif(btrim(coalesce(new.deactivated_by_admin_email, '')), '');
  new.decision_note := nullif(btrim(coalesce(new.decision_note, '')), '');
  new.deactivation_note := nullif(btrim(coalesce(new.deactivation_note, '')), '');
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, timezone('utc', now()));
  end if;

  if new.mapping_status = 'active' then
    select *
    into v_micro_skill
    from public.micro_skill_catalog
    where micro_skill_key = new.micro_skill_key
      and mastery_domain_key = 'D4'
      and is_active = true
      and is_assignable = true;

    if not found then
      raise exception 'Active canonical mappings require an active assignable D4 micro-skill.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists spelling_canonical_mappings_validate_row
  on public.spelling_canonical_mappings;
create trigger spelling_canonical_mappings_validate_row
before insert or update on public.spelling_canonical_mappings
for each row execute function public.validate_spelling_canonical_mapping_row();

revoke all on public.spelling_canonical_mappings from anon;
revoke all on public.spelling_canonical_mappings from authenticated;
revoke all on public.spelling_canonical_mapping_events from anon;
revoke all on public.spelling_canonical_mapping_events from authenticated;

alter table public.spelling_canonical_mappings enable row level security;
alter table public.spelling_canonical_mapping_events enable row level security;

create or replace function public.create_spelling_canonical_mapping_admin(
  p_misspelling_normalized text,
  p_correct_spelling_normalized text,
  p_micro_skill_key text,
  p_admin_user_id uuid,
  p_admin_email text default null,
  p_source_case_id uuid default null,
  p_source_decision_id uuid default null,
  p_decision_note text default null,
  p_dialect_code text default 'en-GB',
  p_normalization_version text default 'spelling_normalize_v1',
  p_metadata jsonb default '{}'::jsonb,
  p_event_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mapping_id uuid;
  v_decision_case_id uuid;
  v_note text;
  v_metadata jsonb;
  v_event_metadata jsonb;
begin
  if p_admin_user_id is null then
    raise exception 'Canonical mapping writes require an admin user id.';
  end if;

  if p_source_case_id is not null and not exists (
    select 1
    from public.spelling_catalog_review_cases
    where id = p_source_case_id
  ) then
    raise exception 'Source catalog-review case not found.';
  end if;

  if p_source_decision_id is not null then
    select case_id
    into v_decision_case_id
    from public.spelling_catalog_review_case_decisions
    where id = p_source_decision_id;

    if not found then
      raise exception 'Source catalog-review decision not found.';
    end if;

    if p_source_case_id is not null and v_decision_case_id <> p_source_case_id then
      raise exception 'Source decision must belong to the source catalog-review case.';
    end if;
  end if;

  v_note := nullif(btrim(coalesce(p_decision_note, '')), '');
  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'action_source',
    coalesce(p_metadata->>'action_source', 'admin_canonical_mapping_4e1'),
    'resolver_visible',
    false
  );
  v_event_metadata := coalesce(p_event_metadata, '{}'::jsonb) || jsonb_build_object(
    'action_source',
    coalesce(p_event_metadata->>'action_source', 'admin_canonical_mapping_4e1'),
    'resolver_visible',
    false
  );

  insert into public.spelling_canonical_mappings (
    misspelling_normalized,
    correct_spelling_normalized,
    micro_skill_key,
    mapping_status,
    dialect_code,
    normalization_version,
    source_case_id,
    source_decision_id,
    created_by_admin_user_id,
    created_by_admin_email,
    decision_note,
    metadata
  )
  values (
    p_misspelling_normalized,
    p_correct_spelling_normalized,
    p_micro_skill_key,
    'active',
    p_dialect_code,
    p_normalization_version,
    p_source_case_id,
    p_source_decision_id,
    p_admin_user_id,
    nullif(btrim(coalesce(p_admin_email, '')), ''),
    v_note,
    v_metadata
  )
  returning id into v_mapping_id;

  insert into public.spelling_canonical_mapping_events (
    mapping_id,
    event_type,
    previous_status,
    new_status,
    previous_misspelling_normalized,
    new_misspelling_normalized,
    previous_correct_spelling_normalized,
    new_correct_spelling_normalized,
    previous_micro_skill_key,
    new_micro_skill_key,
    admin_user_id,
    admin_email,
    source_case_id,
    source_decision_id,
    note,
    metadata
  )
  values (
    v_mapping_id,
    'created',
    null,
    'active',
    null,
    btrim(p_misspelling_normalized),
    null,
    btrim(p_correct_spelling_normalized),
    null,
    btrim(p_micro_skill_key),
    p_admin_user_id,
    nullif(btrim(coalesce(p_admin_email, '')), ''),
    p_source_case_id,
    p_source_decision_id,
    v_note,
    v_event_metadata
  );

  return v_mapping_id;
end;
$$;

revoke all on function public.create_spelling_canonical_mapping_admin(
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb
) from public;
revoke all on function public.create_spelling_canonical_mapping_admin(
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb
) from anon;
revoke all on function public.create_spelling_canonical_mapping_admin(
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb
) from authenticated;
grant execute on function public.create_spelling_canonical_mapping_admin(
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb
) to service_role;

commit;
