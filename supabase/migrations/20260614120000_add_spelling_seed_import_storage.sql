begin;

create table if not exists public.spelling_seed_import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  source_name text not null,
  source_dataset text,
  source_url text,
  source_license_note text not null,
  source_file_name text not null,
  source_file_sha256 text not null,
  input_format text not null default 'csv',
  normalization_version text not null default 'spelling_normalize_v1',
  dry_run_report_schema_version text not null,
  dry_run_report_path text,
  dry_run_report_artifact_ref text,
  dry_run_report_sha256 text not null,
  dry_run_generated_at timestamptz not null,
  validation_context jsonb not null default '{}'::jsonb,
  batch_status text not null default 'pending_candidate_review',
  total_row_count integer not null default 0,
  candidate_review_row_count integer not null default 0,
  manual_review_row_count integer not null default 0,
  rejected_row_count integer not null default 0,
  duplicate_row_count integer not null default 0,
  conflict_row_count integer not null default 0,
  created_by_admin_user_id uuid,
  created_by_admin_email text,
  closed_by_admin_user_id uuid,
  closed_by_admin_email text,
  closed_at timestamptz,
  close_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint spelling_seed_import_batches_name_check
    check (btrim(batch_name) <> ''),
  constraint spelling_seed_import_batches_source_check
    check (
      btrim(source_name) <> ''
      and btrim(source_license_note) <> ''
      and btrim(source_file_name) <> ''
      and btrim(source_file_sha256) <> ''
    ),
  constraint spelling_seed_import_batches_input_format_check
    check (input_format = any (array['csv', 'xlsx'])),
  constraint spelling_seed_import_batches_normalization_version_check
    check (btrim(normalization_version) <> ''),
  constraint spelling_seed_import_batches_report_check
    check (
      btrim(dry_run_report_schema_version) <> ''
      and btrim(dry_run_report_sha256) <> ''
    ),
  constraint spelling_seed_import_batches_status_check
    check (
      batch_status = any (
        array[
          'pending_candidate_review',
          'review_in_progress',
          'completed',
          'completed_with_warnings',
          'cancelled',
          'superseded',
          'quarantined'
        ]
      )
    ),
  constraint spelling_seed_import_batches_counts_check
    check (
      total_row_count >= 0
      and candidate_review_row_count >= 0
      and manual_review_row_count >= 0
      and rejected_row_count >= 0
      and duplicate_row_count >= 0
      and conflict_row_count >= 0
      and candidate_review_row_count <= total_row_count
      and manual_review_row_count <= total_row_count
      and rejected_row_count <= total_row_count
      and duplicate_row_count <= total_row_count
      and conflict_row_count <= total_row_count
    ),
  constraint spelling_seed_import_batches_jsonb_check
    check (
      jsonb_typeof(validation_context) = 'object'
      and jsonb_typeof(metadata) = 'object'
    ),
  constraint spelling_seed_import_batches_closed_check
    check (
      (
        batch_status in (
          'completed',
          'completed_with_warnings',
          'cancelled',
          'superseded',
          'quarantined'
        )
        and closed_at is not null
      )
      or (
        batch_status in (
          'pending_candidate_review',
          'review_in_progress'
        )
      )
    )
);

