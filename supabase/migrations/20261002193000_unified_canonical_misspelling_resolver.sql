begin;

-- A stable admin identity keeps edits separate from immutable source evidence.
create table public.spelling_resolution_items (
  id uuid primary key default gen_random_uuid(),
  origin_misspelling text not null,
  origin_correction text not null,
  misspelling text not null,
  correction text not null,
  dialect_code text not null default 'en-GB',
  normalization_version text not null default 'spelling_normalize_v1',
  micro_skill_key text references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  mapping_id uuid references public.spelling_canonical_mappings(id) on delete set null,
  review_status text not null default 'pending' check (review_status in ('pending', 'confirmed', 'closed')),
  resolver_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (origin_misspelling, origin_correction, dialect_code),
  check (btrim(misspelling) <> '' and btrim(correction) <> '' and misspelling <> correction)
);

create table public.spelling_resolution_item_sources (
  item_id uuid not null references public.spelling_resolution_items(id) on delete cascade,
  source_type text not null check (source_type in ('seed', 'recommendation', 'catalog', 'candidate')),
  source_id uuid not null,
  primary key (source_type, source_id)
);
create index spelling_resolution_item_sources_item_idx on public.spelling_resolution_item_sources(item_id);
create index spelling_resolution_items_queue_idx on public.spelling_resolution_items(review_status, updated_at desc);
create index spelling_resolution_items_mapping_idx on public.spelling_resolution_items(mapping_id);

alter table public.spelling_resolution_items enable row level security;
alter table public.spelling_resolution_item_sources enable row level security;
revoke all on public.spelling_resolution_items, public.spelling_resolution_item_sources from anon, authenticated;
grant all on public.spelling_resolution_items, public.spelling_resolution_item_sources to service_role;

-- Source rows are registered when they arrive, including future uploads.
create function public.register_spelling_resolution_source() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_misspelling text;
  v_correction text;
  v_dialect text;
  v_skill text;
  v_item_id uuid;
  v_open boolean;
begin
  if tg_table_name = 'parent_verified_spelling_candidate_mappings' then
    if new.candidate_status not in ('parent_local_promoted', 'global_canonical_promoted') then
      return new;
    end if;
    v_type := 'candidate';
    v_misspelling := new.misspelling_normalized;
    v_correction := new.correct_spelling_normalized;
    v_dialect := 'en-GB';
    v_skill := new.micro_skill_key;
    v_open := true;
  elsif tg_table_name = 'spelling_seed_import_rows' then
    v_type := 'seed';
    v_misspelling := new.misspelling_normalized;
    v_correction := new.correct_spelling_normalized;
    v_dialect := new.dialect_code;
    v_skill := new.suggested_micro_skill_key;
    v_open := new.row_status not in ('rejected', 'duplicate', 'superseded');
  elsif tg_table_name = 'spelling_canonical_mapping_recommendations' then
    v_type := 'recommendation';
    v_misspelling := new.misspelling_normalized;
    v_correction := new.correct_spelling_normalized;
    v_dialect := 'en-GB';
    v_skill := new.micro_skill_key;
    v_open := new.recommendation_status in ('recommended', 'pending_admin_review', 'accepted');
  else
    v_type := 'catalog';
    v_misspelling := new.misspelling_normalized;
    v_correction := new.correct_spelling_normalized;
    v_dialect := 'en-GB';
    v_skill := coalesce(new.metadata->>'suggested_micro_skill_key', new.metadata->>'selected_micro_skill_key');
    v_open := new.case_status in ('open', 'needs_new_micro_skill', 'word_level_only');
  end if;

  -- Import data can suggest an unknown skill; keep it pending without one.
  if v_skill is not null and not exists (
    select 1 from public.micro_skill_catalog where micro_skill_key = v_skill
  ) then
    v_skill := null;
  end if;

  select id into v_item_id from public.spelling_resolution_items
  where misspelling = v_misspelling and correction = v_correction and dialect_code = v_dialect
    and review_status <> 'closed'
  order by (review_status = 'confirmed') desc, created_at, id limit 1;
  if v_item_id is null then
    insert into public.spelling_resolution_items (
      origin_misspelling, origin_correction, misspelling, correction, dialect_code, micro_skill_key
    ) values (v_misspelling, v_correction, v_misspelling, v_correction, v_dialect, v_skill)
    on conflict (origin_misspelling, origin_correction, dialect_code) do update
      set micro_skill_key = coalesce(public.spelling_resolution_items.micro_skill_key, excluded.micro_skill_key)
    returning id into v_item_id;
  elsif v_skill is not null then
    update public.spelling_resolution_items set micro_skill_key = coalesce(micro_skill_key, v_skill)
    where id = v_item_id;
  end if;

  insert into public.spelling_resolution_item_sources(item_id, source_type, source_id)
  values (v_item_id, v_type, new.id)
  on conflict (source_type, source_id) do nothing;

  if exists (select 1 from public.spelling_canonical_mappings where id =
      (select mapping_id from public.spelling_resolution_items where id = v_item_id)
      and mapping_status = 'active') then
    update public.spelling_resolution_items set review_status = 'confirmed' where id = v_item_id;
  elsif v_open then
    update public.spelling_resolution_items set review_status = 'pending' where id = v_item_id;
  elsif (select count(*) from public.spelling_resolution_item_sources where item_id = v_item_id) = 1 then
    update public.spelling_resolution_items set review_status = 'closed' where id = v_item_id;
  end if;
  return new;
