#!/usr/bin/env python3
"""Apply one reviewed Teaching Dictionary content version to the pinned staging project.

This is deliberately not a general hosted importer.  It reuses the canonical
CSV validator and importer planning code, but may only release one *existing*
microskill's reviewed teaching-content version, its field reviews, and its
readiness receipt.  It cannot create words, support rows, sources, learner
data, or any Production data.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
IMPORTER_PATH = ROOT / "scripts/import-teaching-dictionary-csv.py"
STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz"
PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf"
CONFIRMATION_TOKEN = "release-reviewed-staging-teaching-content"
ALLOWED_TABLES = {
    "canonical_teaching_dictionary_content_versions",
    "canonical_teaching_dictionary_field_reviews",
    "canonical_teaching_dictionary_readiness_reports",
}
ADVISORY_LOCK_NAME = "canonical_teaching_dictionary_staging_content_release"


def load_importer() -> Any:
    spec = importlib.util.spec_from_file_location("teaching_dictionary_importer", IMPORTER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load the canonical Teaching Dictionary importer.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def content_release_rows(manifest: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    if manifest.get("status") != "ready_for_local_preflight":
        raise ValueError("Canonical CSV validation did not produce a release-ready manifest.")
    if manifest["validation"]["summary"]["errors"]:
        raise ValueError("Canonical CSV validation has errors.")

    planned = manifest["planned_rows_by_table"]
    release_rows = {table: planned.get(table, []) for table in ALLOWED_TABLES}
    content_rows = release_rows["canonical_teaching_dictionary_content_versions"]
    if len(content_rows) != 1:
        raise ValueError("A staging content release must contain exactly one teaching-content version.")

    content = content_rows[0]
    if not (
        str(content["is_active"]).upper() == "TRUE"
        and content["version_status"] == "active"
        and content["final_readiness_review_status"] == "signed_off"
    ):
        raise ValueError("The released version must be active and signed off.")
    if not (str(content.get("reflection_prompt_key") or "").strip() and str(content.get("reflection_prompt_text") or "").strip()):
        raise ValueError("Hosted staging release requires an explicit governed Reflection key and text.")
    if content.get("source_metadata", {}).get("source_contract_version") != "teaching_content_row_v2_reflection":
        raise ValueError("Hosted staging release requires the v2 Reflection source contract.")

    content_id = content["id"]
    reviews = release_rows["canonical_teaching_dictionary_field_reviews"]
    if not reviews or any(row.get("teaching_content_version_id") != content_id for row in reviews):
        raise ValueError("All field reviews must belong to the one released content version.")
    reviewed_fields = {row["field_key"] for row in reviews if row["review_status"] == "approved_for_first_exposure"}
    if not {"reflection_prompt_key", "reflection_prompt_text"}.issubset(reviewed_fields):
        raise ValueError("Reflection fields require approved first-exposure field reviews.")

    reports = release_rows["canonical_teaching_dictionary_readiness_reports"]
    if len(reports) != 1 or reports[0].get("teaching_content_version_id") != content_id:
        raise ValueError("Exactly one canonical readiness report is required for the released version.")
    if reports[0].get("first_exposure_allowed") is not True:
        raise ValueError("The canonical readiness report must permit first exposure.")

    return release_rows


def release_transaction_sql(importer: Any, manifest: dict[str, Any]) -> str:
    rows = content_release_rows(manifest)
    content = rows["canonical_teaching_dictionary_content_versions"][0]
    skill = content["micro_skill_key"]
    version = content["content_version"]
    previous = content.get("supersedes_content_version")
    if not previous:
        raise ValueError("The staged content version must explicitly supersede the current content version.")

    inserts = "\n\n".join(
        importer.insert_statement(table, rows[table]).replace(
            "(select id from _teaching_dictionary_import_batch)",
            "(select id from _staging_content_release_batch)",
        )
        for table in (
            "canonical_teaching_dictionary_content_versions",
            "canonical_teaching_dictionary_field_reviews",
            "canonical_teaching_dictionary_readiness_reports",
        )
    )
    expected = {table: len(table_rows) for table, table_rows in rows.items()}
    expected_values = ", ".join(
        f"({importer.quote_sql_literal(table)}, {count})" for table, count in sorted(expected.items())
    )
    allowed_table_list = ", ".join(importer.quote_sql_literal(table) for table in sorted(ALLOWED_TABLES))

    return f"""
begin;

select pg_advisory_xact_lock(hashtext({importer.quote_sql_literal(ADVISORY_LOCK_NAME)}));

create temporary table _staging_content_release_batch (id uuid not null) on commit preserve rows;

do $$
declare
  existing_active_version text;
begin
  if exists (
    select 1 from public.canonical_teaching_dictionary_content_versions
    where micro_skill_key = {importer.quote_sql_literal(skill)}
      and content_version = {importer.quote_sql_literal(version)}
  ) then
    raise exception 'staging content version already exists';
  end if;

  select content_version into existing_active_version
  from public.canonical_teaching_dictionary_content_versions
  where micro_skill_key = {importer.quote_sql_literal(skill)}
    and is_active = true
    and version_status = 'active'
    and final_readiness_review_status = 'signed_off'
  for update;

  if existing_active_version is distinct from {importer.quote_sql_literal(previous)} then
    raise exception 'current active content version does not match explicit supersedes_content_version';
  end if;
