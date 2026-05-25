begin;

create or replace function public.initial_learning_item_competency_for_final_classification(
  p_final_classification text
)
returns integer
language sql
immutable
as $$
  select case p_final_classification
    when 'concept_gap' then 1
    when 'fragile_knowledge' then 2
    when 'transfer_failure' then 3
    else null
  end;
$$;

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
  v_catalog public.micro_skill_catalog%rowtype;
  v_existing_learning_item public.learning_items%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_learning_item_id uuid;
  v_created_learning_item boolean := false;
  v_reused_learning_item boolean := false;
  v_initial_competency_level integer;
  v_learning_item_blocked_reason text := null;
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

  select *
  into v_catalog
  from public.micro_skill_catalog
  where micro_skill_key = v_issue.micro_skill_key
    and is_active = true
  limit 1;

  v_initial_competency_level :=
    public.initial_learning_item_competency_for_final_classification(
      p_final_classification
    );

  update public.writing_issues
  set
    final_classification = p_final_classification,
    issue_status = 'finalised',
    final_classified_at = v_now,
    updated_at = v_now
  where id = v_issue.id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id;

  if v_initial_competency_level is not null then
    if v_catalog.id is null or not v_catalog.is_assignable then
      v_learning_item_blocked_reason := 'uncatalogued_or_non_assignable_micro_skill';
    else
      select *
      into v_existing_learning_item
      from public.learning_items
      where child_id = v_issue.child_id
        and parent_user_id = v_issue.parent_user_id
        and is_active = true
        and micro_skill_key = v_issue.micro_skill_key
        and practice_route = v_catalog.practice_route
      order by updated_at desc, created_at desc, id desc
      limit 1
      for update;

      if found then
        v_learning_item_id := v_existing_learning_item.id;
        v_reused_learning_item := true;

        update public.learning_items
        set
          current_competency_level = coalesce(
            current_competency_level,
            v_initial_competency_level
          ),
          updated_at = v_now
        where id = v_existing_learning_item.id;

        insert into public.learning_item_issue_links (
          learning_item_id,
          writing_issue_id,
          child_id,
          parent_user_id,
          link_role,
          metadata,
          created_at,
          updated_at
        )
        values (
          v_learning_item_id,
          v_issue.id,
          v_issue.child_id,
          v_issue.parent_user_id,
          'supporting',
          jsonb_build_object(
            'created_from_final_classification', p_final_classification
          ),
          v_now,
          v_now
        )
        on conflict (learning_item_id, writing_issue_id) do nothing;
      else
        insert into public.learning_items (
          child_id,
          parent_user_id,
          source_writing_issue_id,
          micro_skill_key,
          mastery_domain_key,
          skill_family_key,
          skill_cluster_key,
          practice_route,
          current_competency_level,
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
          v_catalog.mastery_domain_key,
          v_catalog.skill_family_key,
          v_catalog.skill_cluster_key,
          v_catalog.practice_route,
          v_initial_competency_level,
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

          insert into public.learning_item_issue_links (
            learning_item_id,
            writing_issue_id,
            child_id,
            parent_user_id,
            link_role,
            metadata,
            created_at,
            updated_at
          )
          values (
            v_learning_item_id,
            v_issue.id,
            v_issue.child_id,
            v_issue.parent_user_id,
            'origin',
            jsonb_build_object(
              'created_from_final_classification', p_final_classification
            ),
            v_now,
            v_now
          )
          on conflict (learning_item_id, writing_issue_id) do nothing;
        else
          select id
          into v_learning_item_id
          from public.learning_items
          where source_writing_issue_id = v_issue.id
            and parent_user_id = p_parent_user_id
          limit 1;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'created_learning_item', v_created_learning_item,
    'reused_learning_item', v_reused_learning_item,
    'learning_item_id', v_learning_item_id,
    'learning_item_blocked_reason', v_learning_item_blocked_reason,
    'progress_state', case when v_learning_item_id is not null then 'golden_nugget' else null end
  );
end;
$$;

grant execute on function public.initial_learning_item_competency_for_final_classification(text) to authenticated;
grant execute on function public.finalise_writing_issue_classification_and_learning_item(uuid, uuid, uuid, text) to authenticated;

commit;
