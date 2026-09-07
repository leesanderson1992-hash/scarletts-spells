begin;

-- S7 carries the immutable S5 occurrence through the already-authoritative
-- parent verification, recommendation, canonical-intake and learning-source
-- paths. These columns are lineage only; they do not create another intake or
-- lesson queue.
alter table public.parent_verified_spelling_candidate_mappings
  add column source_writing_occurrence_id text references public.writing_occurrences(id) on delete set null;
alter table public.spelling_catalog_review_cases
  add column source_writing_occurrence_id text references public.writing_occurrences(id) on delete set null;
alter table public.spelling_canonical_mapping_recommendations
  add column source_writing_occurrence_id text references public.writing_occurrences(id) on delete set null;
alter table public.adle_canonical_intake_candidates
  add column source_writing_occurrence_id text references public.writing_occurrences(id) on delete set null;
alter table public.adle_learning_item_sources
  add column source_writing_occurrence_id text references public.writing_occurrences(id) on delete set null;

create index parent_verified_candidate_source_occurrence_idx
  on public.parent_verified_spelling_candidate_mappings(source_writing_occurrence_id)
  where source_writing_occurrence_id is not null;
create index spelling_catalog_case_source_occurrence_idx
  on public.spelling_catalog_review_cases(source_writing_occurrence_id)
  where source_writing_occurrence_id is not null;
create index spelling_recommendation_source_occurrence_idx
  on public.spelling_canonical_mapping_recommendations(source_writing_occurrence_id)
  where source_writing_occurrence_id is not null;
create index canonical_intake_source_occurrence_idx
  on public.adle_canonical_intake_candidates(source_writing_occurrence_id)
  where source_writing_occurrence_id is not null;
create index learning_item_source_occurrence_idx
  on public.adle_learning_item_sources(source_writing_occurrence_id)
  where source_writing_occurrence_id is not null;

create function public.apply_unknown_error_review_occurrence_lineage()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  expected_occurrence text;
  source_parent uuid;
  source_child uuid;
  source_submission uuid;
begin
  if tg_table_name = 'parent_verified_spelling_candidate_mappings' then
    if new.source_misspelling_instance_id is not null then
      select source_writing_occurrence_id into expected_occurrence
      from public.misspelling_instances
      where id = new.source_misspelling_instance_id;
    end if;
  elsif tg_table_name = 'spelling_catalog_review_cases' then
    select source_writing_occurrence_id into expected_occurrence
    from public.misspelling_instances
    where id = new.source_misspelling_instance_id;
  elsif tg_table_name = 'spelling_canonical_mapping_recommendations' then
    if new.candidate_mapping_id is not null then
      select source_writing_occurrence_id into expected_occurrence
      from public.parent_verified_spelling_candidate_mappings
      where id = new.candidate_mapping_id;
    end if;
    if expected_occurrence is null and new.source_misspelling_instance_id is not null then
      select source_writing_occurrence_id into expected_occurrence
      from public.misspelling_instances
      where id = new.source_misspelling_instance_id;
    end if;
  end if;

  if expected_occurrence is not null then
    if new.source_writing_occurrence_id is not null
      and new.source_writing_occurrence_id <> expected_occurrence
    then
      raise exception 'unknown_error_occurrence_lineage_conflict';
    end if;
    new.source_writing_occurrence_id := expected_occurrence;
  elsif tg_op = 'UPDATE' and old.source_writing_occurrence_id is not null then
    new.source_writing_occurrence_id := old.source_writing_occurrence_id;
  end if;

  if new.source_writing_occurrence_id is not null then
    select snapshot.parent_user_id, snapshot.child_id, snapshot.submission_id
    into source_parent, source_child, source_submission
    from public.writing_occurrences occurrence
    join public.writing_source_snapshots snapshot on snapshot.id = occurrence.snapshot_id
    where occurrence.id = new.source_writing_occurrence_id;
    if source_parent is distinct from new.parent_user_id
      or source_child is distinct from new.child_id
    then
      raise exception 'unknown_error_occurrence_scope_invalid';
    end if;
    if new.task_submission_id is not null
      and new.task_submission_id is distinct from source_submission
    then
      raise exception 'unknown_error_occurrence_submission_invalid';
    end if;
  end if;
  return new;
end;
$$;

create trigger parent_candidate_whole_writing_lineage
before insert or update of task_submission_id, source_misspelling_instance_id, source_writing_occurrence_id
on public.parent_verified_spelling_candidate_mappings
for each row execute function public.apply_unknown_error_review_occurrence_lineage();
create trigger catalog_case_whole_writing_lineage
before insert or update of task_submission_id, source_misspelling_instance_id, source_writing_occurrence_id
on public.spelling_catalog_review_cases
for each row execute function public.apply_unknown_error_review_occurrence_lineage();
create trigger canonical_recommendation_whole_writing_lineage
before insert or update of task_submission_id, candidate_mapping_id, source_misspelling_instance_id, source_writing_occurrence_id
on public.spelling_canonical_mapping_recommendations
for each row execute function public.apply_unknown_error_review_occurrence_lineage();