end $$;

with inserted as (
  insert into public.canonical_teaching_dictionary_import_batches (
    source_folder_path, source_folder_sha256, source_commit, validator_version,
    validation_summary, row_counts, readiness_summary, import_mode, batch_status,
    source_metadata, imported_by, imported_at
  ) values (
    {importer.sql_value(manifest['csv_folder'])},
    {importer.sql_value(manifest['source_folder_sha256'])},
    {importer.sql_value(manifest.get('source_commit'))},
    {importer.sql_value(manifest['validator_version'])},
    {importer.sql_value(manifest['validation']['summary'], jsonb=True)},
    {importer.sql_value({'content_release_rows': expected}, jsonb=True)},
    {importer.sql_value(manifest['readiness_summary'], jsonb=True)},
    'admin_import', 'applied',
    {importer.sql_value({'target': 'staging_only', 'allowed_tables': sorted(ALLOWED_TABLES), 'source_contract_version': 'teaching_content_row_v2_reflection'}, jsonb=True)},
    'd3_staging_content_release_adapter', timezone('utc', now())
  ) returning id
)
insert into _staging_content_release_batch(id) select id from inserted;

update public.canonical_teaching_dictionary_content_versions
set is_active = false, version_status = 'superseded', updated_at = timezone('utc', now())
where micro_skill_key = {importer.quote_sql_literal(skill)}
  and content_version = {importer.quote_sql_literal(previous)}
  and is_active = true;

{inserts}

do $$
declare
  mismatch_count integer;
  active_count integer;
begin
  with expected(table_name, row_count) as (values {expected_values}), actual as (
    select 'canonical_teaching_dictionary_content_versions'::text as table_name, count(*)::integer as row_count
    from public.canonical_teaching_dictionary_content_versions where import_batch_id = (select id from _staging_content_release_batch)
    union all select 'canonical_teaching_dictionary_field_reviews', count(*)::integer
    from public.canonical_teaching_dictionary_field_reviews where import_batch_id = (select id from _staging_content_release_batch)
    union all select 'canonical_teaching_dictionary_readiness_reports', count(*)::integer
    from public.canonical_teaching_dictionary_readiness_reports where import_batch_id = (select id from _staging_content_release_batch)
  ) select count(*) into mismatch_count from expected join actual using (table_name) where expected.row_count <> actual.row_count;
  if mismatch_count <> 0 then raise exception 'staging content release row-count verification failed'; end if;

  select count(*) into active_count from public.canonical_teaching_dictionary_content_versions
  where micro_skill_key = {importer.quote_sql_literal(skill)} and is_active = true and version_status = 'active' and final_readiness_review_status = 'signed_off';
  if active_count <> 1 then raise exception 'staging content release did not leave exactly one active signed-off version'; end if;
end $$;

commit;

select jsonb_build_object(
  'status', 'staging_content_release_committed',
  'project_ref', {importer.quote_sql_literal(STAGING_PROJECT_REF)},
  'import_batch_id', (select id::text from _staging_content_release_batch),
  'micro_skill_key', {importer.quote_sql_literal(skill)},
  'content_version', {importer.quote_sql_literal(version)},
  'source_row_hash', {importer.quote_sql_literal(content['source_row_hash'])},
  'allowed_tables', jsonb_build_array({allowed_table_list}),
  'inserted_counts', jsonb_build_object('content_versions', {expected['canonical_teaching_dictionary_content_versions']}, 'field_reviews', {expected['canonical_teaching_dictionary_field_reviews']}, 'readiness_reports', {expected['canonical_teaching_dictionary_readiness_reports']})
)::text;
""".strip()


def run_hosted_sql(sql: str, project_ref: str) -> str:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8", delete=False) as handle:
        handle.write(sql)
        sql_path = Path(handle.name)
    try:
        command = ["npx", "--yes", "supabase@2.115.0", "db", "query", "--linked", "--project-ref", project_ref, "--file", str(sql_path)]
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout).strip() or "Hosted staging query failed.")
        return result.stdout.strip()
    finally:
        sql_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Release one reviewed Teaching Dictionary content version to pinned staging only.")
    parser.add_argument("csv_folder", type=Path)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--emit-sql", action="store_true", help="Print validated transaction SQL without contacting Supabase.")
    parser.add_argument("--apply-staging", action="store_true")
    parser.add_argument("--confirm", help=f"Must equal {CONFIRMATION_TOKEN!r} when applying.")
    args = parser.parse_args()

    if args.project_ref == PRODUCTION_PROJECT_REF:
        raise SystemExit("Refusing Production project ref.")
    if args.project_ref != STAGING_PROJECT_REF:
        raise SystemExit("Refusing an unpinned hosted project ref.")
    if args.apply_staging == args.emit_sql:
        raise SystemExit("Choose exactly one of --emit-sql or --apply-staging.")
    if args.apply_staging and args.confirm != CONFIRMATION_TOKEN:
        raise SystemExit("Refusing staging apply without the exact confirmation token.")

    importer = load_importer()
    folder = args.csv_folder.expanduser().resolve()
    manifest = importer.build_manifest(folder, include_planned_rows=True)
    sql = release_transaction_sql(importer, manifest)
    if args.emit_sql:
        print(sql)
    else:
        print(run_hosted_sql(sql, args.project_ref))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