create table if not exists public.spelling_seed_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.spelling_seed_import_batches(id) on delete restrict,
  source_row_number integer not null,
  source_row_id text,
  source_row_hash text,
  raw_misspelling text not null,
  raw_correction text not null,
  misspelling_normalized text not null,
  correct_spelling_normalized text not null,
  dialect_code text not null default 'en-GB',
  normalization_version text not null default 'spelling_normalize_v1',
  suggested_micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  source_confidence_raw text,
  source_confidence_normalized numeric,
  source_note text not null,
  source_url text,
  source_dataset text,
  age_band text,
  pattern_hint text,
  route_hint text,
  dry_run_bucket text not null,
  dry_run_report_row_number integer,
  dry_run_recommended_next_action text,
  row_status text not null default 'pending_candidate_review',
  status_reason text,
  validation_reasons jsonb not null default '[]'::jsonb,
  blocking_errors jsonb not null default '[]'::jsonb,
  manual_review_warnings jsonb not null default '[]'::jsonb,
  canonical_match_ids jsonb not null default '[]'::jsonb,
  canonical_conflict_ids jsonb not null default '[]'::jsonb,
  supporting_evidence_ids jsonb not null default '{}'::jsonb,
  supporting_evidence_counts jsonb not null default '{}'::jsonb,
  duplicate_group_key text,
  conflict_group_key text,
  duplicate_of_seed_import_row_id uuid references public.spelling_seed_import_rows(id) on delete set null,
  reviewed_by_admin_user_id uuid,
  reviewed_by_admin_email text,
  reviewed_at timestamptz,
  review_note text,
  canonical_mapping_id uuid references public.spelling_canonical_mappings(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint spelling_seed_import_rows_source_row_number_check
    check (source_row_number > 0),
  constraint spelling_seed_import_rows_raw_words_check
    check (
      btrim(raw_misspelling) <> ''
      and btrim(raw_correction) <> ''
    ),
  constraint spelling_seed_import_rows_normalized_pair_check
    check (
      btrim(misspelling_normalized) <> ''
      and btrim(correct_spelling_normalized) <> ''
      and btrim(misspelling_normalized) <> btrim(correct_spelling_normalized)
    ),
  constraint spelling_seed_import_rows_dialect_code_check
    check (btrim(dialect_code) <> ''),
  constraint spelling_seed_import_rows_normalization_version_check
    check (btrim(normalization_version) <> ''),
  constraint spelling_seed_import_rows_skill_key_check
    check (btrim(suggested_micro_skill_key) <> ''),
  constraint spelling_seed_import_rows_confidence_check
    check (
      source_confidence_normalized is null
      or (
        source_confidence_normalized >= 0
        and source_confidence_normalized <= 1
      )
    ),
  constraint spelling_seed_import_rows_source_note_check
    check (btrim(source_note) <> ''),
  constraint spelling_seed_import_rows_dry_run_bucket_check
    check (
      dry_run_bucket = any (
        array[
          'safe_for_candidate_review',
          'manual_review_required',
          'rejected_from_import'
        ]
      )
    ),
  constraint spelling_seed_import_rows_status_check
    check (
      row_status = any (
        array[
          'pending_candidate_review',
          'manual_review_required',
          'kept_pending',
          'rejected',
          'duplicate',
          'conflict_blocked',
          'nominated_for_canonical_adoption',
          'adopted_hidden_canonical',
          'superseded'
        ]
      )
    ),
  constraint spelling_seed_import_rows_jsonb_check
    check (
      jsonb_typeof(validation_reasons) = 'array'
      and jsonb_typeof(blocking_errors) = 'array'
      and jsonb_typeof(manual_review_warnings) = 'array'
      and jsonb_typeof(canonical_match_ids) = 'array'
      and jsonb_typeof(canonical_conflict_ids) = 'array'
      and jsonb_typeof(supporting_evidence_ids) = 'object'
      and jsonb_typeof(supporting_evidence_counts) = 'object'
      and jsonb_typeof(metadata) = 'object'
    ),
  constraint spelling_seed_import_rows_duplicate_self_check
    check (duplicate_of_seed_import_row_id is null or duplicate_of_seed_import_row_id <> id),
  constraint spelling_seed_import_rows_review_audit_check
    check (
      reviewed_at is null
      or row_status in (
        'kept_pending',
        'rejected',
        'duplicate',
        'conflict_blocked',
        'nominated_for_canonical_adoption',
        'adopted_hidden_canonical',
        'superseded'
      )
    )
);

comment on table public.spelling_seed_import_batches is
  'Operator/admin seed import storage foundation. Batches are provenance and lifecycle records only; they do not create canonical truth or resolver visibility.';

comment on table public.spelling_seed_import_rows is
  'Operator/admin seed import row evidence only. Rows are not parent verification, child evidence, learning gaps, learning items, assignment items, canonical truth, or resolver-visible authority.';

comment on column public.spelling_seed_import_rows.canonical_mapping_id is
  'Nullable future lineage after a later explicit canonical adoption action; not resolver authority.';

create index if not exists spelling_seed_import_batches_status_date_idx
  on public.spelling_seed_import_batches(batch_status, created_at desc);

create unique index if not exists spelling_seed_import_batches_active_source_hash_idx
  on public.spelling_seed_import_batches(source_file_sha256)
  where batch_status not in ('superseded', 'cancelled', 'quarantined');

create index if not exists spelling_seed_import_rows_batch_status_idx
  on public.spelling_seed_import_rows(batch_id, row_status, created_at desc);

create index if not exists spelling_seed_import_rows_normalized_pair_idx
  on public.spelling_seed_import_rows(
    misspelling_normalized,
    correct_spelling_normalized,
    dialect_code
  );

create index if not exists spelling_seed_import_rows_skill_status_idx
  on public.spelling_seed_import_rows(
    suggested_micro_skill_key,
    row_status,
    created_at desc
  );

create index if not exists spelling_seed_import_rows_duplicate_group_idx
  on public.spelling_seed_import_rows(duplicate_group_key)
  where duplicate_group_key is not null;

create index if not exists spelling_seed_import_rows_duplicate_of_idx
  on public.spelling_seed_import_rows(duplicate_of_seed_import_row_id)
  where duplicate_of_seed_import_row_id is not null;

create index if not exists spelling_seed_import_rows_canonical_mapping_idx
  on public.spelling_seed_import_rows(canonical_mapping_id)
  where canonical_mapping_id is not null;

create unique index if not exists spelling_seed_import_rows_batch_normalized_triple_idx
  on public.spelling_seed_import_rows(
    batch_id,
    misspelling_normalized,
    correct_spelling_normalized,
    dialect_code
  );

alter table public.spelling_seed_import_batches enable row level security;
alter table public.spelling_seed_import_rows enable row level security;

revoke all on table public.spelling_seed_import_batches from anon, authenticated;
revoke all on table public.spelling_seed_import_rows from anon, authenticated;

grant all on table public.spelling_seed_import_batches to service_role;
grant all on table public.spelling_seed_import_rows to service_role;

commit;