create function public.apply_unknown_error_intake_occurrence_lineage()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  expected_occurrence text;
  source_child uuid;
  target_child uuid;
  validates_candidate_child boolean := false;
begin
  if tg_table_name = 'adle_canonical_intake_candidates' then
    select source_writing_occurrence_id, child_id
    into expected_occurrence, source_child
    from public.parent_verified_spelling_candidate_mappings
    where id = new.source_candidate_mapping_id;
    target_child := new.child_id;
    validates_candidate_child := true;
  else
    if new.parent_verified_candidate_mapping_id is not null then
      select source_writing_occurrence_id, child_id
      into expected_occurrence, source_child
      from public.parent_verified_spelling_candidate_mappings
      where id = new.parent_verified_candidate_mapping_id;
      validates_candidate_child := true;
    end if;
    select child_id into target_child
    from public.adle_learning_items
    where id = new.learning_item_id;
  end if;

  if expected_occurrence is not null then
    if new.source_writing_occurrence_id is not null
      and new.source_writing_occurrence_id <> expected_occurrence
    then
      raise exception 'unknown_error_intake_occurrence_lineage_conflict';
    end if;
    new.source_writing_occurrence_id := expected_occurrence;
  elsif tg_op = 'UPDATE' and old.source_writing_occurrence_id is not null then
    new.source_writing_occurrence_id := old.source_writing_occurrence_id;
  end if;

  if validates_candidate_child and source_child is distinct from target_child then
    raise exception 'unknown_error_intake_child_scope_invalid';
  end if;
  return new;
end;
$$;

create trigger canonical_intake_whole_writing_lineage
before insert or update of source_candidate_mapping_id, source_writing_occurrence_id
on public.adle_canonical_intake_candidates
for each row execute function public.apply_unknown_error_intake_occurrence_lineage();
create trigger learning_item_source_whole_writing_lineage
before insert or update of parent_verified_candidate_mapping_id, source_writing_occurrence_id
on public.adle_learning_item_sources
for each row execute function public.apply_unknown_error_intake_occurrence_lineage();

-- Late exact linking, including S6 reconciliation of one legacy candidate,
-- propagates through every already-created downstream receipt.
create function public.propagate_unknown_error_occurrence_lineage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source_writing_occurrence_id is null
    or new.source_writing_occurrence_id is not distinct from old.source_writing_occurrence_id
  then
    return new;
  end if;

  if tg_table_name = 'misspelling_instances' then
    update public.parent_verified_spelling_candidate_mappings
    set source_writing_occurrence_id = new.source_writing_occurrence_id
    where source_misspelling_instance_id = new.id
      and source_writing_occurrence_id is null;
    update public.spelling_catalog_review_cases
    set source_writing_occurrence_id = new.source_writing_occurrence_id
    where source_misspelling_instance_id = new.id
      and source_writing_occurrence_id is null;
    update public.spelling_canonical_mapping_recommendations
    set source_writing_occurrence_id = new.source_writing_occurrence_id
    where source_misspelling_instance_id = new.id
      and source_writing_occurrence_id is null;
  elsif tg_table_name = 'parent_verified_spelling_candidate_mappings' then
    update public.adle_canonical_intake_candidates
    set source_writing_occurrence_id = new.source_writing_occurrence_id
    where source_candidate_mapping_id = new.id
      and source_writing_occurrence_id is null;
    update public.adle_learning_item_sources
    set source_writing_occurrence_id = new.source_writing_occurrence_id
    where parent_verified_candidate_mapping_id = new.id
      and source_writing_occurrence_id is null;
    update public.spelling_canonical_mapping_recommendations
    set source_writing_occurrence_id = new.source_writing_occurrence_id
    where candidate_mapping_id = new.id
      and source_writing_occurrence_id is null;
  end if;
  return new;
end;
$$;

create trigger misspelling_propagate_unknown_error_lineage
after update of source_writing_occurrence_id on public.misspelling_instances
for each row execute function public.propagate_unknown_error_occurrence_lineage();
create trigger parent_candidate_propagate_unknown_error_lineage
after update of source_writing_occurrence_id on public.parent_verified_spelling_candidate_mappings
for each row execute function public.propagate_unknown_error_occurrence_lineage();

update public.parent_verified_spelling_candidate_mappings candidate
set source_writing_occurrence_id = misspelling.source_writing_occurrence_id
from public.misspelling_instances misspelling
where misspelling.id = candidate.source_misspelling_instance_id
  and misspelling.source_writing_occurrence_id is not null
  and candidate.source_writing_occurrence_id is null;

