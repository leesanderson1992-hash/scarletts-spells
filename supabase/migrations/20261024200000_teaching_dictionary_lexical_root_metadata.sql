begin;

-- Bound roots are lexical family anchors rather than standalone English
-- teaching words. Keep their reviewed pronunciation and provenance beside
-- the approved family revision so root-word lessons can use them later.
create table public.canonical_teaching_dictionary_lexical_root_metadata (
  family_key text not null,
  revision integer not null,
  root_text text not null check (btrim(root_text) <> ''),
  root_meaning text not null check (btrim(root_meaning) <> ''),
  root_definition text not null check (btrim(root_definition) <> ''),
  origin_language text not null check (btrim(origin_language) <> ''),
  pronunciation_ipa text not null check (btrim(pronunciation_ipa) <> ''),
  syllables_applicability text not null default 'not_applicable'
    check (syllables_applicability = 'not_applicable'),
  written_syllable_applicability text not null default 'not_applicable'
    check (written_syllable_applicability = 'not_applicable'),
  frequency_applicability text not null default 'not_applicable'
    check (frequency_applicability = 'not_applicable'),
  difficulty_applicability text not null default 'not_applicable'
    check (difficulty_applicability = 'not_applicable'),
  source_reference text not null check (btrim(source_reference) <> ''),
  approval_reference text not null check (btrim(approval_reference) <> ''),
  reviewed_by text not null check (btrim(reviewed_by) <> ''),
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (family_key,revision),
  foreign key (family_key,revision) references public.canonical_teaching_dictionary_lexical_base_families(family_key,revision)
    on delete restrict
);

create function public.prevent_lexical_root_metadata_mutation()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'Approved lexical root metadata is immutable';
end $$;
create trigger lexical_root_metadata_immutable before update or delete
  on public.canonical_teaching_dictionary_lexical_root_metadata for each row
  execute function public.prevent_lexical_root_metadata_mutation();

alter table public.canonical_teaching_dictionary_lexical_root_metadata enable row level security;
revoke all on public.canonical_teaching_dictionary_lexical_root_metadata from public,anon,authenticated;
grant select,insert on public.canonical_teaching_dictionary_lexical_root_metadata to service_role;

notify pgrst,'reload schema';
commit;
