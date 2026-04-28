begin;

create table if not exists public.word_families (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid,
  slug text not null,
  family_name text not null,
  category text not null,
  priority integer not null default 100,
  description text,
  teaching_note text,
  examples text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.word_families
  add column if not exists parent_user_id uuid,
  add column if not exists slug text,
  add column if not exists family_name text,
  add column if not exists category text,
  add column if not exists priority integer not null default 100,
  add column if not exists description text,
  add column if not exists teaching_note text,
  add column if not exists examples text[] not null default '{}',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.word_families
set priority = 100
where priority is null;

do $$
declare
  family_name_source text := 'slug';
  slug_source text := 'family_name';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'word_families' and column_name = 'label'
  ) then
    family_name_source := 'label';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'word_families' and column_name = 'name'
  ) then
    family_name_source := 'name';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'word_families' and column_name = 'title'
  ) then
    family_name_source := 'title';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'word_families' and column_name = 'display_name'
  ) then
    family_name_source := 'display_name';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'word_families' and column_name = 'family_slug'
  ) then
    slug_source := 'family_slug';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'word_families' and column_name = 'code'
  ) then
    slug_source := 'code';
  end if;

  execute format(
    'update public.word_families
     set family_name = coalesce(family_name, nullif(%1$I, ''''), nullif(slug, ''''))
     where family_name is null',
    family_name_source
  );

  execute format(
    'update public.word_families
     set slug = coalesce(slug, nullif(%1$I, ''''), lower(regexp_replace(coalesce(family_name, ''word_family''), ''[^a-zA-Z0-9]+'', ''_'', ''g'')))
     where slug is null',
    slug_source
  );
end $$;

update public.word_families
set category = case
  when category in ('pattern_rule', 'morphology', 'irregular_tricky', 'phonic', 'homophone') then category
  when category = 'Pattern/rule' then 'pattern_rule'
  when category = 'Morphology' then 'morphology'
  when category = 'Irregular/tricky memory word' then 'irregular_tricky'
  when category = 'Phonic' then 'phonic'
  when category = 'Homophone' then 'homophone'
  when slug in ('silent_e_words', 'double_letters', 'ck_pattern', 'ie_ei_patterns', 'soft_c', 'soft_g') then 'pattern_rule'
  when slug in ('drop_final_e_ing', 'change_y_to_i', 'double_consonant_suffix', 'no_double_consonant') then 'morphology'
  when slug in ('tricky_common_words', 'tricky-words') then 'irregular_tricky'
  when slug = 'schwa_unstressed_vowel' then 'phonic'
  when slug in (
    'homophones_year_2',
    'homophones_year_3_4',
    'homophone_there_their_theyre',
    'homophone_to_too_two',
    'homophone_weather_whether',
    'homophone_whose_whos'
  ) then 'homophone'
  else 'pattern_rule'
end
where category is null
   or category not in ('pattern_rule', 'morphology', 'irregular_tricky', 'phonic', 'homophone');

alter table public.word_families
  alter column category set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'word_families_category_check'
  ) then
    alter table public.word_families
      add constraint word_families_category_check
      check (category in ('pattern_rule', 'morphology', 'irregular_tricky', 'phonic', 'homophone'));
  end if;
end $$;

create unique index if not exists word_families_slug_key
  on public.word_families (slug);

create index if not exists word_families_parent_user_idx
  on public.word_families (parent_user_id);

create index if not exists word_families_category_idx
  on public.word_families (category);

commit;
