begin;

create table public.homophone_context_choice_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.daily_assignments(id) on delete restrict,
  assignment_item_id uuid not null references public.assignment_items(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  set_key text not null,
  set_revision integer not null,
  question_id text not null,
  sentence_with_blank text not null,
  correct_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  selected_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  is_correct boolean not null,
  evidence_mode text not null default 'independent_sentence' check (evidence_mode='independent_sentence'),
  created_at timestamptz not null default timezone('utc',now()),
  unique (assignment_id,question_id),
  unique (assignment_item_id),
  foreign key (set_key,set_revision) references public.homophone_contrast_sets(set_key,revision) on delete restrict
);
create index homophone_context_choice_attempts_child_skill_idx
  on public.homophone_context_choice_attempts(child_id,micro_skill_key,created_at);
create trigger homophone_context_choice_attempts_immutable
  before update or delete on public.homophone_context_choice_attempts
  for each row execute function public.prevent_adle_release_authority_mutation();
alter table public.homophone_context_choice_attempts enable row level security;
revoke all on public.homophone_context_choice_attempts from public,anon,authenticated;
grant all on public.homophone_context_choice_attempts to service_role;

create function public.adle_homophone_contextual_checkpoint_valid_v1(state jsonb,snapshot jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare response jsonb; question jsonb; idx integer:=0; guided jsonb:=state->'guided';
begin
  if jsonb_typeof(state) is distinct from 'object' or state->>'schemaVersion'<>'1'
    or state->>'stage' not in ('guided','context_check')
    or jsonb_typeof(state->'completed') is distinct from 'boolean'
    or jsonb_typeof(state->'responsesLocked') is distinct from 'boolean'
    or jsonb_typeof(state->'responses') is distinct from 'array'
    or jsonb_array_length(state->'responses')>jsonb_array_length(snapshot#>'{contextCheck,questions}')
    or jsonb_typeof(guided) is distinct from 'object'
  then return false; end if;
  for response in select value from jsonb_array_elements(state->'responses') loop
    question:=snapshot#>'{contextCheck,questions}'->idx;
    if response->>'questionId' is distinct from question->>'questionId'
      or not exists(select 1 from jsonb_array_elements_text(question->'optionWordIds') o
        where o.value=response->>'selectedWordId') then return false; end if;
    idx:=idx+1;
  end loop;
  if state->>'stage'='guided' then
    return state->'responses'='[]'::jsonb and state->'responsesLocked'='false'::jsonb
      and guided->'completed'='false'::jsonb and state->'completed'='false'::jsonb;
  end if;
  if guided->>'stage'<>'reflection' or guided->'completed'<>'true'::jsonb
    or guided->'binSortCompleted'<>'true'::jsonb
    or guided->'balloonCompleted'<>'true'::jsonb
    or nullif(btrim(guided->>'reflectionResponse'),'') is null
    or jsonb_typeof(guided->'coverAttempts') is distinct from 'object'
    or (select count(*) from jsonb_each(guided->'coverAttempts'))
      <>jsonb_array_length(snapshot#>'{guidedLesson,lesson,coverCheck}')
    or jsonb_typeof(guided->'dictationChecked') is distinct from 'object'
    or (select count(*) from jsonb_each(guided->'dictationChecked') where value='true'::jsonb)
      <>jsonb_array_length(snapshot#>'{guidedLesson,lesson,dictationPassages}')
    or (state->'responsesLocked'='true'::jsonb and
      jsonb_array_length(state->'responses')<>jsonb_array_length(snapshot#>'{contextCheck,questions}'))
  then return false; end if;
  return true;
exception when others then return false;
end $$;

create function public.guard_homophone_contextual_checkpoint_v1()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare snapshot jsonb; old_state jsonb; new_state jsonb; answer jsonb; k text; v jsonb;
begin
  select compiled_lesson_snapshot into snapshot from public.daily_assignments
    where id=new.daily_assignment_id;
  if snapshot#>>'{route,routeId}' is distinct from 'homophone_contextual_choice'
  then return new; end if;
  new_state:=new.checkpoint_payload->'state';
  if new.adapter_key is distinct from 'homophone_contextual_v1'
    or new.checkpoint_schema_version is distinct from 'homophone_contextual_progress_v1'
    or new.lesson_snapshot_fingerprint is distinct from snapshot->>'sourceFingerprint'
    or not public.adle_homophone_contextual_checkpoint_valid_v1(new_state,snapshot)
  then raise exception 'contextual homophone checkpoint invalid'; end if;
  if tg_op='INSERT' then
    if new_state->'completed' is distinct from 'false'::jsonb or new.completed_at is not null
    then raise exception 'contextual homophone checkpoint cannot start completed'; end if;
    return new;
  end if;
  old_state:=old.checkpoint_payload->'state';
  if old_state->'completed'='true'::jsonb then
    if old.checkpoint_payload is distinct from new.checkpoint_payload
    then raise exception 'contextual homophone completed checkpoint locked'; end if;
    return new;
  end if;
  if new_state->'completed'='true'::jsonb then
    if old_state->>'stage'<>'context_check'
      or old_state->'responsesLocked'<>'true'::jsonb
      or new_state is distinct from jsonb_set(old_state,'{completed}','true'::jsonb)
      or new.completed_at is null
    then raise exception 'contextual homophone Finish checkpoint invalid'; end if;
    return new;
  end if;
  if old_state->'responsesLocked'='true'::jsonb
    or (old_state->>'stage'='context_check' and new_state->>'stage'<>'context_check')
    or (old_state->>'stage'='context_check' and old_state->'guided' is distinct from new_state->'guided')
    or (old_state->>'stage'='guided' and new_state->>'stage'='context_check'
      and new_state->'guided' is distinct from jsonb_set(old_state->'guided','{completed}','true'::jsonb))
  then raise exception 'contextual homophone stage locked'; end if;
  if jsonb_array_length(new_state->'responses')<jsonb_array_length(old_state->'responses')
    or exists(select 1 from jsonb_array_elements(old_state->'responses') with ordinality o
      where new_state->'responses'->(o.ordinality-1)::integer is distinct from o.value)
  then raise exception 'contextual homophone sentence answer locked'; end if;
  for k,v in select * from jsonb_each(old_state#>'{guided,coverAttempts}') loop
    if new_state#>'{guided,coverAttempts}'->k is distinct from v
    then raise exception 'contextual homophone cover answer locked'; end if;
  end loop;
  for k,v in select * from jsonb_each(old_state#>'{guided,dictationChecked}') loop
    if v='true'::jsonb and (new_state#>'{guided,dictationChecked}'->k is distinct from v
      or new_state#>'{guided,dictationValues}'->k is distinct from old_state#>'{guided,dictationValues}'->k)
    then raise exception 'contextual homophone dictation answer locked'; end if;
  end loop;
  if old_state#>'{guided,binSortCompleted}'='true'::jsonb
    and new_state#>'{guided,binSortCompleted}' is distinct from 'true'::jsonb
    or old_state#>'{guided,balloonCompleted}'='true'::jsonb
    and new_state#>'{guided,balloonCompleted}' is distinct from 'true'::jsonb
  then raise exception 'contextual homophone guided completion locked'; end if;
  return new;
end $$;
create trigger homophone_contextual_checkpoint_guard
  before insert or update on public.adle_specialist_stage_checkpoints
  for each row execute function public.guard_homophone_contextual_checkpoint_v1();

create function public.complete_adle_homophone_contextual_v1(
  p_parent_user_id uuid,p_child_id uuid,p_assignment_id uuid,p_plan_date date,
  p_snapshot_fingerprint text,p_responses jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare h public.daily_assignments%rowtype; snapshot jsonb; state jsonb; question jsonb;
  response jsonb; selected_set jsonb; item public.assignment_items%rowtype;
  idx integer:=0; n integer; committed_at timestamptz:=timezone('utc',now());
begin
  select * into strict h from public.daily_assignments where id=p_assignment_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id
    and assignment_date=p_plan_date for update;
  snapshot:=h.compiled_lesson_snapshot;
  if not public.adle_homophone_contextual_snapshot_valid_v3(snapshot)
    or snapshot->>'sourceFingerprint' is distinct from p_snapshot_fingerprint
    or h.lesson_route_metadata#>>'{route,routeId}'<>'homophone_contextual_choice'
  then raise exception 'contextual homophone Finish snapshot invalid'; end if;
  select checkpoint_payload->'state' into strict state
    from public.adle_specialist_stage_checkpoints
    where daily_assignment_id=p_assignment_id and child_id=p_child_id
      and parent_user_id=p_parent_user_id and adapter_key='homophone_contextual_v1'
      and lesson_snapshot_fingerprint=p_snapshot_fingerprint for update;
  n:=jsonb_array_length(snapshot#>'{contextCheck,questions}');
  if not public.adle_homophone_contextual_checkpoint_valid_v1(state,snapshot)
    or state->>'stage'<>'context_check' or state->'responsesLocked'<>'true'::jsonb
    or state->'responses' is distinct from p_responses
    or jsonb_typeof(p_responses) is distinct from 'array'
    or jsonb_array_length(p_responses)<>n
    or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id
      and metadata->>'sectionKey'='lesson_context_choice')<>n
    or (select count(*) from public.homophone_assignment_contrast_sets
      where assignment_id=p_assignment_id)<>jsonb_array_length(snapshot->'selectedSets')
  then raise exception 'contextual homophone Finish incomplete'; end if;
  if h.status<>'completed' and (not public.adle_release_activation_allows_child_v2(
      (h.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,p_child_id)
    or not public.adle_route_activation_revision_is_current_v2(
      (h.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid,
      (h.lesson_route_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid,
      h.lesson_route_metadata#>>'{curriculumRelease,releaseManifestSha256}',
      h.lesson_route_metadata#>>'{curriculumRelease,dependencyFingerprint}'))
  then raise exception 'contextual homophone Finish activation changed'; end if;
  for response in select value from jsonb_array_elements(p_responses) loop
    question:=snapshot#>'{contextCheck,questions}'->idx;
    if response->>'questionId' is distinct from question->>'questionId'
      or not exists(select 1 from jsonb_array_elements_text(question->'optionWordIds') x
        where x.value=response->>'selectedWordId')
    then raise exception 'contextual homophone answer differs from frozen question'; end if;
    select * into strict item from public.assignment_items where daily_assignment_id=p_assignment_id
      and position=idx+1 and metadata->>'sectionKey'='lesson_context_choice' for update;
    if item.metadata->>'canonicalWordId' is distinct from question->>'correctWordId'
      or item.prompt_data->>'questionId' is distinct from question->>'questionId'
      or item.prompt_data->>'sentenceWithBlank' is distinct from question->>'sentenceWithBlank'
    then raise exception 'contextual homophone item binding changed'; end if;
    select value into strict selected_set from jsonb_array_elements(snapshot#>'{contextCheck,selectedSets}')
      where value->>'setId'=question->>'setId';
    if not exists(select 1 from public.homophone_assignment_contrast_sets x
      where x.assignment_id=p_assignment_id and x.set_key=selected_set->>'setKey'
        and x.revision=(selected_set->>'revision')::integer
        and x.semantic_fingerprint=selected_set->>'semanticFingerprint')
    then raise exception 'contextual homophone selected set binding changed'; end if;
    if h.status<>'completed' then
      insert into public.homophone_context_choice_attempts(
        assignment_id,assignment_item_id,child_id,parent_user_id,micro_skill_key,
        set_key,set_revision,question_id,sentence_with_blank,correct_word_id,
        selected_word_id,is_correct)
      values(p_assignment_id,item.id,p_child_id,p_parent_user_id,snapshot->>'microSkillKey',
        selected_set->>'setKey',(selected_set->>'revision')::integer,
        question->>'questionId',question->>'sentenceWithBlank',
        (question->>'correctWordId')::uuid,(response->>'selectedWordId')::uuid,
        response->>'selectedWordId'=question->>'correctWordId');
    elsif not exists(select 1 from public.homophone_context_choice_attempts x
      where x.assignment_id=p_assignment_id and x.assignment_item_id=item.id
        and x.micro_skill_key=snapshot->>'microSkillKey'
        and x.question_id=question->>'questionId'
        and x.correct_word_id=(question->>'correctWordId')::uuid
        and x.selected_word_id=(response->>'selectedWordId')::uuid)
    then raise exception 'contextual homophone Finish replay differs'; end if;
    idx:=idx+1;
  end loop;
  if h.status<>'completed' then
    update public.assignment_items set status='completed'
      where daily_assignment_id=p_assignment_id and metadata->>'sectionKey'='lesson_context_choice';
    update public.adle_specialist_stage_checkpoints
      set checkpoint_payload=jsonb_set(checkpoint_payload,'{state,completed}','true'::jsonb),
        completed_at=committed_at
      where daily_assignment_id=p_assignment_id;
    update public.daily_assignments set status='completed' where id=p_assignment_id;
  end if;
  if (select count(*) from public.homophone_context_choice_attempts
      where assignment_id=p_assignment_id)<>n
    or (select count(*) from public.assignment_items
      where daily_assignment_id=p_assignment_id and metadata->>'sectionKey'='lesson_context_choice'
        and status='completed')<>n
  then raise exception 'contextual homophone persisted Finish verification failed'; end if;
  return jsonb_build_object('status',case when h.status='completed'
    then 'already_completed' else 'completed' end,'committedAt',committed_at,
    'counts',jsonb_build_object('items',n,'contextChoiceAttempts',n));
end $$;

revoke all on function public.adle_homophone_contextual_checkpoint_valid_v1(jsonb,jsonb),
  public.complete_adle_homophone_contextual_v1(uuid,uuid,uuid,date,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.adle_homophone_contextual_checkpoint_valid_v1(jsonb,jsonb),
  public.complete_adle_homophone_contextual_v1(uuid,uuid,uuid,date,text,jsonb)
  to service_role;
commit;
