begin;

-- Archive is an admin view preference. It does not change candidate or demand
-- lifecycle, links, reconciliation, or the governed readiness evaluator.
alter table public.adle_canonical_intake_demands
  add column archived_at timestamptz,
  add column archived_by_user_id uuid references auth.users(id) on delete set null;

create index adle_canonical_intake_demands_archive_idx
  on public.adle_canonical_intake_demands(archived_at, lifecycle_status, last_seen_at desc, id);

-- A later occurrence may create another demand for the same word and skill.
-- Keep a fully archived unresolved group hidden until an admin restores it.
create function public.adle_inherit_canonical_intake_demand_archive()
returns trigger language plpgsql as $$
declare
  v_count integer;
  v_archived_count integer;
  v_archived_at timestamptz;
  v_archived_by uuid;
begin
  select count(*), count(archived_at), max(archived_at)
    into v_count, v_archived_count, v_archived_at
  from public.adle_canonical_intake_demands
  where normalized_target_token = new.normalized_target_token
    and micro_skill_key = new.micro_skill_key
    and lifecycle_status not in ('activated', 'rejected', 'superseded');
  if v_count > 0 and v_count = v_archived_count then
    select archived_by_user_id into v_archived_by
    from public.adle_canonical_intake_demands
    where normalized_target_token = new.normalized_target_token
      and micro_skill_key = new.micro_skill_key
      and archived_at = v_archived_at
    order by id limit 1;
    new.archived_at := v_archived_at;
    new.archived_by_user_id := v_archived_by;
  end if;
  return new;
end;
$$;

create trigger adle_canonical_intake_demand_inherit_archive
  before insert on public.adle_canonical_intake_demands
  for each row execute function public.adle_inherit_canonical_intake_demand_archive();

commit;