end;
$$;

create trigger spelling_resolution_seed_source after insert on public.spelling_seed_import_rows
for each row execute function public.register_spelling_resolution_source();
create trigger spelling_resolution_recommendation_source after insert on public.spelling_canonical_mapping_recommendations
for each row execute function public.register_spelling_resolution_source();
create trigger spelling_resolution_catalog_source after insert on public.spelling_catalog_review_cases
for each row execute function public.register_spelling_resolution_source();
create trigger spelling_resolution_candidate_source after insert or update of candidate_status
on public.parent_verified_spelling_candidate_mappings for each row
execute function public.register_spelling_resolution_source();

-- Existing and newly created direct mappings also have a workspace row.
create function public.register_spelling_resolution_mapping() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_item_id uuid;
begin
  if new.metadata->>'resolution_item_id' is not null then
    v_item_id := (new.metadata->>'resolution_item_id')::uuid;
  else
    select id into v_item_id from public.spelling_resolution_items
    where misspelling = new.misspelling_normalized
      and correction = new.correct_spelling_normalized and dialect_code = new.dialect_code
      and review_status <> 'closed'
    order by created_at, id limit 1;
  end if;
  if v_item_id is null then
    insert into public.spelling_resolution_items (
      origin_misspelling, origin_correction, misspelling, correction, dialect_code,
      normalization_version, micro_skill_key, mapping_id, review_status, resolver_enabled
    ) values (
      new.misspelling_normalized, new.correct_spelling_normalized,
      new.misspelling_normalized, new.correct_spelling_normalized,
      new.dialect_code, new.normalization_version, new.micro_skill_key, new.id,
      case when new.mapping_status = 'active' then 'confirmed' else 'closed' end,
      new.mapping_status = 'active' and new.resolver_visibility_status = 'visible'
    ) on conflict (origin_misspelling, origin_correction, dialect_code) do update
      set mapping_id = coalesce(public.spelling_resolution_items.mapping_id, excluded.mapping_id),
          micro_skill_key = excluded.micro_skill_key,
          resolver_enabled = excluded.resolver_enabled,
          review_status = case when excluded.review_status = 'confirmed' then 'confirmed'
            else public.spelling_resolution_items.review_status end
    returning id into v_item_id;
  else
    update public.spelling_resolution_items set mapping_id = new.id,
      micro_skill_key = new.micro_skill_key,
      review_status = case when new.mapping_status = 'active' then 'confirmed' else review_status end,
      resolver_enabled = new.mapping_status = 'active' and new.resolver_visibility_status = 'visible'
    where id = v_item_id;
  end if;
  return new;
end;
$$;
create trigger spelling_resolution_mapping_source after insert on public.spelling_canonical_mappings
for each row execute function public.register_spelling_resolution_mapping();

create function public.sync_spelling_resolution_visibility() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.spelling_resolution_items set
    resolver_enabled = new.mapping_status = 'active' and new.resolver_visibility_status = 'visible',
    updated_at = timezone('utc', now())
  where mapping_id = new.id;
  return new;
end;
$$;
create trigger spelling_resolution_mapping_visibility after update of mapping_status, resolver_visibility_status
on public.spelling_canonical_mappings for each row
execute function public.sync_spelling_resolution_visibility();

