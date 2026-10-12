create table if not exists public.adle_homophone_balloon_bests (
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  micro_skill_key text not null,
  best_score integer not null check (best_score >= 0),
  updated_at timestamptz not null default now(),
  primary key (child_id, micro_skill_key)
);

alter table public.adle_homophone_balloon_bests enable row level security;
grant select on public.adle_homophone_balloon_bests to authenticated;

create policy adle_homophone_balloon_bests_select_own
  on public.adle_homophone_balloon_bests for select to authenticated
  using (parent_user_id = auth.uid());

create or replace function public.record_adle_homophone_balloon_best(
  p_child_id uuid,
  p_micro_skill_key text,
  p_score integer
) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_best integer;
begin
  if auth.uid() is null or p_score is null or p_score < 0 or p_score > 1000
     or p_micro_skill_key is null or p_micro_skill_key !~ '^D4_HOM_[A-Z0-9_]+$'
     or not exists (
       select 1 from public.children
       where id = p_child_id and parent_user_id = auth.uid() and not coalesce(is_archived, false)
     ) then
    raise exception 'homophone_balloon_best_invalid_request';
  end if;
  insert into public.adle_homophone_balloon_bests(child_id, parent_user_id, micro_skill_key, best_score)
  values(p_child_id, auth.uid(), p_micro_skill_key, p_score)
  on conflict (child_id, micro_skill_key) do update
    set best_score = greatest(public.adle_homophone_balloon_bests.best_score, excluded.best_score),
        updated_at = case when excluded.best_score > public.adle_homophone_balloon_bests.best_score then now() else public.adle_homophone_balloon_bests.updated_at end
  returning best_score into v_best;
  return v_best;
end;
$$;

revoke all on function public.record_adle_homophone_balloon_best(uuid, text, integer) from public;
grant execute on function public.record_adle_homophone_balloon_best(uuid, text, integer) to authenticated;
