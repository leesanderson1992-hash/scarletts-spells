-- READ ONLY. Bind $1 to the explicitly authorised learner UUID array.
-- Inventory/history count gate only: this does not check Target Word collisions,
-- video playback, configuration rendering, approval receipts or activation.
-- An empty learner scope returns no rows, which MUST NOT be treated as a pass.
with requested_scope as (
  select distinct unnest($1::uuid[]) as child_id
), required(challenge_type, minimum_unused) as (
  values ('conundrums', 5), ('reflection', 2), ('stories', 5),
         ('fortunately_unfortunately', 5), ('persuasion', 5)
), approved as (
  select id, stable_prompt_key, challenge_type
  from public.adle_review_prompt_versions
  where review_status = 'approved' and row_status = 'active'
), completions as (
  -- Resolve historic versions, including retired versions, to their stable keys.
  select session.child_id, historical.stable_prompt_key, historical.challenge_type,
         max(session.completed_at) as last_completed_at
  from public.adle_review_sessions session
  join public.adle_review_prompt_versions historical
    on historical.id = session.selected_prompt_version_id
  join requested_scope scope on scope.child_id = session.child_id
  where session.completed_at is not null
  group by session.child_id, historical.stable_prompt_key, historical.challenge_type
), counts as (
  select scope.child_id, required.challenge_type, required.minimum_unused,
    count(distinct approved.stable_prompt_key) as approved_active_count,
    count(distinct approved.stable_prompt_key) filter (
      where required.challenge_type = 'reflection' or completed.stable_prompt_key is null
    ) as eligible_inventory_count
  from requested_scope scope
  cross join required
  left join approved on approved.challenge_type = required.challenge_type
  left join completions completed
    on completed.child_id = scope.child_id
    and completed.stable_prompt_key = approved.stable_prompt_key
  where scope.child_id is not null
  group by scope.child_id, required.challenge_type, required.minimum_unused
)
select *, eligible_inventory_count >= minimum_unused as inventory_count_gate_passes
from counts
order by child_id, challenge_type;
