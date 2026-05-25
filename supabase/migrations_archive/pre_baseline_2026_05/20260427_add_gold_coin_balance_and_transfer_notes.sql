begin;

alter table public.children
  add column if not exists gold_coin_balance integer not null default 0;

update public.children
set gold_coin_balance = ingredient_count
where coalesce(gold_coin_balance, 0) = 0
  and coalesce(ingredient_count, 0) > 0;

alter table public.daily_assignments
  add column if not exists gold_coin_awarded boolean not null default false;

update public.daily_assignments
set gold_coin_awarded = ingredient_awarded
where coalesce(ingredient_awarded, false) = true;

alter table public.gold_coin_transfer_requests
  add column if not exists child_note text,
  add column if not exists parent_note text;

commit;
