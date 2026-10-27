-- Family-source authorisation is distinct from dictionary approval, reviewed
-- word/skill relationships, route content approval, and activation.
begin;
create table if not exists public.adle_base_word_lexical_family_authorizations (
  family_key text not null,
  revision integer not null,
  semantic_fingerprint text not null check (semantic_fingerprint ~ '^[a-f0-9]{64}$'),
  authorization_reference text not null check (btrim(authorization_reference) <> ''),
  authorized_by uuid not null,
  authorized_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid,
  withdrawal_reason text,
  primary key (family_key, revision),
  foreign key (family_key, revision)
    references public.canonical_teaching_dictionary_lexical_base_families(family_key, revision)
    on delete restrict,
  check ((withdrawn_at is null and withdrawn_by is null and withdrawal_reason is null)
    or (withdrawn_at is not null and withdrawn_by is not null
      and nullif(btrim(withdrawal_reason), '') is not null))
);

create or replace function public.validate_adle_base_word_lexical_family_authorization()
returns trigger language plpgsql security definer set search_path=public as $$
declare source public.canonical_teaching_dictionary_lexical_base_families%rowtype;
begin
  select * into source from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=new.family_key and revision=new.revision for share;
  if source.family_key is null or source.review_status <> 'approved'
    or source.base_kind <> 'free_base' or source.canonical_base_word_id is null
    or source.semantic_fingerprint is distinct from new.semantic_fingerprint
    or exists (select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
      where newer.family_key=new.family_key and newer.review_status='approved'
        and newer.revision>new.revision)
    or (select count(distinct canonical_word_id)
      from public.canonical_teaching_dictionary_lexical_base_family_members
      where family_key=new.family_key and revision=new.revision)<2
    or exists (select 1 from public.canonical_teaching_dictionary_lexical_base_family_members member,
        lateral jsonb_array_elements(member.morphology_transformations) transformation
      where member.family_key=new.family_key and member.revision=new.revision
        and coalesce(transformation->>'kind',transformation->>'type')
          in ('irregular_form','contraction'))
  then raise exception 'BASE_WORD_FAMILY_CANDIDATE_SOURCE_INVALID: %', new.family_key; end if;
  return new;
end;
$$;
drop trigger if exists validate_adle_base_word_lexical_family_authorization
  on public.adle_base_word_lexical_family_authorizations;
create trigger validate_adle_base_word_lexical_family_authorization
  before insert or update of family_key, revision, semantic_fingerprint
    on public.adle_base_word_lexical_family_authorizations
  for each row execute function public.validate_adle_base_word_lexical_family_authorization();
revoke all on public.adle_base_word_lexical_family_authorizations from public, anon, authenticated;
grant select, insert, update on public.adle_base_word_lexical_family_authorizations to service_role;
commit;
