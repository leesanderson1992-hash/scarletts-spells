begin;

create table if not exists public.child_gold_bar_ledger_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  event_type text not null check (event_type in ('earned', 'converted', 'adjusted')),
  amount integer not null check (amount > 0),
  source text not null,
  related_entity_type text,
  related_entity_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists child_gold_bar_ledger_events_child_created_idx
  on public.child_gold_bar_ledger_events (child_id, created_at desc);

create table if not exists public.child_gold_coin_ledger_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  event_type text not null check (event_type in ('earned_daily', 'converted_from_bar', 'spent', 'transferred', 'adjusted')),
  amount integer not null check (amount > 0),
  source text not null,
  related_entity_type text,
  related_entity_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists child_gold_coin_ledger_events_child_created_idx
  on public.child_gold_coin_ledger_events (child_id, created_at desc);

create table if not exists public.gold_coin_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  gold_coin_amount integer not null check (gold_coin_amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  child_note text,
  parent_note text,
  approved_at timestamptz,
  declined_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gold_coin_transfer_requests_child_created_idx
  on public.gold_coin_transfer_requests (child_id, created_at desc);

grant select, insert, update, delete on public.child_gold_bar_ledger_events to authenticated;
grant select, insert, update, delete on public.child_gold_coin_ledger_events to authenticated;
grant select, insert, update, delete on public.gold_coin_transfer_requests to authenticated;

alter table public.child_gold_bar_ledger_events enable row level security;
alter table public.child_gold_coin_ledger_events enable row level security;
alter table public.gold_coin_transfer_requests enable row level security;

drop policy if exists child_gold_bar_ledger_events_parent_access on public.child_gold_bar_ledger_events;
create policy child_gold_bar_ledger_events_parent_access
on public.child_gold_bar_ledger_events
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists child_gold_coin_ledger_events_parent_access on public.child_gold_coin_ledger_events;
create policy child_gold_coin_ledger_events_parent_access
on public.child_gold_coin_ledger_events
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists gold_coin_transfer_requests_parent_access on public.gold_coin_transfer_requests;
create policy gold_coin_transfer_requests_parent_access
on public.gold_coin_transfer_requests
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
