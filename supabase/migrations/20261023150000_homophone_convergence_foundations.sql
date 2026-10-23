begin;

-- A contrast set is a reviewed, versioned meaning unit within one microskill.
-- Drafts are inert. Approved revisions remain immutable so old lesson snapshots replay.
create table public.homophone_contrast_sets (
  set_key text not null,
  revision integer not null default 1 check (revision > 0),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  dialect_code text not null default 'en-GB' check (dialect_code = 'en-GB'),
  relation_kind text not null check (relation_kind in
    ('homophone','near_homophone','confusable','morphological_contrast','contraction_real_word')),
  review_status text not null default 'draft' check (review_status in ('draft','approved')),
  source_reference text not null,
  approved_by text,
  approved_at timestamptz,
  approval_reference text,
  semantic_fingerprint text,
  created_at timestamptz not null default now(),
  primary key (set_key, revision),
  unique (set_key, revision, micro_skill_key),
  check (btrim(set_key) <> '' and btrim(source_reference) <> ''),
  check (review_status <> 'approved' or
    (nullif(btrim(approved_by), '') is not null and approved_at is not null
     and nullif(btrim(approval_reference), '') is not null
     and semantic_fingerprint ~ '^[a-f0-9]{64}$'))
);

create table public.homophone_contrast_set_members (
  set_key text not null,
  revision integer not null,
  member_ordinal smallint not null check (member_ordinal between 1 and 3),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  intended_sense text not null check (btrim(intended_sense) <> ''),
  grammatical_role text not null check (btrim(grammatical_role) <> ''),
  target_sentence text not null check (btrim(target_sentence) <> ''),
  sense_source_reference text not null check (btrim(sense_source_reference) <> ''),
  primary key (set_key, revision, member_ordinal),
  unique (set_key, revision, canonical_word_id),
  foreign key (set_key, revision)
    references public.homophone_contrast_sets(set_key, revision) on delete restrict
);

create index homophone_contrast_set_members_word_idx
  on public.homophone_contrast_set_members(canonical_word_id);
create index homophone_contrast_sets_skill_status_idx
  on public.homophone_contrast_sets(micro_skill_key, review_status);

create function public.prevent_approved_homophone_set_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'homophone_contrast_sets' then
    if old.review_status = 'approved' then
      raise exception 'Approved contrast-set revisions are immutable';
    end if;
  elsif exists (select 1 from public.homophone_contrast_sets s
    where s.set_key = old.set_key and s.revision = old.revision
      and s.review_status = 'approved') then
    raise exception 'Approved contrast-set members are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger homophone_contrast_sets_no_approved_mutation
  before update or delete on public.homophone_contrast_sets
  for each row execute function public.prevent_approved_homophone_set_mutation();
create trigger homophone_contrast_set_members_no_approved_mutation
  before update or delete on public.homophone_contrast_set_members
  for each row execute function public.prevent_approved_homophone_set_mutation();

create function public.prevent_approved_homophone_set_member_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.homophone_contrast_sets s
    where s.set_key = new.set_key and s.revision = new.revision
      and s.review_status = 'approved') then
    raise exception 'Approved contrast-set members are immutable';
  end if;
  return new;
end;
$$;
create trigger homophone_contrast_set_members_no_approved_insert
  before insert on public.homophone_contrast_set_members
  for each row execute function public.prevent_approved_homophone_set_member_insert();

-- The approval operation is the only supported transition to release-ready.
create function public.approve_homophone_contrast_set(
  p_set_key text, p_revision integer, p_approved_by text, p_approval_reference text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_set public.homophone_contrast_sets%rowtype;
  v_members jsonb; v_count integer; v_fingerprint text;
begin
  if nullif(btrim(p_approved_by), '') is null or nullif(btrim(p_approval_reference), '') is null then
    raise exception 'Reviewer and approval reference are required';
  end if;
  select * into v_set from public.homophone_contrast_sets
    where set_key = p_set_key and revision = p_revision for update;
  if not found or v_set.review_status <> 'draft' then
    raise exception 'Only a draft contrast set can be approved';
  end if;
  select count(*), jsonb_agg(jsonb_build_object(
    'ordinal', m.member_ordinal, 'wordId', m.canonical_word_id,
    'word', w.display_word, 'sense', m.intended_sense,
    'role', m.grammatical_role, 'sentence', m.target_sentence,
    'source', m.sense_source_reference) order by m.member_ordinal)
  into v_count, v_members
  from public.homophone_contrast_set_members m
  join public.canonical_teaching_dictionary_words w on w.id = m.canonical_word_id
  where m.set_key = p_set_key and m.revision = p_revision
    and w.dialect_code = 'en-GB' and w.row_status = 'active'
    and w.review_status = 'approved_for_first_exposure';
  if v_count not between 2 and 3 then
    raise exception 'A release-ready contrast set requires two or three approved en-GB canonical members';
  end if;
  if v_count <> (select count(*) from public.homophone_contrast_set_members
      where set_key = p_set_key and revision = p_revision) then
    raise exception 'All contrast-set members must be approved canonical words';
  end if;
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'setKey', p_set_key, 'revision', p_revision, 'skill', v_set.micro_skill_key,
    'dialect', v_set.dialect_code, 'relation', v_set.relation_kind,
    'members', v_members)::text, 'UTF8'), 'sha256'), 'hex');
  update public.homophone_contrast_sets set review_status = 'approved',
    approved_by = p_approved_by, approved_at = now(),
    approval_reference = p_approval_reference, semantic_fingerprint = v_fingerprint
  where set_key = p_set_key and revision = p_revision;
  return v_fingerprint;
