-- CW-1: one generalized, inactive-by-default Compound Word structure authority.
-- Historical closed-compound v1 tables and rows remain untouched.

create table if not exists public.canonical_teaching_dictionary_compound_structures_v2 (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  schema_version integer not null default 2 check (schema_version = 2),
  child_friendly_meaning text not null,
  component_to_whole_relationship text not null,
  morphology_provenance jsonb not null,
  assignment_eligible boolean not null default false,
  transfer_eligible boolean not null default false,
  row_status text not null default 'draft',
  review_status text not null default 'draft',
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  source_category text not null,
  source_name text,
  source_url text,
  source_licence text,
  source_use_note text,
  confidence text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (import_batch_id, canonical_word_id, micro_skill_key),
  constraint ctd_compound_structure_v2_skill check (
    micro_skill_key = any (array[
      'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',
      'D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED'
    ])
  ),
  constraint ctd_compound_structure_v2_content check (
    btrim(child_friendly_meaning) <> ''
    and btrim(component_to_whole_relationship) <> ''
    and jsonb_typeof(morphology_provenance) = 'object'
    and morphology_provenance <> '{}'::jsonb
    and btrim(source_sheet) <> ''
    and source_row_number > 0
    and btrim(source_row_hash) <> ''
    and btrim(source_category) <> ''
    and btrim(confidence) <> ''
  ),
  constraint ctd_compound_structure_v2_status check (
    row_status = any (array['draft','active','rejected','superseded'])
    and review_status = any (array['draft','ai_draft','in_review','changes_requested','approved_for_guided_review','approved_for_first_exposure','rejected','superseded'])
  ),
  constraint ctd_compound_structure_v2_review check (
    review_status <> 'approved_for_first_exposure'
    or (btrim(coalesce(reviewed_by, '')) <> '' and reviewed_at is not null)
  )
);

create table if not exists public.canonical_teaching_dictionary_compound_components_v2 (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references public.canonical_teaching_dictionary_compound_structures_v2(id) on delete restrict,
  component_ordinal integer not null check (component_ordinal >= 1),
  canonical_component_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  display_surface text not null check (btrim(display_surface) <> ''),
  component_meaning text not null check (btrim(component_meaning) <> ''),
  component_sense text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (structure_id, component_ordinal),
  constraint ctd_compound_component_v2_sense check (
    component_sense is null or btrim(component_sense) <> ''
  )
);

create table if not exists public.canonical_teaching_dictionary_compound_joins_v2 (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references public.canonical_teaching_dictionary_compound_structures_v2(id) on delete restrict,
  join_ordinal integer not null check (join_ordinal >= 1),
  join_kind text not null check (join_kind = any (array['none','space','hyphen'])),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (structure_id, join_ordinal)
);

create unique index if not exists ctd_compound_structure_v2_one_active_word_skill
  on public.canonical_teaching_dictionary_compound_structures_v2(canonical_word_id, micro_skill_key)
  where row_status = 'active';
create index if not exists ctd_compound_structure_v2_readiness
  on public.canonical_teaching_dictionary_compound_structures_v2(micro_skill_key, row_status, review_status, assignment_eligible, transfer_eligible);
create index if not exists ctd_compound_component_v2_identity
  on public.canonical_teaching_dictionary_compound_components_v2(canonical_component_word_id);
create index if not exists ctd_compound_join_v2_structure
  on public.canonical_teaching_dictionary_compound_joins_v2(structure_id, join_ordinal);

