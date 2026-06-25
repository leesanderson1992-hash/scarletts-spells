create table if not exists public.returned_correction_replay_recommendations (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  writing_issue_id uuid not null references public.writing_issues(id) on delete cascade,
  source_misspelling_instance_id uuid references public.misspelling_instances(id) on delete set null,
  admin_case_id uuid references public.spelling_catalog_review_cases(id) on delete set null,
  canonical_mapping_id uuid references public.spelling_canonical_mappings(id) on delete set null,
  admin_decision_id uuid references public.spelling_catalog_review_case_decisions(id) on delete set null,
  micro_skill_key text references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  route_source text not null,
  route_fingerprint text not null,
  replay_status text not null default 'pending',
  planner_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint returned_correction_replay_recommendations_status_check
    check (replay_status in ('pending', 'applied', 'dismissed', 'blocked', 'superseded')),
  constraint returned_correction_replay_recommendations_route_source_check
    check (btrim(route_source) <> ''),
  constraint returned_correction_replay_recommendations_route_fingerprint_check
    check (btrim(route_fingerprint) <> '')
);

create unique index if not exists returned_correction_replay_recommendations_route_uidx
  on public.returned_correction_replay_recommendations (writing_issue_id, route_fingerprint);

create index if not exists returned_correction_replay_recommendations_status_idx
  on public.returned_correction_replay_recommendations (replay_status, updated_at desc);

create index if not exists returned_correction_replay_recommendations_admin_case_idx
  on public.returned_correction_replay_recommendations (admin_case_id, replay_status, updated_at desc);

create index if not exists returned_correction_replay_recommendations_canonical_idx
  on public.returned_correction_replay_recommendations (canonical_mapping_id, replay_status, updated_at desc);

create index if not exists returned_correction_replay_recommendations_child_idx
  on public.returned_correction_replay_recommendations (child_id, replay_status, updated_at desc);

alter table public.returned_correction_replay_recommendations enable row level security;

revoke all on table public.returned_correction_replay_recommendations from public;
revoke all on table public.returned_correction_replay_recommendations from anon;
revoke all on table public.returned_correction_replay_recommendations from authenticated;
grant all on table public.returned_correction_replay_recommendations to service_role;