end;
$$;
revoke all on function public.approve_homophone_contrast_set(text,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.approve_homophone_contrast_set(text,integer,text,text) to service_role;

-- Explicit redirects affect future intake only. Multiple destinations are allowed
-- for old broad skills; historical evidence requires a separate reviewed decision.
create table public.homophone_skill_redirects (
  source_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  destination_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  redirect_status text not null default 'draft' check (redirect_status in ('draft','active','retired')),
  decision_reference text not null,
  approved_by text,
  approved_at timestamptz,
  primary key (source_skill_key, destination_skill_key),
  check (source_skill_key <> destination_skill_key and btrim(decision_reference) <> ''),
  check (redirect_status <> 'active' or
    (nullif(btrim(approved_by), '') is not null and approved_at is not null))
);
create table public.homophone_evidence_migration_reviews (
  source_learning_item_id uuid primary key references public.adle_learning_items(id) on delete restrict,
  destination_skill_key text references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  decision text not null check (decision in ('pending_review','migrate','retain_source','exclude')),
  decision_reason text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  migrated_learning_item_id uuid references public.adle_learning_items(id) on delete restrict,
  check (btrim(decision_reason) <> ''),
  check (decision <> 'migrate' or
    (destination_skill_key is not null and nullif(btrim(reviewed_by), '') is not null
      and reviewed_at is not null))
);

-- Populated by the contextual route in the same transaction as assignment creation.
-- This records the exact approved set revisions selected in a frozen lesson.
create table public.homophone_assignment_contrast_sets (
  assignment_id uuid not null references public.daily_assignments(id) on delete restrict,
  selected_ordinal smallint not null check (selected_ordinal between 1 and 3),
  set_key text not null,
  revision integer not null,
  semantic_fingerprint text not null check (semantic_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (assignment_id, selected_ordinal),
  unique (assignment_id, set_key, revision),
  foreign key (set_key, revision) references public.homophone_contrast_sets(set_key, revision) on delete restrict
);
create trigger homophone_assignment_contrast_sets_immutable
  before update or delete on public.homophone_assignment_contrast_sets
  for each row execute function public.prevent_adle_release_authority_mutation();
create function public.validate_homophone_assignment_contrast_set()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.homophone_contrast_sets s
    where s.set_key = new.set_key and s.revision = new.revision
      and s.review_status = 'approved'
      and s.semantic_fingerprint = new.semantic_fingerprint) then
    raise exception 'Assignment contrast set requires its exact approved revision';
  end if;
  return new;
end;
$$;
create trigger homophone_assignment_contrast_sets_approved
  before insert on public.homophone_assignment_contrast_sets
  for each row execute function public.validate_homophone_assignment_contrast_set();

alter table public.homophone_contrast_sets enable row level security;
alter table public.homophone_contrast_set_members enable row level security;
alter table public.homophone_skill_redirects enable row level security;
alter table public.homophone_evidence_migration_reviews enable row level security;
alter table public.homophone_assignment_contrast_sets enable row level security;
revoke all on public.homophone_contrast_sets, public.homophone_contrast_set_members,
  public.homophone_skill_redirects, public.homophone_evidence_migration_reviews,
  public.homophone_assignment_contrast_sets from public, anon, authenticated;
grant all on public.homophone_contrast_sets, public.homophone_contrast_set_members,
  public.homophone_skill_redirects, public.homophone_evidence_migration_reviews,
  public.homophone_assignment_contrast_sets to service_role;

commit;
