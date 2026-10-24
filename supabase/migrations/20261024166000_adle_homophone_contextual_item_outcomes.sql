-- Resolve only this diagnosed microskill's queued items from the immutable
-- sentence choices. Word spelling proficiency and generic Review remain separate.
begin;
create table public.homophone_context_choice_item_transitions (
  assignment_id uuid not null references public.daily_assignments(id) on delete restrict,
  learning_item_id uuid not null references public.adle_learning_items(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  all_context_choices_correct boolean not null,
  destination_status text not null check (destination_status in ('resolved','pending_reteach')),
  created_at timestamptz not null default timezone('utc',now()),
  primary key (assignment_id,learning_item_id)
);
create trigger homophone_context_choice_item_transitions_immutable
  before update or delete on public.homophone_context_choice_item_transitions
  for each row execute function public.prevent_adle_release_authority_mutation();
alter table public.homophone_context_choice_item_transitions enable row level security;
revoke all on public.homophone_context_choice_item_transitions from public,anon,authenticated;
grant all on public.homophone_context_choice_item_transitions to service_role;

create function public.apply_homophone_context_choice_item_outcomes_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare inserted_count integer;
begin
  if old.status is not distinct from 'completed' or new.status is distinct from 'completed'
    or new.compiled_lesson_snapshot#>>'{route,routeId}' is distinct from 'homophone_contextual_choice'
  then return new; end if;
  if exists(select 1 from public.assignment_items item
    where item.daily_assignment_id=new.id
      and item.metadata->>'sectionKey' like 'review_%'
      and item.status<>'completed')
  then raise exception 'contextual homophone review incomplete at Finish'; end if;
  insert into public.homophone_context_choice_item_transitions(
    assignment_id,learning_item_id,child_id,micro_skill_key,canonical_word_id,
    all_context_choices_correct,destination_status)
  select new.id,li.id,new.child_id,new.compiled_lesson_snapshot->>'microSkillKey',
    li.canonical_word_id,outcome.all_correct,
    case when outcome.all_correct then 'resolved' else 'pending_reteach' end
  from (select correct_word_id,bool_and(is_correct) all_correct
    from public.homophone_context_choice_attempts
    where assignment_id=new.id and micro_skill_key=new.compiled_lesson_snapshot->>'microSkillKey'
    group by correct_word_id) outcome
  join public.adle_learning_items li on li.child_id=new.child_id
    and li.micro_skill_key=new.compiled_lesson_snapshot->>'microSkillKey'
    and li.canonical_word_id=outcome.correct_word_id
    and li.row_status='active' and li.item_status in ('pending','pending_reteach');
  get diagnostics inserted_count=row_count;
  if inserted_count<1 then raise exception 'contextual homophone queued-item lineage changed'; end if;
  update public.adle_learning_items li
    set item_status=transition.destination_status,
      reteach_priority=not transition.all_context_choices_correct,
      updated_at=timezone('utc',now())
  from public.homophone_context_choice_item_transitions transition
  where transition.assignment_id=new.id and li.id=transition.learning_item_id;
  return new;
end $$;
create trigger homophone_context_choice_item_outcomes
  after update of status on public.daily_assignments
  for each row execute function public.apply_homophone_context_choice_item_outcomes_v1();

create function public.guard_homophone_contextual_initial_checkpoint_v1()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' and exists(select 1 from public.daily_assignments a
    where a.id=new.daily_assignment_id
      and a.compiled_lesson_snapshot#>>'{route,routeId}'='homophone_contextual_choice')
    and new.checkpoint_payload#>>'{state,stage}' is distinct from 'guided'
  then raise exception 'contextual homophone checkpoint must begin in guided stage'; end if;
  return new;
end $$;
create trigger homophone_contextual_initial_checkpoint_guard
  before insert on public.adle_specialist_stage_checkpoints
  for each row execute function public.guard_homophone_contextual_initial_checkpoint_v1();
revoke all on function public.apply_homophone_context_choice_item_outcomes_v1(),
  public.guard_homophone_contextual_initial_checkpoint_v1() from public,anon,authenticated;
grant execute on function public.apply_homophone_context_choice_item_outcomes_v1(),
  public.guard_homophone_contextual_initial_checkpoint_v1() to service_role;
commit;
