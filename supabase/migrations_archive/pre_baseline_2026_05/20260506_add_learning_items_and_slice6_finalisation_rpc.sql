begin;

create table if not exists public.learning_items (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  source_writing_issue_id uuid not null references public.writing_issues(id) on delete cascade,
  micro_skill_key text not null default 'unknown',
  theme_key text,
  progress_state text not null default 'golden_nugget',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_items_progress_state_check'
  ) then
    alter table public.learning_items
      add constraint learning_items_progress_state_check
      check (
        progress_state in ('golden_nugget', 'in_machine', 'gold_bar')
      );
  end if;
end $$;

create unique index if not exists learning_items_source_issue_idx
  on public.learning_items (source_writing_issue_id);

create index if not exists learning_items_child_active_idx
  on public.learning_items (child_id, is_active, updated_at desc);

create index if not exists learning_items_micro_skill_idx
  on public.learning_items (child_id, micro_skill_key, updated_at desc);

grant select, insert, update, delete on public.learning_items to authenticated;

alter table public.learning_items enable row level security;

drop policy if exists learning_items_parent_access on public.learning_items;
create policy learning_items_parent_access
on public.learning_items
for all
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

create or replace function public.finalise_writing_issue_classification_and_learning_item(
  p_writing_issue_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid,
  p_final_classification text
)
returns jsonb
language plpgsql
as $$
declare
  v_issue public.writing_issues%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_learning_item_id uuid;
  v_created_learning_item boolean := false;
begin
  if p_final_classification not in (
    'checking_only',
    'fragile_knowledge',
    'concept_gap',
    'transfer_failure',
    'not_an_issue'
  ) then
    raise exception 'Choose a valid final classification before saving.';
  end if;

  select *
  into v_issue
  from public.writing_issues
  where id = p_writing_issue_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
  for update;

  if not found then
    raise exception 'That writing issue no longer exists.';
  end if;

  if v_issue.issue_status = 'finalised' or v_issue.final_classification is not null then
    raise exception 'That writing issue has already been finalised.';
  end if;

  if v_issue.issue_status <> 'child_responded' then
    raise exception 'Only child responses can be final-classified in this slice.';
  end if;

  update public.writing_issues
  set
    final_classification = p_final_classification,
    issue_status = 'finalised',
    final_classified_at = v_now,
    updated_at = v_now
  where id = v_issue.id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id;

  if p_final_classification in ('fragile_knowledge', 'concept_gap', 'transfer_failure') then
    insert into public.learning_items (
      child_id,
      parent_user_id,
      source_writing_issue_id,
      micro_skill_key,
      theme_key,
      progress_state,
      is_active,
      metadata,
      created_at,
      updated_at
    )
    values (
      v_issue.child_id,
      v_issue.parent_user_id,
      v_issue.id,
      v_issue.micro_skill_key,
      v_issue.theme_key,
      'golden_nugget',
      true,
      jsonb_build_object(
        'created_from_final_classification', p_final_classification,
        'source_issue_status_at_creation', 'finalised'
      ),
      v_now,
      v_now
    )
    on conflict (source_writing_issue_id) do nothing
    returning id into v_learning_item_id;

    if v_learning_item_id is not null then
      v_created_learning_item := true;
    else
      select id
      into v_learning_item_id
      from public.learning_items
      where source_writing_issue_id = v_issue.id
        and parent_user_id = p_parent_user_id
      limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'created_learning_item', v_created_learning_item,
    'learning_item_id', v_learning_item_id,
    'progress_state', case when v_learning_item_id is not null then 'golden_nugget' else null end
  );
end;
$$;

grant execute on function public.finalise_writing_issue_classification_and_learning_item(uuid, uuid, uuid, text) to authenticated;

commit;
