begin;

alter table public.spelling_catalog_review_cases
  drop constraint if exists spelling_catalog_review_cases_status_check;

alter table public.spelling_catalog_review_cases
  add constraint spelling_catalog_review_cases_status_check
  check (
    case_status in (
      'open',
      'linked_existing_skill',
      'new_skill_needed',
      'word_level_only',
      'not_a_learning_issue',
      'closed_duplicate',
      'superseded'
    )
  );

create table if not exists public.spelling_catalog_review_case_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.spelling_catalog_review_cases(id) on delete cascade,
  admin_user_id uuid not null,
  admin_email text,
  decision_type text not null,
  previous_status text not null,
  new_status text not null,
  decision_note text,
  linked_micro_skill_key text references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  canonical_mapping_id uuid,
  merge_target_case_id uuid references public.spelling_catalog_review_cases(id) on delete set null,
  superseded_by_case_id uuid references public.spelling_catalog_review_cases(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_catalog_review_case_decisions_type_check'
  ) then
    alter table public.spelling_catalog_review_case_decisions
      add constraint spelling_catalog_review_case_decisions_type_check
      check (
        decision_type in (
          'linked_existing_skill',
          'new_skill_needed',
          'word_level_only',
          'not_a_learning_issue'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_catalog_review_case_decisions_status_check'
  ) then
    alter table public.spelling_catalog_review_case_decisions
      add constraint spelling_catalog_review_case_decisions_status_check
      check (
        previous_status in (
          'open',
          'linked_existing_skill',
          'new_skill_needed',
          'word_level_only',
          'not_a_learning_issue',
          'closed_duplicate',
          'superseded'
        )
        and new_status in (
          'open',
          'linked_existing_skill',
          'new_skill_needed',
          'word_level_only',
          'not_a_learning_issue',
          'closed_duplicate',
          'superseded'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_catalog_review_case_decisions_linked_skill_check'
  ) then
    alter table public.spelling_catalog_review_case_decisions
      add constraint spelling_catalog_review_case_decisions_linked_skill_check
      check (
        (
          decision_type = 'linked_existing_skill'
          and linked_micro_skill_key is not null
        )
        or (
          decision_type <> 'linked_existing_skill'
          and linked_micro_skill_key is null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_catalog_review_case_decisions_4d1_no_canonical_check'
  ) then
    alter table public.spelling_catalog_review_case_decisions
      add constraint spelling_catalog_review_case_decisions_4d1_no_canonical_check
      check (canonical_mapping_id is null);
  end if;
end $$;

create index if not exists spelling_catalog_review_case_decisions_case_idx
  on public.spelling_catalog_review_case_decisions (case_id, created_at desc);

create index if not exists spelling_catalog_review_case_decisions_admin_idx
  on public.spelling_catalog_review_case_decisions (admin_user_id, created_at desc);

revoke all on public.spelling_catalog_review_case_decisions from anon;
revoke all on public.spelling_catalog_review_case_decisions from authenticated;

alter table public.spelling_catalog_review_case_decisions enable row level security;

create or replace function public.resolve_spelling_catalog_review_case_admin(
  p_case_id uuid,
  p_admin_user_id uuid,
  p_admin_email text,
  p_decision_type text,
  p_decision_note text default null,
  p_linked_micro_skill_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.spelling_catalog_review_cases%rowtype;
  v_linked_micro_skill public.micro_skill_catalog%rowtype;
  v_decision_id uuid;
  v_note text;
  v_metadata jsonb;
begin
  if p_decision_type not in (
    'linked_existing_skill',
    'new_skill_needed',
    'word_level_only',
    'not_a_learning_issue'
  ) then
    raise exception 'Unsupported catalog-review decision type.';
  end if;

  select *
  into v_case
  from public.spelling_catalog_review_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Catalog-review case not found.';
  end if;

  if v_case.case_status <> 'open' then
    raise exception 'Only open catalog-review cases can be resolved.';
  end if;

  if p_decision_type = 'linked_existing_skill' then
    if p_linked_micro_skill_key is null or btrim(p_linked_micro_skill_key) = '' then
      raise exception 'A linked existing skill decision requires a micro-skill key.';
    end if;

    select *
    into v_linked_micro_skill
    from public.micro_skill_catalog
    where micro_skill_key = btrim(p_linked_micro_skill_key)
      and mastery_domain_key = 'D4'
      and is_active = true
      and is_assignable = true;

    if not found then
      raise exception 'Linked existing skill must be an active assignable D4 micro-skill.';
    end if;
  elsif p_linked_micro_skill_key is not null and btrim(p_linked_micro_skill_key) <> '' then
    raise exception 'Only linked existing skill decisions may include a micro-skill key.';
  end if;

  v_note := nullif(btrim(coalesce(p_decision_note, '')), '');
  v_metadata := coalesce(p_metadata, '{}'::jsonb);

  update public.spelling_catalog_review_cases
  set
    case_status = p_decision_type,
    updated_at = timezone('utc', now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'latest_admin_decision', jsonb_build_object(
        'decision_type', p_decision_type,
        'decided_at', timezone('utc', now()),
        'admin_user_id', p_admin_user_id,
        'linked_micro_skill_key',
          case
            when p_decision_type = 'linked_existing_skill'
              then btrim(p_linked_micro_skill_key)
            else null
          end
      )
    )
  where id = p_case_id;

  insert into public.spelling_catalog_review_case_decisions (
    case_id,
    admin_user_id,
    admin_email,
    decision_type,
    previous_status,
    new_status,
    decision_note,
    linked_micro_skill_key,
    canonical_mapping_id,
    merge_target_case_id,
    superseded_by_case_id,
    metadata
  )
  values (
    p_case_id,
    p_admin_user_id,
    nullif(btrim(coalesce(p_admin_email, '')), ''),
    p_decision_type,
    v_case.case_status,
    p_decision_type,
    v_note,
    case
      when p_decision_type = 'linked_existing_skill'
        then btrim(p_linked_micro_skill_key)
      else null
    end,
    null,
    null,
    null,
    v_metadata
  )
  returning id into v_decision_id;

  return v_decision_id;
end;
$$;

revoke all on function public.resolve_spelling_catalog_review_case_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) from public;
revoke all on function public.resolve_spelling_catalog_review_case_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) from anon;
revoke all on function public.resolve_spelling_catalog_review_case_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) from authenticated;
grant execute on function public.resolve_spelling_catalog_review_case_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

commit;
