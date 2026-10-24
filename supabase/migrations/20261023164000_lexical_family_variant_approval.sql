begin;

-- A reviewed source spelling may join an existing root/free-base family only
-- for the named word. This prevents a family redirect from licensing an
-- unrelated word with the same letters.
create table public.canonical_teaching_dictionary_lexical_base_variants (
  family_key text not null,
  revision integer not null,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  source_base_text text not null check (btrim(source_base_text) <> ''),
  relation_kind text not null check (relation_kind in ('historical_variant','rebase_to_free_word')),
  source_reference text not null check (btrim(source_reference) <> ''),
  approval_reference text not null check (btrim(approval_reference) <> ''),
  reviewed_by text not null check (btrim(reviewed_by) <> ''),
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (family_key,revision,canonical_word_id,source_base_text),
  foreign key (family_key,revision) references public.canonical_teaching_dictionary_lexical_base_families(family_key,revision) on delete restrict
);

create function public.prevent_approved_lexical_base_variant_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'Approved lexical family variants are immutable';
  end if;
  if exists (select 1 from public.canonical_teaching_dictionary_lexical_base_families f
      where f.family_key=new.family_key and f.revision=new.revision and f.review_status='approved') then
    raise exception 'Approved lexical family variants are immutable';
  end if;
  return new;
end $$;
create trigger lexical_variant_no_mutation before insert or update or delete
  on public.canonical_teaching_dictionary_lexical_base_variants for each row
  execute function public.prevent_approved_lexical_base_variant_mutation();

create or replace function public.approve_canonical_lexical_base_family(
  p_family_key text,p_revision integer,p_reviewer text,p_approval_reference text)
returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  n integer; invalid_count integer; projection jsonb; variants jsonb; fingerprint text;
begin
  if nullif(btrim(p_reviewer),'') is null or nullif(btrim(p_approval_reference),'') is null then
    raise exception 'Lexical family approval requires reviewer and reference'; end if;
  select * into f from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=p_family_key and revision=p_revision for update;
  if not found or f.review_status<>'draft' then raise exception 'Only a draft lexical family can be approved'; end if;
  if f.base_kind='free_base' and not exists (select 1 from public.canonical_teaching_dictionary_words w
      where w.id=f.canonical_base_word_id and w.normalised_word=f.base_lemma
        and w.dialect_code='en-GB' and w.row_status='active'
        and w.review_status='approved_for_first_exposure') then
    raise exception 'Free base requires its approved en-GB canonical word'; end if;

  if exists (select 1 from public.canonical_teaching_dictionary_lexical_base_variants v
      where v.family_key=p_family_key and v.revision=p_revision
        and not exists (select 1 from public.canonical_teaching_dictionary_lexical_base_family_members member
          where member.family_key=v.family_key and member.revision=v.revision
            and member.canonical_word_id=v.canonical_word_id
            and exists (select 1 from jsonb_array_elements(member.morphology_parts) part
              where part->>'kind'='base' and lower(part->>'sourceText')=lower(v.source_base_text)))) then
    raise exception 'Lexical family variant requires exact member base evidence'; end if;

  select count(*),count(*) filter (where w.id is null or m.id is null
      or m.canonical_word_id<>member.canonical_word_id or m.row_status<>'active'
      or m.review_status<>'approved_for_first_exposure' or m.analysis_status<>'approved'
      or m.word_sum<>member.word_sum or m.morphology_parts<>member.morphology_parts
      or m.morphology_joins<>member.morphology_joins
      or m.morphology_transformations<>member.morphology_transformations
      or not exists (select 1 from jsonb_array_elements(member.morphology_parts) part
        where part->>'kind'='base' and (lower(part->>'sourceText')=lower(f.base_lemma)
          or exists (select 1 from public.canonical_teaching_dictionary_lexical_base_variants v
            where v.family_key=member.family_key and v.revision=member.revision
              and v.canonical_word_id=member.canonical_word_id
              and lower(v.source_base_text)=lower(part->>'sourceText'))))
      or regexp_replace(lower(coalesce((select string_agg(part.value->>'surfaceText','' order by part.ordinality)
          from jsonb_array_elements(member.morphology_parts) with ordinality part(value,ordinality)),'')),
          '[[:space:]-]','','g')
          is distinct from regexp_replace(lower(w.display_word),'[[:space:]-]','','g')),
    jsonb_agg(jsonb_build_object('wordId',member.canonical_word_id,'pos',member.word_part_of_speech,
      'kind',member.relationship_kind,'morphologyId',member.canonical_morphology_id,
      'wordSum',member.word_sum,'parts',member.morphology_parts,'joins',member.morphology_joins,
      'transformations',member.morphology_transformations,'meaning',member.intended_meaning)
      order by member.canonical_word_id,member.word_part_of_speech)
    into n,invalid_count,projection
  from public.canonical_teaching_dictionary_lexical_base_family_members member
  left join public.canonical_teaching_dictionary_words w on w.id=member.canonical_word_id
    and w.dialect_code='en-GB' and w.row_status='active' and w.review_status='approved_for_first_exposure'
  left join public.canonical_teaching_dictionary_word_morphology m on m.id=member.canonical_morphology_id
  where member.family_key=p_family_key and member.revision=p_revision;
  if n=0 or invalid_count>0 then raise exception 'Lexical family members require exact approved canonical morphology'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('wordId',v.canonical_word_id,'sourceBase',v.source_base_text,
      'relation',v.relation_kind,'source',v.source_reference,'approval',v.approval_reference)
      order by v.canonical_word_id,v.source_base_text),'[]'::jsonb) into variants
  from public.canonical_teaching_dictionary_lexical_base_variants v
  where v.family_key=p_family_key and v.revision=p_revision;
  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'familyKey',f.family_key,'revision',f.revision,'base',f.base_lemma,'pos',f.base_part_of_speech,
    'kind',f.base_kind,'baseWordId',f.canonical_base_word_id,'baseMeaning',f.base_meaning,
    'members',projection,'variants',variants)::text,'UTF8'),'sha256'),'hex');
  update public.canonical_teaching_dictionary_lexical_base_families
    set review_status='approved',reviewed_by=p_reviewer,reviewed_at=now(),
      approval_reference=p_approval_reference,semantic_fingerprint=fingerprint
    where family_key=p_family_key and revision=p_revision;
  return fingerprint;
end $$;

alter table public.canonical_teaching_dictionary_lexical_base_variants enable row level security;
revoke all on public.canonical_teaching_dictionary_lexical_base_variants from public,anon,authenticated;
grant select,insert on public.canonical_teaching_dictionary_lexical_base_variants to service_role;

notify pgrst,'reload schema';
commit;