-- Backfill direct mappings first, then merge intake evidence by exact pair.
insert into public.spelling_resolution_items (
  origin_misspelling, origin_correction, misspelling, correction, dialect_code,
  normalization_version, micro_skill_key, mapping_id, review_status
)
select distinct on (misspelling_normalized, correct_spelling_normalized, dialect_code)
  misspelling_normalized, correct_spelling_normalized, misspelling_normalized,
  correct_spelling_normalized, dialect_code, normalization_version, micro_skill_key, id,
  case when mapping_status = 'active' then 'confirmed' else 'closed' end
from public.spelling_canonical_mappings
order by misspelling_normalized, correct_spelling_normalized, dialect_code,
  (mapping_status = 'active') desc, updated_at desc, id
on conflict (origin_misspelling, origin_correction, dialect_code) do nothing;

insert into public.spelling_resolution_items (
  origin_misspelling, origin_correction, misspelling, correction, dialect_code, micro_skill_key
)
select distinct on (misspelling, correction, dialect)
  misspelling, correction, misspelling, correction, dialect,
  case when exists (select 1 from public.micro_skill_catalog where micro_skill_key = skill)
    then skill else null end
from (
  select misspelling_normalized misspelling, correct_spelling_normalized correction,
    dialect_code dialect, suggested_micro_skill_key skill, created_at
  from public.spelling_seed_import_rows
  union all
  select misspelling_normalized, correct_spelling_normalized, 'en-GB', micro_skill_key, created_at
  from public.spelling_canonical_mapping_recommendations
  union all
  select misspelling_normalized, correct_spelling_normalized, 'en-GB',
    metadata->>'suggested_micro_skill_key', created_at
  from public.spelling_catalog_review_cases
  union all
  select misspelling_normalized, correct_spelling_normalized, 'en-GB', micro_skill_key, created_at
  from public.parent_verified_spelling_candidate_mappings
  where candidate_status in ('parent_local_promoted', 'global_canonical_promoted')
) source
order by misspelling, correction, dialect, created_at
on conflict (origin_misspelling, origin_correction, dialect_code) do nothing;

insert into public.spelling_resolution_item_sources(item_id, source_type, source_id)
select item.id, 'seed', source.id from public.spelling_seed_import_rows source
join public.spelling_resolution_items item on item.origin_misspelling = source.misspelling_normalized
  and item.origin_correction = source.correct_spelling_normalized and item.dialect_code = source.dialect_code
union all
select item.id, 'recommendation', source.id from public.spelling_canonical_mapping_recommendations source
join public.spelling_resolution_items item on item.origin_misspelling = source.misspelling_normalized
  and item.origin_correction = source.correct_spelling_normalized and item.dialect_code = 'en-GB'
union all
select item.id, 'catalog', source.id from public.spelling_catalog_review_cases source
join public.spelling_resolution_items item on item.origin_misspelling = source.misspelling_normalized
  and item.origin_correction = source.correct_spelling_normalized and item.dialect_code = 'en-GB'
union all
select item.id, 'candidate', source.id from public.parent_verified_spelling_candidate_mappings source
join public.spelling_resolution_items item on item.origin_misspelling = source.misspelling_normalized
  and item.origin_correction = source.correct_spelling_normalized and item.dialect_code = 'en-GB'
where source.candidate_status in ('parent_local_promoted', 'global_canonical_promoted');

update public.spelling_resolution_items item set review_status = 'closed'
where mapping_id is null and not exists (
  select 1 from public.spelling_resolution_item_sources link
  where link.item_id = item.id and (
    (link.source_type = 'seed' and exists (select 1 from public.spelling_seed_import_rows s
      where s.id = link.source_id and s.row_status not in ('rejected', 'duplicate', 'superseded')))
    or (link.source_type = 'recommendation' and exists (select 1 from public.spelling_canonical_mapping_recommendations r
      where r.id = link.source_id and r.recommendation_status in ('recommended', 'pending_admin_review', 'accepted')))
    or (link.source_type = 'catalog' and exists (select 1 from public.spelling_catalog_review_cases c
      where c.id = link.source_id and c.case_status in ('open', 'needs_new_micro_skill', 'word_level_only')))
    or (link.source_type = 'candidate' and exists (select 1 from public.parent_verified_spelling_candidate_mappings p
      where p.id = link.source_id and p.candidate_status in ('parent_local_promoted', 'global_canonical_promoted')))
  )
);

