create extension if not exists pgcrypto with schema extensions;

create table public.children (
  id uuid primary key default extensions.gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  is_archived boolean not null default false
);

create table public.daily_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  assignment_date date not null,
  title text,
  status text not null default 'pending',
  target_words text[] not null default array[]::text[],
  review_words text[] not null default array[]::text[],
  assignment_generation_source text not null default 'legacy_word_progress',
  lesson_route_metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (child_id, assignment_date, title)
);

create table public.assignment_items (
  id uuid primary key default extensions.gen_random_uuid(),
  daily_assignment_id uuid references public.daily_assignments(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  domain_module text not null,
  item_type text not null,
  source_type text not null,
  source_entity_id text not null,
  learning_item_id uuid,
  template_key text,
  target_word text,
  position integer not null,
  status text not null,
  prompt_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table public.adle_learning_items (
  id uuid primary key default extensions.gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null,
  micro_skill_key text not null,
  item_status text not null,
  source_kind text not null,
  source_ref text not null,
  source_attempt_text text,
  reteach_priority boolean not null default false,
  ejected_on date,
  intake_on date not null,
  row_status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index adle_learning_items_active_child_word_skill_idx
  on public.adle_learning_items(child_id, canonical_word_id, micro_skill_key)
  where row_status = 'active';

alter table public.daily_assignments enable row level security;
create policy daily_assignments_parent_select
  on public.daily_assignments for select to authenticated
  using (parent_user_id = auth.uid());
grant select on public.daily_assignments to authenticated;

create or replace function public.adle_lesson_route_metadata_is_valid_v1(
  p_metadata jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_metadata) <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata)) <> 4
    or jsonb_typeof(p_metadata->'metadataSchemaVersion') <> 'number'
    or (p_metadata->>'metadataSchemaVersion') !~ '^[0-9]+$'
    or (p_metadata->>'metadataSchemaVersion')::integer <> 1
    or jsonb_typeof(p_metadata->'route') <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata->'route')) <> 2
    or nullif(btrim(p_metadata#>>'{route,routeId}'), '') is null
    or nullif(btrim(p_metadata#>>'{route,routeVersion}'), '') is null
    or jsonb_typeof(p_metadata->'recipe') <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata->'recipe')) <> 2
    or nullif(btrim(p_metadata#>>'{recipe,recipeKey}'), '') is null
    or nullif(btrim(p_metadata#>>'{recipe,recipeVersion}'), '') is null
    or jsonb_typeof(p_metadata->'payload') <> 'object'
    or (select count(*) from jsonb_object_keys(p_metadata->'payload')) <> 2
    or nullif(btrim(p_metadata#>>'{payload,kind}'), '') is null
    or jsonb_typeof(p_metadata#>'{payload,version}') <> 'number'
    or (p_metadata#>>'{payload,version}') !~ '^[0-9]+$'
    or (p_metadata#>>'{payload,version}')::integer <= 0
  then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.adle_lesson_route_metadata_is_valid_v1(jsonb)
from public, anon, authenticated;
grant execute on function public.adle_lesson_route_metadata_is_valid_v1(jsonb)
to authenticated, service_role;

create or replace function public.adle_canonical_json_text_v1(p_value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_type text := jsonb_typeof(p_value);
  v_result text;
begin
  if v_type = 'object' then
    select '{' || coalesce(string_agg(
      to_jsonb(entry.key)::text || ':' || public.adle_canonical_json_text_v1(entry.value),
      ',' order by entry.key
    ), '') || '}' into v_result
    from jsonb_each(p_value) entry;
    return v_result;
  elsif v_type = 'array' then
    select '[' || coalesce(string_agg(
      public.adle_canonical_json_text_v1(entry.value),
      ',' order by entry.ordinality
    ), '') || ']' into v_result
    from jsonb_array_elements(p_value) with ordinality entry(value, ordinality);
    return v_result;
  end if;
  return p_value::text;
end;
$$;

create or replace function public.adle_canonical_json_sha256_v1(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      convert_to(public.adle_canonical_json_text_v1(p_value), 'utf8'),
      'sha256'
    ),
    'hex'
  )
$$;

revoke all on function public.adle_canonical_json_text_v1(jsonb)
from public, anon, authenticated;
revoke all on function public.adle_canonical_json_sha256_v1(jsonb)
from public, anon, authenticated;
grant execute on function public.adle_canonical_json_text_v1(jsonb) to service_role;
grant execute on function public.adle_canonical_json_sha256_v1(jsonb) to service_role;
