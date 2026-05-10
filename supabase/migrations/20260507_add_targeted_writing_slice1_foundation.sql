begin;

create table if not exists public.micro_skill_families (
  id uuid primary key default gen_random_uuid(),
  mastery_domain_key text not null,
  skill_family_key text not null unique,
  display_name text not null,
  is_assignable boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists micro_skill_families_domain_assignable_idx
  on public.micro_skill_families (mastery_domain_key, is_assignable, display_name);

grant select, insert, update, delete on public.micro_skill_families to authenticated;

alter table public.micro_skill_families enable row level security;

drop policy if exists micro_skill_families_authenticated_read on public.micro_skill_families;
create policy micro_skill_families_authenticated_read
on public.micro_skill_families
for select
to authenticated
using (true);

create table if not exists public.micro_skill_clusters (
  id uuid primary key default gen_random_uuid(),
  mastery_domain_key text not null,
  skill_family_key text not null,
  skill_cluster_key text not null unique,
  display_name text not null,
  is_assignable boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists micro_skill_clusters_family_assignable_idx
  on public.micro_skill_clusters (skill_family_key, is_assignable, display_name);

grant select, insert, update, delete on public.micro_skill_clusters to authenticated;

alter table public.micro_skill_clusters enable row level security;

drop policy if exists micro_skill_clusters_authenticated_read on public.micro_skill_clusters;
create policy micro_skill_clusters_authenticated_read
on public.micro_skill_clusters
for select
to authenticated
using (true);

create table if not exists public.micro_skill_catalog (
  id uuid primary key default gen_random_uuid(),
  mastery_domain_key text not null,
  skill_family_key text not null,
  skill_cluster_key text,
  micro_skill_key text not null unique,
  display_name text not null,
  practice_route text not null,
  is_assignable boolean not null default false,
  is_active boolean not null default true,
  allowed_template_keys text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'micro_skill_catalog_practice_route_check'
  ) then
    alter table public.micro_skill_catalog
      add constraint micro_skill_catalog_practice_route_check
      check (practice_route in ('word_practice', 'grouped_set_practice'));
  end if;
end $$;

create index if not exists micro_skill_catalog_assignable_idx
  on public.micro_skill_catalog (is_assignable, mastery_domain_key, skill_family_key, display_name);

create index if not exists micro_skill_catalog_key_idx
  on public.micro_skill_catalog (micro_skill_key);

grant select, insert, update, delete on public.micro_skill_catalog to authenticated;

alter table public.micro_skill_catalog enable row level security;

drop policy if exists micro_skill_catalog_authenticated_read on public.micro_skill_catalog;
create policy micro_skill_catalog_authenticated_read
on public.micro_skill_catalog
for select
to authenticated
using (true);

alter table public.learning_items
  add column if not exists mastery_domain_key text,
  add column if not exists skill_family_key text,
  add column if not exists skill_cluster_key text,
  add column if not exists practice_route text,
  add column if not exists current_competency_level integer,
  add column if not exists target_competency_level integer,
  add column if not exists review_due_at timestamptz,
  add column if not exists last_meaningful_success_at timestamptz,
  add column if not exists last_meaningful_failure_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_items_practice_route_check'
  ) then
    alter table public.learning_items
      add constraint learning_items_practice_route_check
      check (
        practice_route is null
        or practice_route in ('word_practice', 'grouped_set_practice')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_items_current_competency_level_check'
  ) then
    alter table public.learning_items
      add constraint learning_items_current_competency_level_check
      check (
        current_competency_level is null
        or current_competency_level between 1 and 5
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_items_target_competency_level_check'
  ) then
    alter table public.learning_items
      add constraint learning_items_target_competency_level_check
      check (
        target_competency_level is null
        or target_competency_level between 1 and 5
      );
  end if;
end $$;

create index if not exists learning_items_child_review_due_idx
  on public.learning_items (child_id, is_active, review_due_at, updated_at desc);

create table if not exists public.learning_item_issue_links (
  id uuid primary key default gen_random_uuid(),
  learning_item_id uuid not null references public.learning_items(id) on delete cascade,
  writing_issue_id uuid not null references public.writing_issues(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  link_role text not null default 'origin',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_item_issue_links_role_check'
  ) then
    alter table public.learning_item_issue_links
      add constraint learning_item_issue_links_role_check
      check (link_role in ('origin', 'supporting'));
  end if;
end $$;

create unique index if not exists learning_item_issue_links_unique_idx
  on public.learning_item_issue_links (learning_item_id, writing_issue_id);

create index if not exists learning_item_issue_links_issue_idx
  on public.learning_item_issue_links (writing_issue_id, created_at desc);

create index if not exists learning_item_issue_links_child_idx
  on public.learning_item_issue_links (child_id, created_at desc);

grant select, insert, update, delete on public.learning_item_issue_links to authenticated;

alter table public.learning_item_issue_links enable row level security;

drop policy if exists learning_item_issue_links_parent_access on public.learning_item_issue_links;
create policy learning_item_issue_links_parent_access
on public.learning_item_issue_links
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

create table if not exists public.learning_item_evidence (
  id uuid primary key default gen_random_uuid(),
  learning_item_id uuid not null references public.learning_items(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  writing_issue_id uuid references public.writing_issues(id) on delete set null,
  task_submission_id uuid references public.task_submissions(id) on delete set null,
  evidence_type text not null,
  competency_signal integer,
  source_context text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_item_evidence_type_check'
  ) then
    alter table public.learning_item_evidence
      add constraint learning_item_evidence_type_check
      check (
        evidence_type in (
          'incorrect_use',
          'corrected_after_prompt',
          'corrected_independently',
          'controlled_practice_success',
          'authentic_correct_use',
          'delayed_authentic_correct_use',
          'repeated_correct_use'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_item_evidence_competency_signal_check'
  ) then
    alter table public.learning_item_evidence
      add constraint learning_item_evidence_competency_signal_check
      check (
        competency_signal is null
        or competency_signal between 1 and 5
      );
  end if;
end $$;

create index if not exists learning_item_evidence_learning_item_idx
  on public.learning_item_evidence (learning_item_id, created_at desc);

create index if not exists learning_item_evidence_child_idx
  on public.learning_item_evidence (child_id, created_at desc);

create index if not exists learning_item_evidence_issue_idx
  on public.learning_item_evidence (writing_issue_id, created_at desc)
  where writing_issue_id is not null;

grant select, insert, update, delete on public.learning_item_evidence to authenticated;

alter table public.learning_item_evidence enable row level security;

drop policy if exists learning_item_evidence_parent_access on public.learning_item_evidence;
create policy learning_item_evidence_parent_access
on public.learning_item_evidence
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

insert into public.micro_skill_families (
  mastery_domain_key,
  skill_family_key,
  display_name,
  is_assignable,
  metadata
)
values
  (
    'D4',
    'D4_PG',
    'Phoneme-grapheme spelling',
    true,
    jsonb_build_object(
      'seed_version', 'domain4-mvp1-preflight-v1',
      'source_workbook', 'domain-4-mastery-node-seed-map.xlsx'
    )
  ),
  (
    'D4',
    'D4_MOR',
    'Morphology',
    false,
    jsonb_build_object(
      'seed_version', 'domain4-mvp1-preflight-v1',
      'seeded_non_assignable', true,
      'source_workbook', 'domain-4-mastery-node-seed-map.xlsx'
    )
  )
on conflict (skill_family_key) do update
set
  mastery_domain_key = excluded.mastery_domain_key,
  display_name = excluded.display_name,
  is_assignable = excluded.is_assignable,
  metadata = excluded.metadata,
  updated_at = timezone('utc', now());

insert into public.micro_skill_clusters (
  mastery_domain_key,
  skill_family_key,
  skill_cluster_key,
  display_name,
  is_assignable,
  metadata
)
values
  (
    'D4',
    'D4_PG',
    'D4_PG_CVC_SHORT_VOWELS',
    'CVC short vowels',
    true,
    jsonb_build_object(
      'seed_version', 'domain4-mvp1-preflight-v1'
    )
  ),
  (
    'D4',
    'D4_PG',
    'D4_PG_CONSONANT_DIGRAPHS',
    'Consonant digraphs',
    true,
    jsonb_build_object(
      'seed_version', 'domain4-mvp1-preflight-v1'
    )
  )
on conflict (skill_cluster_key) do update
set
  mastery_domain_key = excluded.mastery_domain_key,
  skill_family_key = excluded.skill_family_key,
  display_name = excluded.display_name,
  is_assignable = excluded.is_assignable,
  metadata = excluded.metadata,
  updated_at = timezone('utc', now());

insert into public.micro_skill_catalog (
  mastery_domain_key,
  skill_family_key,
  skill_cluster_key,
  micro_skill_key,
  display_name,
  practice_route,
  is_assignable,
  allowed_template_keys,
  metadata
)
values
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_SHORT_A', 'Short /a/ in CVC words', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_SHORT_E', 'Short /e/ in CVC words', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_SHORT_I', 'Short /i/ in CVC words', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_SHORT_O', 'Short /o/ in CVC words', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_SHORT_U', 'Short /u/ in CVC words', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_INITIAL_CONSONANT', 'Initial consonants in CVC words', 'grouped_set_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_FINAL_CONSONANT', 'Final consonants in CVC words', 'grouped_set_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING', 'Full CVC sound-to-spelling mapping', 'grouped_set_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_VOWEL_DISCRIMINATION', 'Short-vowel discrimination in CVC words', 'grouped_set_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CVC_SHORT_VOWELS', 'D4_PG_CVC_SHORT_VOWELS_CHECK_VOWEL', 'Check the vowel in CVC words', 'grouped_set_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CONSONANT_DIGRAPHS', 'D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL', 'Use sh in initial and final position', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CONSONANT_DIGRAPHS', 'D4_PG_CONSONANT_DIGRAPHS_CH_INITIAL_FINAL', 'Use ch in initial and final position', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CONSONANT_DIGRAPHS', 'D4_PG_CONSONANT_DIGRAPHS_TH_UNVOICED', 'Use unvoiced th', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CONSONANT_DIGRAPHS', 'D4_PG_CONSONANT_DIGRAPHS_TH_VOICED', 'Use voiced th', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array())),
  ('D4', 'D4_PG', 'D4_PG_CONSONANT_DIGRAPHS', 'D4_PG_CONSONANT_DIGRAPHS_WH_INITIAL', 'Use wh in initial position', 'word_practice', true, array['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T08'], jsonb_build_object('seed_version', 'domain4-mvp1-preflight-v1', 'starter_word_bank', jsonb_build_array(), 'contrast_words', jsonb_build_array(), 'watch_words', jsonb_build_array()))
on conflict (micro_skill_key) do update
set
  mastery_domain_key = excluded.mastery_domain_key,
  skill_family_key = excluded.skill_family_key,
  skill_cluster_key = excluded.skill_cluster_key,
  display_name = excluded.display_name,
  practice_route = excluded.practice_route,
  is_assignable = excluded.is_assignable,
  allowed_template_keys = excluded.allowed_template_keys,
  metadata = excluded.metadata,
  updated_at = timezone('utc', now());

update public.learning_items li
set
  mastery_domain_key = coalesce(li.mastery_domain_key, catalog.mastery_domain_key),
  skill_family_key = coalesce(li.skill_family_key, catalog.skill_family_key),
  skill_cluster_key = coalesce(li.skill_cluster_key, catalog.skill_cluster_key),
  practice_route = coalesce(li.practice_route, catalog.practice_route),
  updated_at = case
    when li.mastery_domain_key is null
      or li.skill_family_key is null
      or li.skill_cluster_key is null
      or li.practice_route is null
    then timezone('utc', now())
    else li.updated_at
  end
from public.micro_skill_catalog catalog
where li.micro_skill_key = catalog.micro_skill_key;

insert into public.learning_item_issue_links (
  learning_item_id,
  writing_issue_id,
  child_id,
  parent_user_id,
  link_role,
  metadata,
  created_at,
  updated_at
)
select
  li.id,
  li.source_writing_issue_id,
  li.child_id,
  li.parent_user_id,
  'origin',
  jsonb_build_object(
    'seeded_from_existing_learning_item', true
  ),
  li.created_at,
  li.updated_at
from public.learning_items li
where li.source_writing_issue_id is not null
on conflict (learning_item_id, writing_issue_id) do nothing;

create or replace function public.finalise_writing_issue_classification_and_learning_item(
  p_writing_issue_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid,
  p_final_classification text
)
returns jsonb
language plpgsql
as $$
declare
  v_issue public.writing_issues%rowtype;
  v_catalog public.micro_skill_catalog%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_learning_item_id uuid;
  v_created_learning_item boolean := false;
begin
  if p_final_classification not in (
    'checking_only',
    'fragile_knowledge',
    'concept_gap',
    'transfer_failure',
    'not_an_issue'
  ) then
    raise exception 'Choose a valid final classification before saving.';
  end if;

  select *
  into v_issue
  from public.writing_issues
  where id = p_writing_issue_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
  for update;

  if not found then
    raise exception 'That writing issue no longer exists.';
  end if;

  if v_issue.issue_status = 'finalised' or v_issue.final_classification is not null then
    raise exception 'That writing issue has already been finalised.';
  end if;

  if v_issue.issue_status <> 'child_responded' then
    raise exception 'Only child responses can be final-classified in this slice.';
  end if;

  select *
  into v_catalog
  from public.micro_skill_catalog
  where micro_skill_key = v_issue.micro_skill_key
  limit 1;

  update public.writing_issues
  set
    final_classification = p_final_classification,
    issue_status = 'finalised',
    final_classified_at = v_now,
    updated_at = v_now
  where id = v_issue.id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id;

  if p_final_classification in ('fragile_knowledge', 'concept_gap', 'transfer_failure') then
    insert into public.learning_items (
      child_id,
      parent_user_id,
      source_writing_issue_id,
      micro_skill_key,
      mastery_domain_key,
      skill_family_key,
      skill_cluster_key,
      practice_route,
      theme_key,
      progress_state,
      is_active,
      metadata,
      created_at,
      updated_at
    )
    values (
      v_issue.child_id,
      v_issue.parent_user_id,
      v_issue.id,
      v_issue.micro_skill_key,
      v_catalog.mastery_domain_key,
      v_catalog.skill_family_key,
      v_catalog.skill_cluster_key,
      v_catalog.practice_route,
      v_issue.theme_key,
      'golden_nugget',
      true,
      jsonb_build_object(
        'created_from_final_classification', p_final_classification,
        'source_issue_status_at_creation', 'finalised'
      ),
      v_now,
      v_now
    )
    on conflict (source_writing_issue_id) do nothing
    returning id into v_learning_item_id;

    if v_learning_item_id is not null then
      v_created_learning_item := true;

      insert into public.learning_item_issue_links (
        learning_item_id,
        writing_issue_id,
        child_id,
        parent_user_id,
        link_role,
        metadata,
        created_at,
        updated_at
      )
      values (
        v_learning_item_id,
        v_issue.id,
        v_issue.child_id,
        v_issue.parent_user_id,
        'origin',
        jsonb_build_object(
          'created_from_final_classification', p_final_classification
        ),
        v_now,
        v_now
      )
      on conflict (learning_item_id, writing_issue_id) do nothing;
    else
      select id
      into v_learning_item_id
      from public.learning_items
      where source_writing_issue_id = v_issue.id
        and parent_user_id = p_parent_user_id
      limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'created_learning_item', v_created_learning_item,
    'learning_item_id', v_learning_item_id,
    'progress_state', case when v_learning_item_id is not null then 'golden_nugget' else null end
  );
end;
$$;

grant execute on function public.finalise_writing_issue_classification_and_learning_item(uuid, uuid, uuid, text) to authenticated;

commit;
