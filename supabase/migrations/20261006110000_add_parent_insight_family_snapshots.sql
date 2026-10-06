create table if not exists public.parent_insight_family_snapshots (
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_on date not null,
  family_key text not null,
  family_label text not null,
  average_level numeric(4,2) not null check (average_level between 0 and 5),
  microskill_count integer not null check (microskill_count > 0),
  policy_version text not null,
  banding_version text not null,
  created_at timestamptz not null default now(),
  primary key (child_id, snapshot_on, family_key)
);

create index if not exists parent_insight_family_snapshots_parent_date_idx
  on public.parent_insight_family_snapshots(parent_user_id, child_id, snapshot_on desc);

alter table public.parent_insight_family_snapshots enable row level security;
create policy parent_insight_family_snapshots_owner_read
  on public.parent_insight_family_snapshots for select to authenticated
  using (parent_user_id = auth.uid());
grant select on public.parent_insight_family_snapshots to authenticated;
grant all on public.parent_insight_family_snapshots to service_role;

create table if not exists public.parent_insight_snapshot_runs (
  child_id uuid not null references public.children(id) on delete cascade,
  snapshot_on date not null,
  captured_at timestamptz not null default now(),
  primary key (child_id, snapshot_on)
);
alter table public.parent_insight_snapshot_runs enable row level security;
grant all on public.parent_insight_snapshot_runs to service_role;
