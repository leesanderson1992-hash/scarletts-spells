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
      'add_canonical_mapping',
      'needs_new_micro_skill',
      'word_level_only',
      'not_a_learning_issue',
      'reject_no_canonical_update',
      'closed_duplicate',
      'superseded'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_catalog_review_case_decisions_canonical_mapping_fk'
  ) then
    alter table public.spelling_catalog_review_case_decisions
      add constraint spelling_catalog_review_case_decisions_canonical_mapping_fk
      foreign key (canonical_mapping_id)
      references public.spelling_canonical_mappings(id)
      on delete set null;
  end if;
end $$;

alter table public.spelling_catalog_review_case_decisions
  drop constraint if exists spelling_catalog_review_case_decisions_type_check;

alter table public.spelling_catalog_review_case_decisions
  add constraint spelling_catalog_review_case_decisions_type_check
  check (
    decision_type in (
      'linked_existing_skill',
      'new_skill_needed',
      'add_canonical_mapping',
      'needs_new_micro_skill',
      'word_level_only',
      'not_a_learning_issue',
      'reject_no_canonical_update'
    )
  );

alter table public.spelling_catalog_review_case_decisions
  drop constraint if exists spelling_catalog_review_case_decisions_status_check;

alter table public.spelling_catalog_review_case_decisions
  add constraint spelling_catalog_review_case_decisions_status_check
  check (
    previous_status in (
      'open',
      'linked_existing_skill',
      'new_skill_needed',
      'add_canonical_mapping',
      'needs_new_micro_skill',
      'word_level_only',
      'not_a_learning_issue',
      'reject_no_canonical_update',
      'closed_duplicate',
      'superseded'
    )
    and new_status in (
      'open',
      'linked_existing_skill',
      'new_skill_needed',
      'add_canonical_mapping',
      'needs_new_micro_skill',
      'word_level_only',
      'not_a_learning_issue',
      'reject_no_canonical_update',
      'closed_duplicate',
      'superseded'
    )
  );

alter table public.spelling_catalog_review_case_decisions
  drop constraint if exists spelling_catalog_review_case_decisions_linked_skill_check;

alter table public.spelling_catalog_review_case_decisions
  add constraint spelling_catalog_review_case_decisions_linked_skill_check
  check (
    (
      decision_type = 'linked_existing_skill'
      and linked_micro_skill_key is not null
      and canonical_mapping_id is null
    )
    or (
      decision_type = 'add_canonical_mapping'
      and linked_micro_skill_key is not null
    )
    or (
      decision_type not in ('linked_existing_skill', 'add_canonical_mapping')
      and linked_micro_skill_key is null
      and canonical_mapping_id is null
    )
  );

alter table public.spelling_catalog_review_case_decisions
  drop constraint if exists spelling_catalog_review_case_decisions_4d1_no_canonical_check;

drop function if exists public.resolve_spelling_catalog_review_case_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
);

create or replace function public.resolve_spelling_catalog_review_case_admin(
  p_case_id uuid,
  p_admin_user_id uuid,
  p_admin_email text,
  p_decision_type text,
  p_decision_note text default null,
  p_linked_micro_skill_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dialect_code text default 'en-GB',
  p_normalization_version text default 'spelling_normalize_v1'
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
  v_canonical_mapping_id uuid;
  v_decision_type text;
  v_note text;
  v_metadata jsonb;
begin
  if p_admin_user_id is null then
    raise exception 'Catalog-review decisions require an admin user id.';
  end if;

  v_decision_type := btrim(coalesce(p_decision_type, ''));

  if v_decision_type not in (
    'linked_existing_skill',
    'new_skill_needed',
    'add_canonical_mapping',
    'needs_new_micro_skill',
    'word_level_only',
    'not_a_learning_issue',
    'reject_no_canonical_update'
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

  if v_decision_type in ('linked_existing_skill', 'add_canonical_mapping') then
    if p_linked_micro_skill_key is null or btrim(p_linked_micro_skill_key) = '' then
      raise exception 'This catalog-review decision requires a micro-skill key.';
    end if;

    select *
    into v_linked_micro_skill
    from public.micro_skill_catalog
    where micro_skill_key = btrim(p_linked_micro_skill_key)
      and mastery_domain_key = 'D4'
      and is_active = true
      and is_assignable = true;

    if not found then
      raise exception 'Micro-skill must be an active assignable D4 micro-skill.';
    end if;
  elsif p_linked_micro_skill_key is not null and btrim(p_linked_micro_skill_key) <> '' then
    raise exception 'Only canonical mapping or legacy linked-skill decisions may include a micro-skill key.';
  end if;

  v_note := nullif(btrim(coalesce(p_decision_note, '')), '');
  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'resolver_visible',
    false
  );

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
    v_decision_type,
    v_case.case_status,
    v_decision_type,
    v_note,
    case
      when v_decision_type in ('linked_existing_skill', 'add_canonical_mapping')
        then btrim(p_linked_micro_skill_key)
      else null
    end,
    null,
    null,
    null,
    v_metadata || jsonb_build_object(
      'canonical_mapping_created',
      false
    )
  )
  returning id into v_decision_id;

  if v_decision_type = 'add_canonical_mapping' then
    v_canonical_mapping_id := public.create_spelling_canonical_mapping_admin(
      v_case.misspelling_normalized,
      v_case.correct_spelling_normalized,
      btrim(p_linked_micro_skill_key),
      p_admin_user_id,
      p_admin_email,
      p_case_id,
      v_decision_id,
      v_note,
      p_dialect_code,
      p_normalization_version,
      v_metadata || jsonb_build_object('action_source', 'admin_catalog_review_4e2'),
      v_metadata || jsonb_build_object('action_source', 'admin_catalog_review_4e2')
    );

    update public.spelling_catalog_review_case_decisions
    set
      canonical_mapping_id = v_canonical_mapping_id,
      metadata = metadata || jsonb_build_object(
        'canonical_mapping_created',
        true
      )
    where id = v_decision_id;
  end if;

  update public.spelling_catalog_review_cases
  set
    case_status = v_decision_type,
    updated_at = timezone('utc', now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'latest_admin_decision', jsonb_build_object(
        'decision_type', v_decision_type,
        'decided_at', timezone('utc', now()),
        'admin_user_id', p_admin_user_id,
        'linked_micro_skill_key',
          case
            when v_decision_type in ('linked_existing_skill', 'add_canonical_mapping')
              then btrim(p_linked_micro_skill_key)
            else null
          end,
        'canonical_mapping_id', v_canonical_mapping_id,
        'resolver_visible', false
      )
    )
  where id = p_case_id;

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
  jsonb,
  text,
  text
) from public;
revoke all on function public.resolve_spelling_catalog_review_case_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text
) from anon;
revoke all on function public.resolve_spelling_catalog_review_case_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text
) from authenticated;
grant execute on function public.resolve_spelling_catalog_review_case_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text
) to service_role;

commit;