create or replace function public.assert_canonical_compound_structure_v2(
  p_structure_id uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_whole_word text;
  v_whole_row_status text;
  v_whole_review_status text;
  v_component_count integer;
  v_join_count integer;
  v_reconstructed text := '';
  v_component record;
  v_join_kind text;
begin
  select word.display_word, word.row_status, word.review_status
  into v_whole_word, v_whole_row_status, v_whole_review_status
  from public.canonical_teaching_dictionary_compound_structures_v2 structure
  join public.canonical_teaching_dictionary_words word
    on word.id = structure.canonical_word_id
  where structure.id = p_structure_id;

  if not found then
    return;
  end if;
  if v_whole_row_status <> 'active' or v_whole_review_status <> 'approved_for_first_exposure' then
    raise exception 'Compound Word v2 whole identity must be active and approved for first exposure';
  end if;

  select count(*)::integer
  into v_component_count
  from public.canonical_teaching_dictionary_compound_components_v2
  where structure_id = p_structure_id;

  if v_component_count < 2 or exists (
    select 1
    from generate_series(1, v_component_count) expected(component_ordinal)
    left join public.canonical_teaching_dictionary_compound_components_v2 component
      on component.structure_id = p_structure_id
      and component.component_ordinal = expected.component_ordinal
    where component.id is null
  ) then
    raise exception 'Compound Word v2 requires at least two densely ordered components';
  end if;

  select count(*)::integer
  into v_join_count
  from public.canonical_teaching_dictionary_compound_joins_v2
  where structure_id = p_structure_id;

  if v_join_count <> v_component_count - 1 or exists (
    select 1
    from generate_series(1, v_component_count - 1) expected(join_ordinal)
    left join public.canonical_teaching_dictionary_compound_joins_v2 compound_join
      on compound_join.structure_id = p_structure_id
      and compound_join.join_ordinal = expected.join_ordinal
    where compound_join.id is null
  ) then
    raise exception 'Compound Word v2 joins must equal components minus one and be densely ordered';
  end if;

  for v_component in
    select component.component_ordinal,
      component.display_surface,
      component_word.display_word as canonical_component_surface,
      component_word.row_status as canonical_component_row_status,
      component_word.review_status as canonical_component_review_status
    from public.canonical_teaching_dictionary_compound_components_v2 component
    join public.canonical_teaching_dictionary_words component_word
      on component_word.id = component.canonical_component_word_id
    where component.structure_id = p_structure_id
    order by component.component_ordinal
  loop
    if v_component.canonical_component_row_status <> 'active'
      or v_component.canonical_component_review_status <> 'approved_for_first_exposure' then
      raise exception 'Compound Word v2 component identity at ordinal % must be active and approved for first exposure', v_component.component_ordinal;
    end if;
    if v_component.display_surface is distinct from v_component.canonical_component_surface then
      raise exception 'Compound Word v2 component surface disagrees with canonical component identity at ordinal %', v_component.component_ordinal;
    end if;
    if v_component.component_ordinal > 1 then
      select join_kind
      into strict v_join_kind
      from public.canonical_teaching_dictionary_compound_joins_v2
      where structure_id = p_structure_id
        and join_ordinal = v_component.component_ordinal - 1;
      v_reconstructed := v_reconstructed || case v_join_kind
        when 'space' then ' '
        when 'hyphen' then '-'
        else ''
      end;
    end if;
    v_reconstructed := v_reconstructed || v_component.display_surface;
  end loop;

  if v_reconstructed is distinct from v_whole_word then
    raise exception 'Compound Word v2 reconstruction % disagrees with governed whole word %', v_reconstructed, v_whole_word;
  end if;
end;
$function$;

create or replace function public.enforce_canonical_compound_structure_v2()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_structure_id uuid;
begin
  if tg_table_name = 'canonical_teaching_dictionary_compound_structures_v2' then
    v_structure_id := coalesce(new.id, old.id);
  else
    v_structure_id := coalesce(new.structure_id, old.structure_id);
  end if;
  perform public.assert_canonical_compound_structure_v2(v_structure_id);
  return null;
end;
$function$;

drop trigger if exists ctd_compound_structure_v2_integrity
  on public.canonical_teaching_dictionary_compound_structures_v2;
create constraint trigger ctd_compound_structure_v2_integrity
after insert or update on public.canonical_teaching_dictionary_compound_structures_v2
deferrable initially deferred
for each row execute function public.enforce_canonical_compound_structure_v2();

drop trigger if exists ctd_compound_component_v2_integrity
  on public.canonical_teaching_dictionary_compound_components_v2;
create constraint trigger ctd_compound_component_v2_integrity
after insert or update or delete on public.canonical_teaching_dictionary_compound_components_v2
deferrable initially deferred
for each row execute function public.enforce_canonical_compound_structure_v2();

drop trigger if exists ctd_compound_join_v2_integrity
  on public.canonical_teaching_dictionary_compound_joins_v2;
create constraint trigger ctd_compound_join_v2_integrity
after insert or update or delete on public.canonical_teaching_dictionary_compound_joins_v2
deferrable initially deferred
for each row execute function public.enforce_canonical_compound_structure_v2();

alter table public.canonical_teaching_dictionary_compound_structures_v2 enable row level security;
alter table public.canonical_teaching_dictionary_compound_components_v2 enable row level security;
alter table public.canonical_teaching_dictionary_compound_joins_v2 enable row level security;

revoke all on
  public.canonical_teaching_dictionary_compound_structures_v2,
  public.canonical_teaching_dictionary_compound_components_v2,
  public.canonical_teaching_dictionary_compound_joins_v2
from anon, authenticated;

grant select, insert, update, delete on
  public.canonical_teaching_dictionary_compound_structures_v2,
  public.canonical_teaching_dictionary_compound_components_v2,
  public.canonical_teaching_dictionary_compound_joins_v2
to service_role;

revoke all on function public.assert_canonical_compound_structure_v2(uuid) from public;
revoke all on function public.enforce_canonical_compound_structure_v2() from public;
grant execute on function public.assert_canonical_compound_structure_v2(uuid) to service_role;

comment on table public.canonical_teaching_dictionary_compound_structures_v2 is
  'CW-1 generalized Compound Word authority. Ordered component and join rows are structural truth; no route or activation is implied.';
comment on table public.canonical_teaching_dictionary_compound_components_v2 is
  'Ordered Compound Word components with required canonical Teaching Dictionary identities.';
comment on table public.canonical_teaching_dictionary_compound_joins_v2 is
  'Ordered governed separators between Compound Word components: none, space, or hyphen.';