update public.spelling_catalog_review_cases review_case
set source_writing_occurrence_id = misspelling.source_writing_occurrence_id
from public.misspelling_instances misspelling
where misspelling.id = review_case.source_misspelling_instance_id
  and misspelling.source_writing_occurrence_id is not null
  and review_case.source_writing_occurrence_id is null;

update public.spelling_canonical_mapping_recommendations recommendation
set source_writing_occurrence_id = candidate.source_writing_occurrence_id
from public.parent_verified_spelling_candidate_mappings candidate
where recommendation.source_writing_occurrence_id is null
  and candidate.id = recommendation.candidate_mapping_id
  and candidate.source_writing_occurrence_id is not null;

update public.spelling_canonical_mapping_recommendations recommendation
set source_writing_occurrence_id = misspelling.source_writing_occurrence_id
from public.misspelling_instances misspelling
where recommendation.source_writing_occurrence_id is null
  and misspelling.id = recommendation.source_misspelling_instance_id
  and misspelling.source_writing_occurrence_id is not null;

update public.adle_canonical_intake_candidates intake
set source_writing_occurrence_id = candidate.source_writing_occurrence_id
from public.parent_verified_spelling_candidate_mappings candidate
where candidate.id = intake.source_candidate_mapping_id
  and candidate.source_writing_occurrence_id is not null
  and intake.source_writing_occurrence_id is null;

update public.adle_learning_item_sources source
set source_writing_occurrence_id = candidate.source_writing_occurrence_id
from public.parent_verified_spelling_candidate_mappings candidate
where candidate.id = source.parent_verified_candidate_mapping_id
  and candidate.source_writing_occurrence_id is not null
  and source.source_writing_occurrence_id is null;

-- Preserve the released governed-source authorization and append the stable
-- whole-writing occurrence to its receipt. Legacy sources legitimately return
-- null here.
create function public.adle_authorize_governed_source_continuation_s7(
  p_candidate_mapping_id uuid,
  p_expected_parent_user_id uuid,
  p_expected_child_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  receipt jsonb;
  whole_writing_occurrence_id text;
begin
  if auth.uid() is not null then
    raise exception 'Governed-source continuation is service governance only.';
  end if;
  receipt := public.adle_authorize_governed_source_continuation(
    p_candidate_mapping_id,
    p_expected_parent_user_id,
    p_expected_child_id
  );
  select source_writing_occurrence_id into whole_writing_occurrence_id
  from public.parent_verified_spelling_candidate_mappings
  where id = p_candidate_mapping_id
    and parent_user_id = p_expected_parent_user_id
    and child_id = p_expected_child_id;
  return receipt || jsonb_build_object(
    'source_writing_occurrence_id', whole_writing_occurrence_id
  );
end;
$$;

create view public.writing_unknown_error_intake_observability
with (security_invoker = true) as
select
  snapshot.parent_user_id,
  snapshot.child_id,
  count(distinct misspelling.id) filter (
    where misspelling.source_writing_occurrence_id is not null
  )::bigint as occurrence_linked_parent_findings,
  count(distinct candidate.id) filter (
    where candidate.source_writing_occurrence_id is not null
  )::bigint as occurrence_linked_candidate_mappings,
  count(distinct review_case.id) filter (
    where review_case.source_writing_occurrence_id is not null
  )::bigint as occurrence_linked_catalog_cases,
  count(distinct intake.id) filter (
    where intake.source_writing_occurrence_id is not null
  )::bigint as occurrence_linked_intake_candidates,
  count(distinct source.id) filter (
    where source.source_writing_occurrence_id is not null
  )::bigint as occurrence_linked_learning_sources
from public.writing_source_snapshots snapshot
join public.writing_occurrences occurrence on occurrence.snapshot_id = snapshot.id
left join public.misspelling_instances misspelling
  on misspelling.source_writing_occurrence_id = occurrence.id
left join public.parent_verified_spelling_candidate_mappings candidate
  on candidate.source_writing_occurrence_id = occurrence.id
left join public.spelling_catalog_review_cases review_case
  on review_case.source_writing_occurrence_id = occurrence.id
left join public.adle_canonical_intake_candidates intake
  on intake.source_writing_occurrence_id = occurrence.id
left join public.adle_learning_item_sources source
  on source.source_writing_occurrence_id = occurrence.id
group by snapshot.parent_user_id, snapshot.child_id;

revoke all on function public.apply_unknown_error_review_occurrence_lineage(),
  public.apply_unknown_error_intake_occurrence_lineage(),
  public.propagate_unknown_error_occurrence_lineage(),
  public.adle_authorize_governed_source_continuation_s7(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.adle_authorize_governed_source_continuation_s7(uuid, uuid, uuid)
to service_role;
revoke all on public.writing_unknown_error_intake_observability
from public, anon, authenticated;
grant select on public.writing_unknown_error_intake_observability to service_role;

notify pgrst, 'reload schema';
commit;
