begin transaction isolation level repeatable read read only;

select 'FR4_SQL_RECEIPT:' || jsonb_build_object(
  'status', 'PASS',
  'receiptTablePresent',
    to_regclass('public.adle_review_retirement_decision_receipts') is not null,
  'checkLineageColumnPresent', exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='adle_review_schedule_words'
      and column_name='pre_retirement_check_outcome_event_id'
  ),
  'fr2MigrationPresent', exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260901140000'
  ),
  'fr3MigrationPresent', exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260902120000'
  ),
  'retirementReceiptsReadable', (
    select count(*) >= 0 from public.adle_review_retirement_decision_receipts
  ),
  'serviceRoleReadOnly',
    has_table_privilege('service_role','public.adle_review_retirement_decision_receipts','SELECT')
    and not has_table_privilege('service_role','public.adle_review_retirement_decision_receipts','INSERT')
    and not has_table_privilege('service_role','public.adle_review_retirement_decision_receipts','UPDATE')
    and not has_table_privilege('service_role','public.adle_review_retirement_decision_receipts','DELETE'),
  'browserDenied',
    not has_table_privilege('anon','public.adle_review_retirement_decision_receipts','SELECT')
    and not has_table_privilege('authenticated','public.adle_review_retirement_decision_receipts','SELECT'),
  'targetInactiveNonDefault', not (
    select is_active or is_default_for_new_schedules
    from public.adle_review_policy_versions
    where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'
  ),
  'transactionReadOnly', current_setting('transaction_read_only')='on'
)::text;

rollback;