update public.spelling_resolution_items item set resolver_enabled = true
from public.spelling_canonical_mappings mapping
where item.mapping_id = mapping.id and mapping.mapping_status = 'active'
  and mapping.resolver_visibility_status = 'visible';

create function public.save_spelling_resolution_draft_admin(
  p_item_id uuid, p_misspelling text, p_correction text, p_micro_skill_key text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_item public.spelling_resolution_items%rowtype;
begin
  select * into v_item from public.spelling_resolution_items where id = p_item_id for update;
  if not found or v_item.review_status <> 'pending' then
    raise exception 'Only pending spelling resolutions can be changed.';
  end if;
  if nullif(btrim(p_misspelling), '') is null or nullif(btrim(p_correction), '') is null
    or lower(btrim(p_misspelling)) = lower(btrim(p_correction)) then
    raise exception 'Enter two different spelling words.';
  end if;
  if p_micro_skill_key is not null and p_micro_skill_key <> '' and not exists (
    select 1 from public.micro_skill_catalog
    where micro_skill_key = p_micro_skill_key and mastery_domain_key = 'D4'
      and is_active and is_assignable
  ) then
    raise exception 'Select an active assignable D4 skill.';
  end if;
  if exists (select 1 from public.spelling_resolution_items other
    where other.id <> p_item_id and other.misspelling = lower(btrim(p_misspelling))
      and other.correction = lower(btrim(p_correction))
      and other.dialect_code = v_item.dialect_code and other.review_status <> 'closed') then
    raise exception 'Another resolution row already uses this pair.';
  end if;
  update public.spelling_resolution_items set
    misspelling = lower(btrim(p_misspelling)), correction = lower(btrim(p_correction)),
    micro_skill_key = nullif(p_micro_skill_key, ''), updated_at = timezone('utc', now())
  where id = p_item_id;
  return p_item_id;
end;
$$;

create function public.reopen_spelling_resolution_admin(
  p_item_id uuid, p_admin_user_id uuid, p_admin_email text, p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_item public.spelling_resolution_items%rowtype;
  v_mapping public.spelling_canonical_mappings%rowtype;
begin
  if p_admin_user_id is null or nullif(btrim(p_note), '') is null then
    raise exception 'Reopening requires an admin and a reason.';
  end if;
  select * into v_item from public.spelling_resolution_items where id = p_item_id for update;
  if not found or v_item.review_status <> 'confirmed' or v_item.mapping_id is null then
    raise exception 'Only confirmed mappings can be reopened.';
  end if;
  select * into v_mapping from public.spelling_canonical_mappings where id = v_item.mapping_id for update;
  if not found or v_mapping.mapping_status <> 'active' then
    raise exception 'The canonical mapping is no longer active.';
  end if;
  if v_mapping.resolver_visibility_status = 'visible' then
    perform public.set_spelling_canonical_mapping_resolver_visibility_admin(
      v_mapping.id, 'disabled', p_admin_user_id, p_admin_email, p_note,
      jsonb_build_object('action_source', 'unified_spelling_resolution_reopen')
    );
  end if;
  update public.spelling_canonical_mappings set
    mapping_status = 'disabled', resolver_visibility_status = 'disabled',
    deactivated_at = timezone('utc', now()), deactivated_by_admin_user_id = p_admin_user_id,
    deactivated_by_admin_email = p_admin_email, deactivation_note = p_note,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('resolution_item_id', v_item.id::text),
    updated_at = timezone('utc', now()) where id = v_mapping.id;
  insert into public.spelling_canonical_mapping_events (
    mapping_id, event_type, previous_status, new_status,
    previous_resolver_visibility_status, new_resolver_visibility_status,
    previous_misspelling_normalized, new_misspelling_normalized,
    previous_correct_spelling_normalized, new_correct_spelling_normalized,
    previous_micro_skill_key, new_micro_skill_key, admin_user_id, admin_email, note, metadata
  ) values (
    v_mapping.id, 'disabled', 'active', 'disabled',
    case when v_mapping.resolver_visibility_status = 'visible' then 'disabled'
      else v_mapping.resolver_visibility_status end, 'disabled',
    v_mapping.misspelling_normalized, v_mapping.misspelling_normalized,
    v_mapping.correct_spelling_normalized, v_mapping.correct_spelling_normalized,
    v_mapping.micro_skill_key, v_mapping.micro_skill_key,
    p_admin_user_id, p_admin_email, p_note,
    jsonb_build_object('action_source', 'unified_spelling_resolution_reopen')
  );
  update public.spelling_resolution_items set review_status = 'pending',
    updated_at = timezone('utc', now()) where id = p_item_id;
  return p_item_id;
end;
$$;

create function public.confirm_spelling_resolution_admin(
  p_item_id uuid, p_admin_user_id uuid, p_admin_email text, p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_item public.spelling_resolution_items%rowtype;
  v_mapping public.spelling_canonical_mappings%rowtype;
  v_mapping_id uuid;
  v_case_id uuid;
  v_decision_id uuid;
  v_seed_id uuid;
  v_recommendation_id uuid;
  v_eligible_count integer := 0;
  v_now timestamptz := timezone('utc', now());
  v_source record;
  v_create_new boolean;
  v_case_status text;
begin
  if p_admin_user_id is null or nullif(btrim(p_note), '') is null then
    raise exception 'Confirmation requires an admin and a reason.';
  end if;
  select * into v_item from public.spelling_resolution_items where id = p_item_id for update;
  if not found or v_item.review_status <> 'pending' then
    raise exception 'Only pending spelling resolutions can be confirmed.';
  end if;
  if v_item.micro_skill_key is null or not exists (
    select 1 from public.micro_skill_catalog where micro_skill_key = v_item.micro_skill_key
      and mastery_domain_key = 'D4' and is_active and is_assignable
  ) then
    raise exception 'Choose an active assignable D4 skill before confirmation.';
  end if;
  if exists (
    select 1 from public.spelling_resolution_items other
    where other.id <> v_item.id and other.misspelling = v_item.misspelling
      and other.correction = v_item.correction and other.dialect_code = v_item.dialect_code
      and other.review_status <> 'closed'
  ) then
    raise exception 'Another resolution row already uses this pair. Resolve that row first.';
  end if;
  if exists (
    select 1 from public.spelling_canonical_mappings mapping
    where mapping.id is distinct from v_item.mapping_id and mapping.mapping_status = 'active'
      and mapping.misspelling_normalized = v_item.misspelling
      and mapping.correct_spelling_normalized = v_item.correction
      and mapping.dialect_code = v_item.dialect_code
  ) then
    raise exception 'An active canonical mapping already exists for this pair.';
  end if;

  select count(*) into v_eligible_count from public.spelling_resolution_item_sources link
  where link.item_id = v_item.id and (
    (link.source_type = 'seed' and exists (
      select 1 from public.spelling_seed_import_rows seed where seed.id = link.source_id
        and seed.row_status not in ('rejected', 'duplicate', 'superseded', 'conflict_blocked')
        and seed.duplicate_of_seed_import_row_id is null
        and jsonb_array_length(seed.blocking_errors) = 0
        and jsonb_array_length(seed.canonical_conflict_ids) = 0
    )) or (link.source_type = 'recommendation' and exists (
      select 1 from public.spelling_canonical_mapping_recommendations recommendation
      where recommendation.id = link.source_id and recommendation.recommendation_status
        in ('recommended', 'pending_admin_review', 'accepted')
        and recommendation.duplicate_of_recommendation_id is null
        and recommendation.merge_target_recommendation_id is null
        and recommendation.superseded_by_recommendation_id is null
    )) or (link.source_type = 'catalog' and exists (
      select 1 from public.spelling_catalog_review_cases review_case
      where review_case.id = link.source_id and review_case.case_status
        in ('open', 'needs_new_micro_skill', 'word_level_only')
    )) or (link.source_type = 'candidate' and exists (
      select 1 from public.parent_verified_spelling_candidate_mappings candidate
      where candidate.id = link.source_id and candidate.candidate_status
        in ('parent_local_promoted', 'global_canonical_promoted')
    ))
  );
  if v_eligible_count = 0 and v_item.mapping_id is null then
    raise exception 'This row has no eligible source evidence for confirmation.';
  end if;

  select source_id into v_case_id from public.spelling_resolution_item_sources
  where item_id = v_item.id and source_type = 'catalog' limit 1;
  select source_id into v_seed_id from public.spelling_resolution_item_sources
  where item_id = v_item.id and source_type = 'seed' limit 1;
  select source_id into v_recommendation_id from public.spelling_resolution_item_sources
  where item_id = v_item.id and source_type = 'recommendation' limit 1;

  if v_item.mapping_id is not null then
    select * into v_mapping from public.spelling_canonical_mappings
    where id = v_item.mapping_id for update;
    if not found or v_mapping.mapping_status <> 'disabled' then
      raise exception 'Reopened canonical mapping is no longer disabled.';
    end if;
  end if;
  v_create_new := v_item.mapping_id is null or
    v_mapping.misspelling_normalized is distinct from v_item.misspelling or
    v_mapping.correct_spelling_normalized is distinct from v_item.correction or
    v_mapping.micro_skill_key is distinct from v_item.micro_skill_key;

  if v_create_new then
    v_mapping_id := public.create_spelling_canonical_mapping_admin(
      v_item.misspelling, v_item.correction, v_item.micro_skill_key,
      p_admin_user_id, p_admin_email, v_case_id, null, p_note,
      v_item.dialect_code, v_item.normalization_version,
      jsonb_build_object('action_source', 'unified_spelling_resolution',
        'resolution_item_id', v_item.id::text),
      jsonb_build_object('action_source', 'unified_spelling_resolution')
    );
    update public.spelling_canonical_mappings set
      source_seed_import_row_id = v_seed_id,
      source_recommendation_id = v_recommendation_id where id = v_mapping_id;
    if v_item.mapping_id is not null then
      update public.spelling_canonical_mappings set mapping_status = 'superseded',
        replacement_mapping_id = v_mapping_id, updated_at = v_now
      where id = v_item.mapping_id;
      insert into public.spelling_canonical_mapping_events (
        mapping_id, event_type, previous_status, new_status,
        previous_resolver_visibility_status, new_resolver_visibility_status,
        previous_misspelling_normalized, new_misspelling_normalized,
        previous_correct_spelling_normalized, new_correct_spelling_normalized,
        previous_micro_skill_key, new_micro_skill_key,
        admin_user_id, admin_email, note, metadata
      ) values (
        v_item.mapping_id, 'superseded', 'disabled', 'superseded',
        'disabled', 'disabled', v_mapping.misspelling_normalized, v_mapping.misspelling_normalized,
        v_mapping.correct_spelling_normalized, v_mapping.correct_spelling_normalized,
        v_mapping.micro_skill_key, v_mapping.micro_skill_key,
        p_admin_user_id, p_admin_email, p_note,
        jsonb_build_object('action_source', 'unified_spelling_resolution_reconfirm',
          'replacement_mapping_id', v_mapping_id)
      );
    end if;
  else
    v_mapping_id := v_mapping.id;
    update public.spelling_canonical_mappings set
      misspelling_normalized = v_item.misspelling,
      correct_spelling_normalized = v_item.correction,
      micro_skill_key = v_item.micro_skill_key,
      mapping_status = 'active', resolver_visibility_status = 'hidden',
      deactivated_at = null, deactivated_by_admin_user_id = null,
      deactivated_by_admin_email = null, deactivation_note = null,
      decision_note = p_note, updated_at = v_now
    where id = v_mapping_id;
    insert into public.spelling_canonical_mapping_events (
      mapping_id, event_type, previous_status, new_status,
      previous_resolver_visibility_status, new_resolver_visibility_status,
      previous_misspelling_normalized, new_misspelling_normalized,
      previous_correct_spelling_normalized, new_correct_spelling_normalized,
      previous_micro_skill_key, new_micro_skill_key,
      admin_user_id, admin_email, note, metadata
    ) values (
      v_mapping_id, 'metadata_updated', v_mapping.mapping_status, 'active',
      v_mapping.resolver_visibility_status, 'hidden',
      v_mapping.misspelling_normalized, v_item.misspelling,
      v_mapping.correct_spelling_normalized, v_item.correction,
      v_mapping.micro_skill_key, v_item.micro_skill_key,
      p_admin_user_id, p_admin_email, p_note,
      jsonb_build_object('action_source', 'unified_spelling_resolution_reconfirm')
    );
  end if;

  for v_source in select link.source_type, link.source_id
    from public.spelling_resolution_item_sources link where link.item_id = v_item.id
  loop
    if v_source.source_type = 'seed' then
      update public.spelling_seed_import_rows seed set
        row_status = 'adopted_hidden_canonical', canonical_mapping_id = v_mapping_id,
        reviewed_by_admin_user_id = p_admin_user_id, reviewed_by_admin_email = p_admin_email,
        reviewed_at = v_now, review_note = p_note, status_reason = p_note, updated_at = v_now
      where seed.id = v_source.source_id and seed.row_status not in ('rejected', 'duplicate', 'superseded', 'conflict_blocked')
        and seed.duplicate_of_seed_import_row_id is null
        and jsonb_array_length(seed.blocking_errors) = 0
        and jsonb_array_length(seed.canonical_conflict_ids) = 0;
      if found and not exists (select 1 from public.spelling_canonical_mapping_events
        where mapping_id = v_mapping_id and source_seed_import_row_id = v_source.source_id
          and event_type = 'seed_import_adopted') then
        insert into public.spelling_canonical_mapping_events (
          mapping_id, event_type, previous_status, new_status,
          previous_misspelling_normalized, new_misspelling_normalized,
          previous_correct_spelling_normalized, new_correct_spelling_normalized,
          previous_micro_skill_key, new_micro_skill_key,
          source_seed_import_row_id, admin_user_id, admin_email, note, metadata
        ) values (v_mapping_id, 'seed_import_adopted', 'active', 'active',
          v_item.misspelling, v_item.misspelling, v_item.correction, v_item.correction,
          v_item.micro_skill_key, v_item.micro_skill_key, v_source.source_id,
          p_admin_user_id, p_admin_email, p_note,
          jsonb_build_object('action_source', 'unified_spelling_resolution'));
      end if;
    elsif v_source.source_type = 'recommendation' then
      update public.spelling_canonical_mapping_recommendations recommendation set
        recommendation_status = 'accepted', canonical_mapping_id = v_mapping_id,
        reviewed_by_admin_user_id = p_admin_user_id, reviewed_by_admin_email = p_admin_email,
        reviewed_at = v_now, review_note = p_note, updated_at = v_now
      where recommendation.id = v_source.source_id and recommendation.recommendation_status
        in ('recommended', 'pending_admin_review', 'accepted')
        and recommendation.duplicate_of_recommendation_id is null
        and recommendation.merge_target_recommendation_id is null
        and recommendation.superseded_by_recommendation_id is null;
      if found and not exists (select 1 from public.spelling_canonical_mapping_events
        where mapping_id = v_mapping_id and source_recommendation_id = v_source.source_id
          and event_type = 'pcrm_adopted') then
        insert into public.spelling_canonical_mapping_events (
          mapping_id, event_type, previous_status, new_status,
          previous_misspelling_normalized, new_misspelling_normalized,
          previous_correct_spelling_normalized, new_correct_spelling_normalized,
          previous_micro_skill_key, new_micro_skill_key,
          source_recommendation_id, admin_user_id, admin_email, note, metadata
        ) values (v_mapping_id, 'pcrm_adopted', 'active', 'active',
          v_item.misspelling, v_item.misspelling, v_item.correction, v_item.correction,
          v_item.micro_skill_key, v_item.micro_skill_key, v_source.source_id,
          p_admin_user_id, p_admin_email, p_note,
          jsonb_build_object('action_source', 'unified_spelling_resolution'));
      end if;
    elsif v_source.source_type = 'catalog' then
      select case_status into v_case_status from public.spelling_catalog_review_cases
        where id = v_source.source_id for update;
      if v_case_status in ('open', 'needs_new_micro_skill', 'word_level_only') then
        insert into public.spelling_catalog_review_case_decisions (
          case_id, admin_user_id, admin_email, decision_type, previous_status, new_status,
          decision_note, linked_micro_skill_key, canonical_mapping_id, metadata
        ) values (
          v_source.source_id, p_admin_user_id, p_admin_email, 'add_canonical_mapping',
          v_case_status, 'add_canonical_mapping', p_note, v_item.micro_skill_key,
          v_mapping_id, jsonb_build_object('action_source', 'unified_spelling_resolution',
            'canonical_mapping_created', v_create_new)
        ) returning id into v_decision_id;
        update public.spelling_catalog_review_cases set
          case_status = 'add_canonical_mapping', updated_at = v_now,
          metadata = metadata || jsonb_build_object('latest_admin_decision', jsonb_build_object(
            'decision_type', 'add_canonical_mapping', 'linked_micro_skill_key', v_item.micro_skill_key,
            'canonical_mapping_id', v_mapping_id, 'decided_at', v_now))
        where id = v_source.source_id;
        update public.spelling_canonical_mappings set source_decision_id = coalesce(source_decision_id, v_decision_id)
          where id = v_mapping_id;
      end if;
    end if;
  end loop;
  update public.spelling_resolution_items set mapping_id = v_mapping_id,
    review_status = 'confirmed', resolver_enabled = false,
    updated_at = v_now where id = v_item.id;
  return v_mapping_id;
end;
$$;

create function public.delete_spelling_resolution_admin(
  p_item_id uuid, p_confirmation text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_item public.spelling_resolution_items%rowtype;
  v_batch_id uuid;
  v_mapping_id uuid;
begin
  select * into v_item from public.spelling_resolution_items where id = p_item_id for update;
  if not found then raise exception 'Spelling resolution row not found.'; end if;
  if p_confirmation is distinct from 'DELETE ' || v_item.misspelling then
    raise exception 'Type the exact deletion confirmation shown in the dialog.';
  end if;
  for v_mapping_id in select id from public.spelling_canonical_mappings
    where id = v_item.mapping_id or metadata->>'resolution_item_id' = v_item.id::text
    for update
  loop
    -- A source link may require a candidate or canonical mapping. Keep the
    -- child learning item, but remove a canonical-only source receipt.
    delete from public.adle_learning_item_sources
    where canonical_mapping_id = v_mapping_id and parent_verified_candidate_mapping_id is null;
    update public.adle_learning_item_sources set canonical_mapping_id = null
    where canonical_mapping_id = v_mapping_id;
    delete from public.spelling_canonical_mappings where id = v_mapping_id;
  end loop;
  for v_batch_id in select distinct seed.batch_id from public.spelling_seed_import_rows seed
    join public.spelling_resolution_item_sources link on link.source_type = 'seed'
      and link.source_id = seed.id where link.item_id = p_item_id
  loop
    delete from public.spelling_seed_import_rows where id in (
      select source_id from public.spelling_resolution_item_sources
      where item_id = p_item_id and source_type = 'seed'
    );
    update public.spelling_seed_import_batches batch set
      total_row_count = (select count(*) from public.spelling_seed_import_rows where batch_id = v_batch_id),
      candidate_review_row_count = (select count(*) from public.spelling_seed_import_rows
        where batch_id = v_batch_id and dry_run_bucket = 'safe_for_candidate_review'),
      manual_review_row_count = (select count(*) from public.spelling_seed_import_rows
        where batch_id = v_batch_id and dry_run_bucket = 'manual_review_required'),
      rejected_row_count = (select count(*) from public.spelling_seed_import_rows
        where batch_id = v_batch_id and dry_run_bucket = 'rejected_from_import'),
      duplicate_row_count = (select count(*) from public.spelling_seed_import_rows
        where batch_id = v_batch_id and row_status = 'duplicate'),
      conflict_row_count = (select count(*) from public.spelling_seed_import_rows
        where batch_id = v_batch_id and row_status = 'conflict_blocked'),
      updated_at = timezone('utc', now()) where batch.id = v_batch_id;
  end loop;
  delete from public.spelling_canonical_mapping_recommendations where id in (
    select source_id from public.spelling_resolution_item_sources
    where item_id = p_item_id and source_type = 'recommendation'
  );
  delete from public.spelling_catalog_review_cases where id in (
    select source_id from public.spelling_resolution_item_sources
    where item_id = p_item_id and source_type = 'catalog'
  );
  delete from public.spelling_resolution_items where id = p_item_id;
  return p_item_id;
end;
$$;

revoke all on function public.save_spelling_resolution_draft_admin(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.reopen_spelling_resolution_admin(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.confirm_spelling_resolution_admin(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.delete_spelling_resolution_admin(uuid,text) from public, anon, authenticated;
grant execute on function public.save_spelling_resolution_draft_admin(uuid,text,text,text) to service_role;
grant execute on function public.reopen_spelling_resolution_admin(uuid,uuid,text,text) to service_role;
grant execute on function public.confirm_spelling_resolution_admin(uuid,uuid,text,text) to service_role;
grant execute on function public.delete_spelling_resolution_admin(uuid,text) to service_role;

revoke all on function public.register_spelling_resolution_source() from public, anon, authenticated;
revoke all on function public.register_spelling_resolution_mapping() from public, anon, authenticated;
revoke all on function public.sync_spelling_resolution_visibility() from public, anon, authenticated;

commit;
