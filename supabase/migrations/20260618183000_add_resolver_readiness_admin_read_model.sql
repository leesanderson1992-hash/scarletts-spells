begin;

create or replace function public.get_spelling_canonical_resolver_readiness_admin(
  p_limit integer default 25,
  p_offset integer default 0,
  p_readiness_state text default null
) returns table (
  total_count bigint,
  readiness_row jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  with params as (
    select
      least(greatest(coalesce(p_limit, 25), 1), 100) as page_limit,
      greatest(coalesce(p_offset, 0), 0) as page_offset,
      nullif(btrim(coalesce(p_readiness_state, '')), '') as requested_state
  ),
  candidates as (
    select
      m.*,
      ms.display_name as micro_skill_display_name,
      ms.mastery_domain_key as micro_skill_mastery_domain_key,
      ms.is_active as micro_skill_is_active,
      ms.is_assignable as micro_skill_is_assignable,
      seed.row_status as seed_row_status,
      seed.source_row_number as seed_source_row_number,
      seed.source_row_id as seed_source_row_id,
      seed.source_dataset as seed_source_dataset,
      seed.source_note as seed_source_note,
      seed.reviewed_by_admin_user_id as seed_reviewed_by_admin_user_id,
      seed.reviewed_by_admin_email as seed_reviewed_by_admin_email,
      seed.reviewed_at as seed_reviewed_at,
      seed.canonical_mapping_id as seed_canonical_mapping_id,
      batch.id as seed_batch_id,
      batch.batch_name as seed_batch_name,
      batch.source_name as seed_batch_source_name,
      batch.source_dataset as seed_batch_source_dataset,
      batch.source_license_note as seed_batch_source_license_note,
      batch.source_file_name as seed_batch_source_file_name,
      batch.source_file_sha256 as seed_batch_source_file_sha256,
      batch.dry_run_report_schema_version as seed_batch_dry_run_report_schema_version,
      batch.dry_run_report_sha256 as seed_batch_dry_run_report_sha256,
      rec.recommendation_status as recommendation_status,
      rec.source_row_type as recommendation_source_row_type,
      rec.source_provenance as recommendation_source_provenance,
      rec.parent_verification_id as recommendation_parent_verification_id,
      rec.candidate_mapping_id as recommendation_candidate_mapping_id,
      rec.reviewed_by_admin_user_id as recommendation_reviewed_by_admin_user_id,
      rec.reviewed_by_admin_email as recommendation_reviewed_by_admin_email,
      rec.reviewed_at as recommendation_reviewed_at,
      rec.canonical_mapping_id as recommendation_canonical_mapping_id
    from public.spelling_canonical_mappings m
    left join public.micro_skill_catalog ms
      on ms.micro_skill_key = m.micro_skill_key
    left join public.spelling_seed_import_rows seed
      on seed.id = m.source_seed_import_row_id
    left join public.spelling_seed_import_batches batch
      on batch.id = seed.batch_id
    left join public.spelling_canonical_mapping_recommendations rec
      on rec.id = m.source_recommendation_id
    where m.mapping_status = 'active'
      and m.resolver_visibility_status = 'hidden'
  ),
  enriched as (
    select
      c.*,
      coalesce(event_summary.has_created_event, false) as has_created_event,
      coalesce(event_summary.has_seed_import_adopted_event, false) as has_seed_import_adopted_event,
      coalesce(event_summary.has_pcrm_adopted_event, false) as has_pcrm_adopted_event,
      coalesce(event_summary.event_count, 0) as event_count,
      event_summary.latest_event_at,
      coalesce(event_summary.latest_events, '[]'::jsonb) as latest_events,
      exists (
        select 1
        from public.spelling_canonical_mappings peer
        where peer.id <> c.id
          and peer.mapping_status = 'active'
          and peer.dialect_code = c.dialect_code
          and peer.misspelling_normalized = c.misspelling_normalized
          and peer.correct_spelling_normalized = c.correct_spelling_normalized
          and peer.micro_skill_key <> c.micro_skill_key
      ) as has_active_exact_pair_different_micro_skill,
      exists (
        select 1
        from public.spelling_canonical_mappings peer
        where peer.id <> c.id
          and peer.mapping_status = 'active'
          and peer.dialect_code = c.dialect_code
          and peer.misspelling_normalized = c.misspelling_normalized
          and peer.correct_spelling_normalized <> c.correct_spelling_normalized
      ) as has_active_same_misspelling_conflicting_correction,
      exists (
        select 1
        from public.spelling_canonical_mappings peer
        where peer.id <> c.id
          and peer.mapping_status <> 'active'
          and peer.dialect_code = c.dialect_code
          and peer.misspelling_normalized = c.misspelling_normalized
          and peer.correct_spelling_normalized = c.correct_spelling_normalized
      ) as has_inactive_exact_pair_historical_mapping
    from candidates c
    left join lateral (
      select
        bool_or(e.event_type = 'created' and e.new_status = 'active') as has_created_event,
        bool_or(e.event_type = 'seed_import_adopted') as has_seed_import_adopted_event,
        bool_or(e.event_type = 'pcrm_adopted') as has_pcrm_adopted_event,
        count(*)::integer as event_count,
        max(e.created_at) as latest_event_at,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', recent.id,
                'mapping_id', recent.mapping_id,
                'event_type', recent.event_type,
                'previous_status', recent.previous_status,
                'new_status', recent.new_status,
                'previous_resolver_visibility_status', recent.previous_resolver_visibility_status,
                'new_resolver_visibility_status', recent.new_resolver_visibility_status,
                'admin_user_id', recent.admin_user_id,
                'admin_email', recent.admin_email,
                'source_case_id', recent.source_case_id,
                'source_decision_id', recent.source_decision_id,
                'source_recommendation_id', recent.source_recommendation_id,
                'source_seed_import_row_id', recent.source_seed_import_row_id,
                'note', recent.note,
                'created_at', recent.created_at
              )
              order by recent.created_at desc
            )
            from (
              select *
              from public.spelling_canonical_mapping_events e_recent
              where e_recent.mapping_id = c.id
              order by e_recent.created_at desc
              limit 3
            ) recent
          ),
          '[]'::jsonb
        ) as latest_events
      from public.spelling_canonical_mapping_events e
      where e.mapping_id = c.id
    ) event_summary on true
  ),
  classified as (
    select
      e.*,
      case
        when e.source_seed_import_row_id is not null then 'seed_import_4f_adoption'
        when e.source_recommendation_id is not null then 'pcrm_adoption'
        when e.source_case_id is not null and e.source_decision_id is not null then 'catalog_canonical_review'
        else 'unknown'
      end as readiness_source,
      (
        nullif(btrim(coalesce(e.misspelling_normalized, '')), '') is null
        or nullif(btrim(coalesce(e.correct_spelling_normalized, '')), '') is null
        or btrim(e.misspelling_normalized) = btrim(e.correct_spelling_normalized)
        or nullif(btrim(coalesce(e.dialect_code, '')), '') is null
        or e.micro_skill_key is null
        or e.micro_skill_mastery_domain_key is distinct from 'D4'
        or e.micro_skill_is_active is distinct from true
        or e.micro_skill_is_assignable is distinct from true
        or not e.has_created_event
        or e.has_active_exact_pair_different_micro_skill
        or e.has_inactive_exact_pair_historical_mapping
        or (
          e.source_seed_import_row_id is not null
          and (
            e.seed_row_status is distinct from 'adopted_hidden_canonical'
            or e.seed_canonical_mapping_id is distinct from e.id
            or not e.has_seed_import_adopted_event
          )
        )
        or (
          e.source_recommendation_id is not null
          and (
            e.recommendation_status is distinct from 'accepted'
            or e.recommendation_canonical_mapping_id is distinct from e.id
            or not e.has_pcrm_adopted_event
          )
        )
        or (
          e.source_seed_import_row_id is null
          and e.source_recommendation_id is null
          and not (e.source_case_id is not null and e.source_decision_id is not null)
        )
      ) as has_blocking_readiness_reason
    from enriched e
  ),
  filtered as (
    select
      c.*,
      case
        when c.has_blocking_readiness_reason then 'blocked'
        when c.has_active_same_misspelling_conflicting_correction then 'needs_manual_authority_review'
        else 'eligible_for_visibility_review'
      end as readiness_state
    from classified c
    cross join params p
    where p.requested_state is null
      or p.requested_state = 'all'
      or p.requested_state = case
        when c.has_blocking_readiness_reason then 'blocked'
        when c.has_active_same_misspelling_conflicting_correction then 'needs_manual_authority_review'
        else 'eligible_for_visibility_review'
      end
  ),
  counted as (
    select count(*)::bigint as total_count
    from filtered
  ),
  paged as (
    select f.*
    from filtered f
    cross join params p
    order by f.updated_at desc, f.id
    limit (select page_limit from params)
    offset (select page_offset from params)
  )
  select
    counted.total_count,
    jsonb_build_object(
      'readiness_state', paged.readiness_state,
      'readiness_source', paged.readiness_source,
      'mapping', jsonb_build_object(
        'id', paged.id,
        'misspelling_normalized', paged.misspelling_normalized,
        'correct_spelling_normalized', paged.correct_spelling_normalized,
        'micro_skill_key', paged.micro_skill_key,
        'mapping_status', paged.mapping_status,
        'resolver_visibility_status', paged.resolver_visibility_status,
        'dialect_code', paged.dialect_code,
        'normalization_version', paged.normalization_version,
        'source_case_id', paged.source_case_id,
        'source_decision_id', paged.source_decision_id,
        'source_recommendation_id', paged.source_recommendation_id,
        'source_candidate_mapping_id', paged.source_candidate_mapping_id,
        'source_parent_verification_id', paged.source_parent_verification_id,
        'source_seed_import_row_id', paged.source_seed_import_row_id,
        'created_by_admin_user_id', paged.created_by_admin_user_id,
        'created_by_admin_email', paged.created_by_admin_email,
        'deactivated_by_admin_user_id', paged.deactivated_by_admin_user_id,
        'deactivated_by_admin_email', paged.deactivated_by_admin_email,
        'decision_note', paged.decision_note,
        'created_at', paged.created_at,
        'updated_at', paged.updated_at
      ),
      'micro_skill', case
        when paged.micro_skill_key is null then null
        else jsonb_build_object(
          'micro_skill_key', paged.micro_skill_key,
          'display_name', paged.micro_skill_display_name,
          'mastery_domain_key', paged.micro_skill_mastery_domain_key,
          'is_active', paged.micro_skill_is_active,
          'is_assignable', paged.micro_skill_is_assignable
        )
      end,
      'event_summary', jsonb_build_object(
        'has_created_event', paged.has_created_event,
        'has_seed_import_adopted_event', paged.has_seed_import_adopted_event,
        'has_pcrm_adopted_event', paged.has_pcrm_adopted_event,
        'latest_event_at', paged.latest_event_at,
        'event_count', paged.event_count,
        'latest_events', paged.latest_events
      ),
      'lineage_summary', jsonb_build_object(
        'seed_import', case
          when paged.source_seed_import_row_id is null then null
          else jsonb_build_object(
            'id', paged.source_seed_import_row_id,
            'row_status', paged.seed_row_status,
            'canonical_mapping_id', paged.seed_canonical_mapping_id,
            'source_row_number', paged.seed_source_row_number,
            'source_row_id', paged.seed_source_row_id,
            'source_dataset', paged.seed_source_dataset,
            'source_note', paged.seed_source_note,
            'reviewed_by_admin_user_id', paged.seed_reviewed_by_admin_user_id,
            'reviewed_by_admin_email', paged.seed_reviewed_by_admin_email,
            'reviewed_at', paged.seed_reviewed_at,
            'batch', case
              when paged.seed_batch_id is null then null
              else jsonb_build_object(
                'id', paged.seed_batch_id,
                'batch_name', paged.seed_batch_name,
                'source_name', paged.seed_batch_source_name,
                'source_dataset', paged.seed_batch_source_dataset,
                'source_license_note', paged.seed_batch_source_license_note,
                'source_file_name', paged.seed_batch_source_file_name,
                'source_file_sha256', paged.seed_batch_source_file_sha256,
                'dry_run_report_schema_version', paged.seed_batch_dry_run_report_schema_version,
                'dry_run_report_sha256', paged.seed_batch_dry_run_report_sha256
              )
            end
          )
        end,
        'pcrm', case
          when paged.source_recommendation_id is null then null
          else jsonb_build_object(
            'id', paged.source_recommendation_id,
            'recommendation_status', paged.recommendation_status,
            'canonical_mapping_id', paged.recommendation_canonical_mapping_id,
            'source_row_type', paged.recommendation_source_row_type,
            'source_provenance', paged.recommendation_source_provenance,
            'parent_verification_id', paged.recommendation_parent_verification_id,
            'candidate_mapping_id', paged.recommendation_candidate_mapping_id,
            'reviewed_by_admin_user_id', paged.recommendation_reviewed_by_admin_user_id,
            'reviewed_by_admin_email', paged.recommendation_reviewed_by_admin_email,
            'reviewed_at', paged.recommendation_reviewed_at
          )
        end,
        'catalog', jsonb_build_object(
          'source_case_id', paged.source_case_id,
          'source_decision_id', paged.source_decision_id,
          'has_catalog_case_decision_lineage', paged.source_case_id is not null and paged.source_decision_id is not null
        )
      ),
      'conflict_summary', jsonb_build_object(
        'has_active_exact_pair_different_micro_skill', paged.has_active_exact_pair_different_micro_skill,
        'has_active_same_misspelling_conflicting_correction', paged.has_active_same_misspelling_conflicting_correction,
        'has_inactive_exact_pair_historical_mapping', paged.has_inactive_exact_pair_historical_mapping
      )
    ) as readiness_row
  from paged
  cross join counted;
$$;

revoke all on function public.get_spelling_canonical_resolver_readiness_admin(
  integer,
  integer,
  text
) from public;

revoke all on function public.get_spelling_canonical_resolver_readiness_admin(
  integer,
  integer,
  text
) from anon;

revoke all on function public.get_spelling_canonical_resolver_readiness_admin(
  integer,
  integer,
  text
) from authenticated;

grant execute on function public.get_spelling_canonical_resolver_readiness_admin(
  integer,
  integer,
  text
) to service_role;

commit;
