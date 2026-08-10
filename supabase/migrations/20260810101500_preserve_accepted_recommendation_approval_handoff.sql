-- Preserve an accepted canonical recommendation as durable admin-handoff
-- authority while the parent atomically finalises saved reason drafts.
--
-- The read model already treats accepted recommendations as durable handoff
-- truth. This forward replacement aligns the approval transaction with that
-- contract without rewriting the applied 20260807173000 migration.

begin;

create or replace function public.approve_task_submission_with_reason_drafts(
  p_submission_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.task_submissions%rowtype;
  v_issue public.writing_issues%rowtype;
  v_issue_result jsonb;
  v_issue_results jsonb := '[]'::jsonb;
  v_issue_count integer := 0;
  v_now timestamptz := timezone('utc', now());
  v_is_learning_reason boolean;
  v_has_known_route boolean;
  v_has_admin_handoff boolean;
begin
  if auth.uid() is not null and auth.uid() <> p_parent_user_id then
    raise exception 'Submissions may only be approved by the owning parent.';
  end if;

  select *
  into v_submission
  from public.task_submissions
  where id = p_submission_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
  for update;

  if not found then
    raise exception 'That submission no longer exists.';
  end if;

  if v_submission.parent_review_status = 'approved' then
    return jsonb_build_object(
      'submission_id', v_submission.id,
      'already_approved', true,
      'issue_results', v_issue_results
    );
  end if;

  for v_issue in
    select issue.*
    from public.writing_issues issue
    where issue.parent_user_id = p_parent_user_id
      and issue.child_id = p_child_id
      and issue.issue_status = 'child_responded'
      and issue.final_classification is null
      and exists (
        select 1
        from public.writing_issue_correction_attempts attempt
        join public.task_submissions attempt_submission
          on attempt_submission.id = attempt.task_submission_id
        where attempt.writing_issue_id = issue.id
          and attempt.parent_user_id = p_parent_user_id
          and attempt.child_id = p_child_id
          and attempt_submission.parent_user_id = p_parent_user_id
          and attempt_submission.child_id = p_child_id
          and attempt_submission.task_id = v_submission.task_id
      )
    order by issue.id
    for update of issue
  loop
    v_issue_count := v_issue_count + 1;

    if v_issue.draft_final_classification is null then
      raise exception 'Every returned correction needs a saved reason before approval.';
    end if;

    v_is_learning_reason := v_issue.draft_final_classification in (
      'fragile_knowledge',
      'concept_gap',
      'transfer_failure'
    );

    if v_is_learning_reason then
      v_has_known_route :=
        coalesce(v_issue.metadata -> 'known_match_auto_resolution' ->> 'authority', '') = 'known_match'
        and coalesce(v_issue.metadata -> 'known_match_auto_resolution' ->> 'micro_skill_key', '') = v_issue.micro_skill_key
        and exists (
          select 1
          from public.spelling_canonical_mappings mapping
          join public.micro_skill_catalog micro_skill
            on micro_skill.micro_skill_key = mapping.micro_skill_key
            and micro_skill.is_active = true
            and micro_skill.is_assignable = true
          where mapping.id::text = v_issue.metadata -> 'known_match_auto_resolution' ->> 'canonical_mapping_id'
            and mapping.mapping_status = 'active'
            and mapping.resolver_visibility_status = 'visible'
            and mapping.micro_skill_key = v_issue.micro_skill_key
        );

      v_has_admin_handoff := exists (
        select 1
        from public.spelling_catalog_review_cases review_case
        where review_case.parent_user_id = p_parent_user_id
          and review_case.child_id = p_child_id
          and review_case.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
          and review_case.case_status = 'open'
      ) or exists (
        select 1
        from public.spelling_canonical_mapping_recommendations recommendation
        join public.parent_verified_spelling_candidate_mappings candidate
          on candidate.id = recommendation.candidate_mapping_id
        where candidate.parent_user_id = p_parent_user_id
          and candidate.child_id = p_child_id
          and candidate.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
          and recommendation.recommendation_status in ('recommended', 'pending_admin_review', 'accepted')
      );

      if not v_has_known_route and not v_has_admin_handoff then
        raise exception 'Every learning reason needs a durable known route or admin handoff before approval.';
      end if;
    end if;
  end loop;

  for v_issue in
    select issue.*
    from public.writing_issues issue
    where issue.parent_user_id = p_parent_user_id
      and issue.child_id = p_child_id
      and issue.issue_status = 'child_responded'
      and issue.final_classification is null
      and exists (
        select 1
        from public.writing_issue_correction_attempts attempt
        join public.task_submissions attempt_submission
          on attempt_submission.id = attempt.task_submission_id
        where attempt.writing_issue_id = issue.id
          and attempt.parent_user_id = p_parent_user_id
          and attempt.child_id = p_child_id
          and attempt_submission.parent_user_id = p_parent_user_id
          and attempt_submission.child_id = p_child_id
          and attempt_submission.task_id = v_submission.task_id
      )
    order by issue.id
  loop
    select public.finalise_writing_issue_classification_and_learning_item(
      v_issue.id,
      p_parent_user_id,
      p_child_id,
      v_issue.draft_final_classification
    )
    into v_issue_result;

    update public.writing_issues
    set draft_final_classification = null
    where id = v_issue.id
      and parent_user_id = p_parent_user_id
      and child_id = p_child_id
      and final_classification = v_issue.draft_final_classification;

    v_issue_results := v_issue_results || jsonb_build_array(
      coalesce(v_issue_result, '{}'::jsonb) || jsonb_build_object(
        'writing_issue_id', v_issue.id,
        'final_classification', v_issue.draft_final_classification
      )
    );
  end loop;

  update public.task_submissions
  set
    parent_review_status = 'approved',
    parent_reviewed_at = v_now
  where id = v_submission.id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id;

  return jsonb_build_object(
    'submission_id', v_submission.id,
    'already_approved', false,
    'finalised_issue_count', v_issue_count,
    'issue_results', v_issue_results,
    'approved_at', v_now
  );
end;
$$;


revoke all on function public.approve_task_submission_with_reason_drafts(
  uuid, uuid, uuid
) from public, anon;
grant execute on function public.approve_task_submission_with_reason_drafts(
  uuid, uuid, uuid
) to authenticated, service_role;

commit;
