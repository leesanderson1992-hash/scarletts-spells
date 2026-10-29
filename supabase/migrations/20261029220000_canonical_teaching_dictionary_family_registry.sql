begin;

-- Owner-reviewed consolidation of existing immutable family authorities.
-- Source families and their historical member IDs remain untouched.
create table public.canonical_teaching_dictionary_base_family_registry (
  id uuid primary key,
  family_key text not null unique check (btrim(family_key) <> ''),
  base_kind text not null check (base_kind in ('free_base','bound_root')),
  canonical_base_word_id uuid references public.canonical_teaching_dictionary_words(id) on delete restrict,
  base_lemma text not null check (btrim(base_lemma) <> ''),
  meaning_variants jsonb not null check (jsonb_typeof(meaning_variants)='array' and jsonb_array_length(meaning_variants)>0),
  decision_status text not null check (decision_status in ('owner_reviewed','owner_decision_interpreted')),
  decision_reference text not null check (btrim(decision_reference) <> ''),
  source_manifest_sha256 text not null check (source_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default timezone('utc',now()),
  check ((base_kind='bound_root' and canonical_base_word_id is null)
    or (base_kind='free_base' and canonical_base_word_id is not null))
);

create table public.canonical_teaching_dictionary_base_family_registry_aliases (
  source_type text not null check (source_type in ('legacy_base','lexical_free_base','lexical_root')),
  source_key text not null check (btrim(source_key) <> ''),
  canonical_family_id uuid not null references public.canonical_teaching_dictionary_base_family_registry(id) on delete restrict,
  source_id text not null check (btrim(source_id) <> ''),
  source_record_ids text[] not null check (cardinality(source_record_ids)>0),
  source_revision integer,
  primary key (source_type,source_key)
);
create index canonical_base_family_registry_alias_family_idx
  on public.canonical_teaching_dictionary_base_family_registry_aliases(canonical_family_id);

create table public.canonical_teaching_dictionary_base_family_registry_members (
  canonical_family_id uuid not null references public.canonical_teaching_dictionary_base_family_registry(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  source_family_keys text[] not null check (cardinality(source_family_keys)>0),
  source_member_roles text[] not null check (cardinality(source_member_roles)>0),
  source_assignment_eligibility text[] not null check (cardinality(source_assignment_eligibility)>0),
  source_record_ids text[] not null check (cardinality(source_record_ids)>0),
  primary key (canonical_family_id,canonical_word_id)
);
create index canonical_base_family_registry_members_word_idx
  on public.canonical_teaching_dictionary_base_family_registry_members(canonical_word_id);

alter table public.canonical_teaching_dictionary_base_family_registry enable row level security;
alter table public.canonical_teaching_dictionary_base_family_registry_aliases enable row level security;
alter table public.canonical_teaching_dictionary_base_family_registry_members enable row level security;
revoke all on public.canonical_teaching_dictionary_base_family_registry,
  public.canonical_teaching_dictionary_base_family_registry_aliases,
  public.canonical_teaching_dictionary_base_family_registry_members from public,anon,authenticated;
grant select,insert on public.canonical_teaching_dictionary_base_family_registry,
  public.canonical_teaching_dictionary_base_family_registry_aliases,
  public.canonical_teaching_dictionary_base_family_registry_members to service_role;

notify pgrst,'reload schema';
commit;
