begin;

-- Canonical lexical families are dictionary facts. They are separate from the
-- existing Base Word Lab families, which are scoped to D4_MOR lesson routes.
-- Nothing here activates or reassigns a microskill or learner item.
create table public.canonical_teaching_dictionary_lexical_base_families (
  family_key text not null,
  revision integer not null default 1 check (revision > 0),
  base_lemma text not null check (btrim(base_lemma) <> ''),
  base_part_of_speech text not null check (btrim(base_part_of_speech) <> ''),
  base_kind text not null check (base_kind in ('free_base','bound_root')),
  canonical_base_word_id uuid references public.canonical_teaching_dictionary_words(id) on delete restrict,
  base_meaning text not null check (btrim(base_meaning) <> ''),
  source_reference text not null check (btrim(source_reference) <> ''),
  review_status text not null default 'draft' check (review_status in ('draft','approved')),
  reviewed_by text,
  reviewed_at timestamptz,
  approval_reference text,
  semantic_fingerprint text,
  created_at timestamptz not null default now(),
  primary key (family_key,revision),
  check (family_key = regexp_replace(lower(base_lemma),'[^a-z0-9]+','_','g')
    || '_' || regexp_replace(lower(base_part_of_speech),'[^a-z0-9]+','_','g') || '_base_family'),
  check (review_status <> 'approved' or (
    reviewed_by is not null and btrim(reviewed_by) <> '' and reviewed_at is not null
    and approval_reference is not null and btrim(approval_reference) <> ''
    and semantic_fingerprint ~ '^[a-f0-9]{64}$'))
);

create table public.canonical_teaching_dictionary_lexical_base_family_members (
  family_key text not null,
  revision integer not null,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  word_part_of_speech text not null check (btrim(word_part_of_speech) <> ''),
  relationship_kind text not null check (relationship_kind in
    ('free_base','regular_inflection','irregular_inflection','derived','contraction','historical_relative')),
  canonical_morphology_id uuid not null references public.canonical_teaching_dictionary_word_morphology(id) on delete restrict,
  word_sum text not null check (btrim(word_sum) <> ''),
  morphology_parts jsonb not null check (jsonb_typeof(morphology_parts)='array' and jsonb_array_length(morphology_parts)>0),
  morphology_joins jsonb not null check (jsonb_typeof(morphology_joins)='array'),
  morphology_transformations jsonb not null default '[]'::jsonb check (jsonb_typeof(morphology_transformations)='array'),
  intended_meaning text not null check (btrim(intended_meaning) <> ''),
  source_reference text not null check (btrim(source_reference) <> ''),
  primary key (family_key,revision,canonical_word_id,word_part_of_speech),
  foreign key (family_key,revision)
    references public.canonical_teaching_dictionary_lexical_base_families(family_key,revision) on delete restrict
);
create index lexical_base_family_members_word_idx
  on public.canonical_teaching_dictionary_lexical_base_family_members(canonical_word_id);

create function public.prevent_approved_lexical_base_family_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='canonical_teaching_dictionary_lexical_base_families' then
    if old.review_status='approved' then raise exception 'Approved lexical family revisions are immutable'; end if;
  elsif exists (select 1 from public.canonical_teaching_dictionary_lexical_base_families f
      where f.family_key=old.family_key and f.revision=old.revision and f.review_status='approved') then
    raise exception 'Approved lexical family members are immutable';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger lexical_family_no_approved_mutation before update or delete
  on public.canonical_teaching_dictionary_lexical_base_families for each row
  execute function public.prevent_approved_lexical_base_family_mutation();
create trigger lexical_member_no_approved_mutation before update or delete
  on public.canonical_teaching_dictionary_lexical_base_family_members for each row
  execute function public.prevent_approved_lexical_base_family_mutation();
create function public.prevent_approved_lexical_base_member_insert()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists (select 1 from public.canonical_teaching_dictionary_lexical_base_families f
      where f.family_key=new.family_key and f.revision=new.revision and f.review_status='approved') then
    raise exception 'Approved lexical family members are immutable';
  end if;
  return new;
end;
$$;
create trigger lexical_member_no_approved_insert before insert
  on public.canonical_teaching_dictionary_lexical_base_family_members for each row
  execute function public.prevent_approved_lexical_base_member_insert();

create function public.approve_canonical_lexical_base_family(
  p_family_key text,p_revision integer,p_reviewer text,p_approval_reference text)
returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  n integer; invalid_count integer; projection jsonb; fingerprint text;
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
  select count(*),count(*) filter (where w.id is null or m.id is null
      or m.canonical_word_id<>member.canonical_word_id or m.row_status<>'active'
      or m.review_status<>'approved_for_first_exposure' or m.analysis_status<>'approved'
      or m.word_sum<>member.word_sum or m.morphology_parts<>member.morphology_parts
      or m.morphology_joins<>member.morphology_joins
      or m.morphology_transformations<>member.morphology_transformations
      or not exists (select 1 from jsonb_array_elements(member.morphology_parts) part
        where part->>'kind'='base' and part->>'sourceText'=f.base_lemma)
      or (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
          from jsonb_array_elements(member.morphology_parts) with ordinality part(value,ordinality))
          is distinct from w.display_word),
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
  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'familyKey',f.family_key,'revision',f.revision,'base',f.base_lemma,'pos',f.base_part_of_speech,
    'kind',f.base_kind,'baseWordId',f.canonical_base_word_id,'baseMeaning',f.base_meaning,
    'members',projection)::text,'UTF8'),'sha256'),'hex');
  update public.canonical_teaching_dictionary_lexical_base_families
    set review_status='approved',reviewed_by=p_reviewer,reviewed_at=now(),
      approval_reference=p_approval_reference,semantic_fingerprint=fingerprint
    where family_key=p_family_key and revision=p_revision;
  return fingerprint;
end;
$$;
revoke all on function public.approve_canonical_lexical_base_family(text,integer,text,text)
  from public,anon,authenticated;
grant execute on function public.approve_canonical_lexical_base_family(text,integer,text,text)
  to service_role;

alter table public.canonical_teaching_dictionary_lexical_base_families enable row level security;
alter table public.canonical_teaching_dictionary_lexical_base_family_members enable row level security;
revoke all on public.canonical_teaching_dictionary_lexical_base_families,
  public.canonical_teaching_dictionary_lexical_base_family_members from public,anon,authenticated;
grant select,insert,update on public.canonical_teaching_dictionary_lexical_base_families,
  public.canonical_teaching_dictionary_lexical_base_family_members to service_role;

notify pgrst,'reload schema';
commit;
