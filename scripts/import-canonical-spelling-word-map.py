#!/usr/bin/env python3
"""Dry-run planner for canonical spelling word-map storage imports.

This script intentionally performs no Supabase writes. It validates the workbook
with the Stage 2B validator, builds table-shaped planned rows, and emits a JSON
manifest that can be reviewed before any separately-authorized import slice.

Stage 2C.3 adds a local/dev apply preflight boundary. The --apply-local path
checks that the target is local Supabase Postgres and that the storage migration
is present, then emits the transaction plan it would use later. It still stops
before inserting workbook rows.

Stage 2C.4 adds an explicitly gated local/dev import transaction path behind
--apply-local-import. It is only for local Supabase after the same preflight
passes and must not be used for hosted environments.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = (
    ROOT
    / "docs/implementation/seed-data/canonical-spelling-word-map/"
    / "canonical-spelling-word-map-v1.xlsx"
)
VALIDATOR_PATH = ROOT / "scripts/validate-canonical-spelling-word-map.py"
EXPECTED_MIGRATION_VERSION = "20260608193000"
LOCAL_CONFIRMATION_TOKEN = "canonical-spelling-word-map-local-dev"

IMPORT_BATCH_TABLE = "canonical_spelling_word_map_import_batches"

SHEET_TO_TABLE = {
    "word_metadata": "canonical_spelling_word_metadata",
    "micro_skill_diversity_groups": "canonical_spelling_word_map_diversity_groups",
    "micro_skill_word_bank": "canonical_spelling_word_map_words",
    "contrast_pairs": "canonical_spelling_word_map_contrast_pairs",
    "diagnostic_misspelling_mappings": "canonical_spelling_word_map_diagnostic_examples",
    "lesson_route_support": "canonical_spelling_word_map_route_support",
}

HELPER_SHEETS = {"allowed_values", "README"}

CONTENT_TABLES_IN_IMPORT_ORDER = [
    "canonical_spelling_word_metadata",
    "canonical_spelling_word_map_diversity_groups",
    "canonical_spelling_word_map_words",
    "canonical_spelling_word_map_contrast_pairs",
    "canonical_spelling_word_map_diagnostic_examples",
    "canonical_spelling_word_map_route_support",
]

ALL_STORAGE_TABLES = [IMPORT_BATCH_TABLE, *CONTENT_TABLES_IN_IMPORT_ORDER]

PROTECTED_TABLES = [
    "micro_skill_catalog",
    "learning_items",
    "learning_item_evidence",
    "assignment_items",
    "spelling_canonical_mappings",
    "spelling_canonical_mapping_events",
    "spelling_canonical_mapping_recommendations",
    "spelling_catalog_review_cases",
]

CONTENT_TABLE_COLUMNS = {
    "canonical_spelling_word_metadata": [
        "import_batch_id",
        "row_status",
        "review_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "word",
        "normalised_word",
        "dialect_code",
        "syllable_count",
        "phoneme_hint",
        "stress_pattern",
        "has_schwa",
        "morphology_notes",
        "irregularity_band",
        "spelling_complexity_score",
        "source",
    ],
    "canonical_spelling_word_map_diversity_groups": [
        "import_batch_id",
        "row_status",
        "review_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "micro_skill_key",
        "diversity_group_key",
        "display_label",
        "required_for_mastery",
        "minimum_success_examples",
        "notes",
    ],
    "canonical_spelling_word_map_words": [
        "import_batch_id",
        "row_status",
        "review_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "micro_skill_key",
        "word",
        "normalised_word",
        "word_role",
        "micro_skill_role",
        "diversity_group_key",
        "complexity_band",
        "frequency_band",
        "practice_route",
        "approved_for_assignment",
        "notes",
    ],
    "canonical_spelling_word_map_contrast_pairs": [
        "import_batch_id",
        "row_status",
        "review_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "target_micro_skill_key",
        "target_word",
        "contrast_word",
        "contrast_micro_skill_key",
        "contrast_type",
        "approved_for_assignment",
    ],
    "canonical_spelling_word_map_diagnostic_examples": [
        "import_batch_id",
        "row_status",
        "review_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "misspelling_normalised",
        "correction_normalised",
        "micro_skill_key",
        "diagnostic_reason",
        "confidence",
        "resolver_visible_candidate",
        "notes",
    ],
    "canonical_spelling_word_map_route_support": [
        "import_batch_id",
        "row_status",
        "review_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "micro_skill_key",
        "route",
        "minimum_words_required",
        "requires_contrast_words",
        "template_key",
        "enabled_for_mvp",
    ],
}

UNIQUE_KEY_FIELDS = {
    "canonical_spelling_word_metadata": ["normalised_word", "dialect_code"],
    "canonical_spelling_word_map_diversity_groups": ["micro_skill_key", "diversity_group_key"],
    "canonical_spelling_word_map_words": [
        "micro_skill_key",
        "normalised_word",
        "word_role",
        "micro_skill_role",
        "practice_route",
        "diversity_group_key",
    ],
    "canonical_spelling_word_map_contrast_pairs": [
        "target_micro_skill_key",
        "target_word",
        "contrast_word",
        "contrast_micro_skill_key",
        "contrast_type",
    ],
    "canonical_spelling_word_map_diagnostic_examples": [
        "misspelling_normalised",
        "correction_normalised",
        "micro_skill_key",
    ],
    "canonical_spelling_word_map_route_support": ["micro_skill_key", "route"],
}

BOOLEAN_FIELDS = {
    "approved_for_assignment",
    "required_for_mastery",
    "has_schwa",
    "resolver_visible_candidate",
    "requires_contrast_words",
    "enabled_for_mvp",
}

INTEGER_FIELDS = {"source_row_number", "minimum_success_examples", "syllable_count", "minimum_words_required"}
NUMERIC_FIELDS = {"spelling_complexity_score"}

ROW_STATUS = "active"
DEFAULT_REVIEW_STATUS = "manual_verified"

DB_CONFLICT_FIELD_SQL = {
    "canonical_spelling_word_metadata": ["active.normalised_word", "active.dialect_code"],
    "canonical_spelling_word_map_diversity_groups": [
        "active.micro_skill_key",
        "active.diversity_group_key",
    ],
    "canonical_spelling_word_map_words": [
        "active.micro_skill_key",
        "active.normalised_word",
        "active.word_role",
        "active.micro_skill_role",
        "active.practice_route",
        "coalesce(active.diversity_group_key, '')",
    ],
    "canonical_spelling_word_map_contrast_pairs": [
        "active.target_micro_skill_key",
        "active.target_word",
        "active.contrast_word",
        "active.contrast_micro_skill_key",
        "active.contrast_type",
    ],
    "canonical_spelling_word_map_diagnostic_examples": [
        "active.misspelling_normalised",
        "active.correction_normalised",
        "active.micro_skill_key",
    ],
    "canonical_spelling_word_map_route_support": ["active.micro_skill_key", "active.route"],
}


class LocalPreflightError(ValueError):
    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.details = details or {}


def load_validator():
    spec = importlib.util.spec_from_file_location("canonical_word_map_validator", VALIDATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load validator from {VALIDATOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_commit() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip() or None
    except (OSError, subprocess.CalledProcessError):
        return None


def quote_sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def quote_sql_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def sql_value(value: Any, jsonb: bool = False) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list)):
        literal = quote_sql_literal(json.dumps(value, sort_keys=True, separators=(",", ":")))
        return f"{literal}::jsonb" if jsonb else literal
    literal = quote_sql_literal(str(value))
    return f"{literal}::jsonb" if jsonb else literal


def require_local_db_url(db_url: str) -> dict[str, Any]:
    parsed = urlparse(db_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("Local DB URL must use postgres:// or postgresql://.")
    if parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("Refusing non-local database host. Expected localhost or 127.0.0.1.")
    if parsed.port != 54322:
        raise ValueError("Refusing non-local Supabase port. Expected local Postgres port 54322.")
    if (parsed.path or "").lstrip("/") != "postgres":
        raise ValueError("Refusing non-local Supabase database. Expected database name postgres.")
    return {
        "scheme": parsed.scheme,
        "host": parsed.hostname,
        "port": parsed.port,
        "database": (parsed.path or "").lstrip("/"),
        "username": parsed.username,
    }


def run_psql_json(
    db_url: str,
    sql: str,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> Any:
    wrapped_sql = (
        "select coalesce(jsonb_agg(row_to_json(result_rows)), '[]'::jsonb) "
        f"from ({sql}) result_rows"
    )
    if psql_mode == "host":
        command = [
            psql_command,
            db_url,
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            wrapped_sql,
        ]
    elif psql_mode == "docker":
        if not docker_container:
            raise ValueError("--docker-container is required when --psql-mode docker is used.")
        command = [
            "docker",
            "exec",
            "-i",
            docker_container,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            wrapped_sql,
        ]
    else:
        raise ValueError(f"Unsupported psql mode: {psql_mode!r}.")

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        if not detail:
            detail = f"{command[0]} exited with status {result.returncode}"
        raise ValueError(detail)
    output = result.stdout.strip()
    return json.loads(output or "[]")


def run_psql_script_text(
    db_url: str,
    sql: str,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> str:
    if psql_mode == "host":
        command = [
            psql_command,
            db_url,
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "-v",
            "ON_ERROR_STOP=1",
        ]
    elif psql_mode == "docker":
        if not docker_container:
            raise ValueError("--docker-container is required when --psql-mode docker is used.")
        command = [
            "docker",
            "exec",
            "-i",
            docker_container,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "-v",
            "ON_ERROR_STOP=1",
        ]
    else:
        raise ValueError(f"Unsupported psql mode: {psql_mode!r}.")

    result = subprocess.run(
        command,
        input=sql,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        if not detail:
            detail = f"{command[0]} exited with status {result.returncode}"
        raise ValueError(detail)
    return result.stdout.strip()


def db_existing_tables(
    db_url: str,
    tables: list[str],
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> set[str]:
    rows = run_psql_json(
        db_url,
        (
            "select table_name from information_schema.tables "
            "where table_schema = 'public' "
            "and table_name = any (array["
            + ", ".join(quote_sql_literal(table) for table in tables)
            + "])"
        ),
        psql_command,
        psql_mode,
        docker_container,
    )
    return {row["table_name"] for row in rows}


def db_count_by_table(
    db_url: str,
    tables: list[str],
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, int]:
    if not tables:
        return {}
    selects = [
        (
            f"select {quote_sql_literal(table)} as table_name, "
            f"count(*)::integer as row_count from public.{table}"
        )
        for table in tables
    ]
    rows = run_psql_json(
        db_url,
        " union all ".join(selects),
        psql_command,
        psql_mode,
        docker_container,
    )
    return {row["table_name"]: int(row["row_count"]) for row in rows}


def planned_conflict_values(rows: list[dict[str, Any]], fields: list[str]) -> str:
    values = []
    for row in rows:
        cells = []
        for field in fields:
            value = row.get(field)
            cells.append("null" if value is None else quote_sql_literal(str(value)))
        values.append("(" + ", ".join(cells) + ")")
    return ", ".join(values)


def db_conflict_summary(
    db_url: str,
    planned: dict[str, list[dict[str, Any]]],
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, Any]:
    summary: dict[str, Any] = {}

    for table, rows in planned.items():
        fields = UNIQUE_KEY_FIELDS[table]
        if not rows:
            summary[table] = {"conflict_count": 0, "conflicts": []}
            continue

        aliases = [f"k{index}" for index, _field in enumerate(fields)]
        values_sql = planned_conflict_values(rows, fields)
        value_columns = ", ".join(aliases)
        active_fields = DB_CONFLICT_FIELD_SQL[table]
        join_conditions = " and ".join(
            f"coalesce({active_field}::text, '') = coalesce(incoming.{alias}, '')"
            for active_field, alias in zip(active_fields, aliases)
        )
        select_columns = ", ".join(f"incoming.{alias} as {field}" for alias, field in zip(aliases, fields))
        sql = f"""
            select distinct {select_columns}
            from (values {values_sql}) as incoming({value_columns})
            join public.{table} active
              on active.row_status = 'active'
             and {join_conditions}
            limit 50
        """
        conflicts = run_psql_json(db_url, sql, psql_command, psql_mode, docker_container)
        summary[table] = {
            "conflict_count": len(conflicts),
            "conflicts": conflicts,
        }

    return summary


def planned_micro_skill_keys(planned: dict[str, list[dict[str, Any]]]) -> list[str]:
    keys: set[str] = set()

    for table, rows in planned.items():
        for row in rows:
            if table == "canonical_spelling_word_map_contrast_pairs":
                for field in ("target_micro_skill_key", "contrast_micro_skill_key"):
                    value = row.get(field)
                    if value:
                        keys.add(str(value))
            else:
                value = row.get("micro_skill_key")
                if value:
                    keys.add(str(value))

    return sorted(keys)


def db_missing_micro_skill_keys(
    db_url: str,
    keys: list[str],
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> list[str]:
    if not keys:
        return []

    values_sql = ", ".join(f"({quote_sql_literal(key)})" for key in keys)
    rows = run_psql_json(
        db_url,
        f"""
            select planned.micro_skill_key
            from (values {values_sql}) as planned(micro_skill_key)
            left join public.micro_skill_catalog catalog
              on catalog.micro_skill_key = planned.micro_skill_key
            where catalog.micro_skill_key is null
            order by planned.micro_skill_key
        """,
        psql_command,
        psql_mode,
        docker_container,
    )
    return [row["micro_skill_key"] for row in rows]


def local_audit_counts(
    db_url: str,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, Any]:
    protected_existing_tables = sorted(
        db_existing_tables(db_url, PROTECTED_TABLES, psql_command, psql_mode, docker_container)
    )
    protected_missing_tables = sorted(set(PROTECTED_TABLES) - set(protected_existing_tables))
    protected_counts = db_count_by_table(
        db_url,
        protected_existing_tables,
        psql_command,
        psql_mode,
        docker_container,
    )
    storage_counts_before = db_count_by_table(
        db_url,
        ALL_STORAGE_TABLES,
        psql_command,
        psql_mode,
        docker_container,
    )

    return {
        "storage_tables": {
            "expected": ALL_STORAGE_TABLES,
            "missing": [],
            "row_counts_before": storage_counts_before,
        },
        "protected_tables": {
            "tables_checked": PROTECTED_TABLES,
            "missing_from_local_schema": protected_missing_tables,
            "row_counts_before": protected_counts,
            "mutation_allowed": False,
        },
    }


def local_apply_preflight(
    manifest: dict[str, Any],
    db_url: str,
    confirmation_token: str | None,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, Any]:
    if confirmation_token != LOCAL_CONFIRMATION_TOKEN:
        raise ValueError(
            f"Refusing --apply-local without --confirm-local-dev-import {LOCAL_CONFIRMATION_TOKEN!r}."
        )

    target = require_local_db_url(db_url)
    if manifest["blocked_rows"]:
        raise ValueError("Refusing --apply-local preflight because the dry-run manifest has blocked rows.")

    migration_rows = run_psql_json(
        db_url,
        (
            "select version from supabase_migrations.schema_migrations "
            f"where version = {quote_sql_literal(EXPECTED_MIGRATION_VERSION)}"
        ),
        psql_command,
        psql_mode,
        docker_container,
    )
    if not migration_rows:
        raise ValueError(f"Migration ledger is missing {EXPECTED_MIGRATION_VERSION}.")

    found_tables = db_existing_tables(
        db_url,
        ALL_STORAGE_TABLES,
        psql_command,
        psql_mode,
        docker_container,
    )
    missing_tables = sorted(set(ALL_STORAGE_TABLES) - found_tables)
    if missing_tables:
        raise ValueError(f"Missing canonical spelling word-map storage tables: {missing_tables}.")

    diagnostic_rows = manifest["planned_rows_by_table"]["canonical_spelling_word_map_diagnostic_examples"]
    resolver_visible_diagnostics = [
        row
        for row in diagnostic_rows
        if row.get("resolver_visible_candidate") is not False
    ]
    if resolver_visible_diagnostics:
        raise ValueError("Refusing --apply-local preflight: diagnostic rows include resolver-visible candidates.")

    audit_counts = local_audit_counts(db_url, psql_command, psql_mode, docker_container)

    planned_keys = planned_micro_skill_keys(manifest["planned_rows_by_table"])
    missing_micro_skill_keys = db_missing_micro_skill_keys(
        db_url,
        planned_keys,
        psql_command,
        psql_mode,
        docker_container,
    )
    if missing_micro_skill_keys:
        raise LocalPreflightError(
            "Missing local micro_skill_catalog keys required by word-map rows.",
            {
                "micro_skill_catalog_fk_readiness": {
                    "planned_key_count": len(planned_keys),
                    "missing_key_count": len(missing_micro_skill_keys),
                    "missing_micro_skill_keys": missing_micro_skill_keys,
                },
                **audit_counts,
            },
        )

    conflicts = db_conflict_summary(
        db_url,
        manifest["planned_rows_by_table"],
        psql_command,
        psql_mode,
        docker_container,
    )
    conflict_blockers = {
        table: details
        for table, details in conflicts.items()
        if details["conflict_count"] > 0
    }
    if conflict_blockers:
        raise ValueError(f"Active database conflicts would block import: {json.dumps(conflict_blockers)}")

    return {
        "mode": "apply_local_preflight",
        "actual_import_run": False,
        "target_environment": {
            **target,
            "classification": "local_dev_only",
            "psql_mode": psql_mode,
            "docker_container": docker_container if psql_mode == "docker" else None,
        },
        "migration_ledger": {
            "required_version": EXPECTED_MIGRATION_VERSION,
            "present": True,
        },
        **audit_counts,
        "database_conflicts": conflicts,
        "micro_skill_catalog_fk_readiness": {
            "planned_key_count": len(planned_keys),
            "missing_key_count": len(missing_micro_skill_keys),
            "missing_micro_skill_keys": missing_micro_skill_keys,
        },
        "transaction_plan": {
            "will_acquire_advisory_xact_lock": True,
            "advisory_lock_name": "canonical_spelling_word_map_import",
            "transaction_scope": "single transaction for import batch and all content rows",
            "rollback_behavior": "any failed insert, FK violation, row-count mismatch, or resolver visibility violation rolls back the full batch",
            "import_order": [IMPORT_BATCH_TABLE, *CONTENT_TABLES_IN_IMPORT_ORDER],
            "row_count_verification": "planned inserts by table must exactly match inserted rows by import_batch_id before commit",
            "deletion_policy": "no deletion; future rollback uses batch/content row_status deactivation",
        },
        "status": "local_apply_preflight_ready_no_import_run",
    }


def insert_statement(table: str, rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""

    columns = CONTENT_TABLE_COLUMNS[table]
    column_sql = ", ".join(quote_sql_identifier(column) for column in columns)
    values_sql: list[str] = []

    for row in rows:
        values: list[str] = []
        for column in columns:
            if column == "import_batch_id":
                values.append("(select id from _word_map_import_batch)")
            elif column == "source_metadata":
                values.append(sql_value(row.get(column), jsonb=True))
            else:
                values.append(sql_value(row.get(column)))
        values_sql.append("(" + ", ".join(values) + ")")

    return (
        f"insert into public.{table} ({column_sql})\nvalues\n"
        + ",\n".join(values_sql)
        + ";"
    )


def protected_counts_values(protected_counts: dict[str, int]) -> str:
    return ", ".join(
        f"({quote_sql_literal(table)}, {int(count)})"
        for table, count in sorted(protected_counts.items())
    )


def protected_count_selects() -> str:
    return " union all ".join(
        (
            f"select {quote_sql_literal(table)} as table_name, "
            f"count(*)::integer as row_count from public.{table}"
        )
        for table in PROTECTED_TABLES
    )


def content_count_selects(batch_filter: bool = True) -> str:
    where_clause = " where import_batch_id = (select id from _word_map_import_batch)" if batch_filter else ""
    return " union all ".join(
        (
            f"select {quote_sql_literal(table)} as table_name, "
            f"count(*)::integer as row_count from public.{table}{where_clause}"
        )
        for table in CONTENT_TABLES_IN_IMPORT_ORDER
    )


def planned_counts_values(planned_counts: dict[str, int]) -> str:
    return ", ".join(
        f"({quote_sql_literal(table)}, {int(planned_counts[table])})"
        for table in CONTENT_TABLES_IN_IMPORT_ORDER
    )


def local_import_transaction_sql(
    manifest: dict[str, Any],
    preflight: dict[str, Any],
) -> str:
    planned_counts = manifest["planned_inserts_by_table"]
    validation_summary = manifest["validation"]
    row_counts = manifest["row_counts_by_sheet"]
    source_metadata = manifest["source_metadata"]
    protected_before = preflight["protected_tables"]["row_counts_before"]

    insert_statements = "\n\n".join(
        insert_statement(table, manifest["planned_rows_by_table"][table])
        for table in CONTENT_TABLES_IN_IMPORT_ORDER
    )

    return f"""
begin;

select pg_advisory_xact_lock(hashtext('canonical_spelling_word_map_import'));

create temporary table _word_map_import_batch (
  id uuid not null
) on commit preserve rows;

create temporary table _word_map_protected_counts_before (
  table_name text primary key,
  row_count integer not null
) on commit preserve rows;

insert into _word_map_protected_counts_before(table_name, row_count)
values {protected_counts_values(protected_before)};

with inserted as (
  insert into public.{IMPORT_BATCH_TABLE} (
    workbook_path,
    workbook_sha256,
    source_commit,
    validator_version,
    validation_summary,
    row_counts,
    import_mode,
    batch_status,
    source_metadata,
    imported_by,
    imported_at
  )
  values (
    {sql_value(manifest["workbook_path"])},
    {sql_value(manifest["workbook_sha256"])},
    {sql_value(manifest.get("source_commit"))},
    {sql_value(manifest["validator_version"])},
    {sql_value(validation_summary, jsonb=True)},
    {sql_value(row_counts, jsonb=True)},
    'local_dev_import',
    'active',
    {sql_value(source_metadata, jsonb=True)},
    'stage_2c4_local_dev_import',
    timezone('utc', now())
  )
  returning id
)
insert into _word_map_import_batch(id)
select id from inserted;

{insert_statements}

do $$
declare
  mismatch_count integer;
  diagnostic_visible_count integer;
  protected_mismatch_count integer;
begin
  with planned(table_name, row_count) as (
    values {planned_counts_values(planned_counts)}
  ),
  actual as (
    {content_count_selects(batch_filter=True)}
  )
  select count(*) into mismatch_count
  from planned
  join actual using (table_name)
  where planned.row_count <> actual.row_count;

  if mismatch_count <> 0 then
    raise exception 'canonical word-map import row-count verification failed';
  end if;

  select count(*) into diagnostic_visible_count
  from public.canonical_spelling_word_map_diagnostic_examples
  where import_batch_id = (select id from _word_map_import_batch)
    and resolver_visible_candidate is not false;

  if diagnostic_visible_count <> 0 then
    raise exception 'canonical word-map import attempted resolver-visible diagnostics';
  end if;

  with protected_after as (
    {protected_count_selects()}
  )
  select count(*) into protected_mismatch_count
  from _word_map_protected_counts_before before_counts
  join protected_after after_counts using (table_name)
  where before_counts.row_count <> after_counts.row_count;

  if protected_mismatch_count <> 0 then
    raise exception 'canonical word-map import changed protected table counts';
  end if;
end $$;

commit;

with inserted_counts as (
  {content_count_selects(batch_filter=True)}
),
protected_after as (
  {protected_count_selects()}
),
diagnostic_visibility as (
  select count(*)::integer as resolver_visible_count
  from public.canonical_spelling_word_map_diagnostic_examples
  where import_batch_id = (select id from _word_map_import_batch)
    and resolver_visible_candidate is not false
)
select jsonb_build_object(
  'actual_import_run', true,
  'import_batch_id', (select id::text from _word_map_import_batch),
  'inserted_counts_by_table', (
    select jsonb_object_agg(table_name, row_count) from inserted_counts
  ),
  'protected_counts_before', (
    select jsonb_object_agg(table_name, row_count) from _word_map_protected_counts_before
  ),
  'protected_counts_after', (
    select jsonb_object_agg(table_name, row_count) from protected_after
  ),
  'row_count_verification', 'passed',
  'diagnostic_visibility_verification', case
    when (select resolver_visible_count from diagnostic_visibility) = 0 then 'passed'
    else 'failed'
  end,
  'status', 'local_import_committed'
)::text;
""".strip()


def run_local_import_transaction(
    manifest: dict[str, Any],
    preflight: dict[str, Any],
    db_url: str,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, Any]:
    sql = local_import_transaction_sql(manifest, preflight)
    output = run_psql_script_text(db_url, sql, psql_command, psql_mode, docker_container)
    report_line = output.splitlines()[-1] if output else "{}"
    return json.loads(report_line)


def stable_row_hash(sheet_name: str, row: dict[str, str]) -> str:
    content = {
        key: value
        for key, value in sorted(row.items())
        if key != "__row" and value not in ("", None)
    }
    payload = json.dumps({"sheet": sheet_name, "content": content}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def parse_bool(value: str) -> bool | None:
    if value == "TRUE":
        return True
    if value == "FALSE":
        return False
    if value == "":
        return None
    raise ValueError(f"Expected workbook boolean TRUE/FALSE, got {value!r}")


def coerce_value(field: str, value: str) -> Any:
    if value == "":
        return None
    if field in BOOLEAN_FIELDS:
        return parse_bool(value)
    if field in INTEGER_FIELDS:
        return int(float(value))
    if field in NUMERIC_FIELDS:
        return float(value)
    return value


def import_notes_metadata(rows: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "import_notes": [
            {
                key: value
                for key, value in row.items()
                if key != "__row" and value not in ("", None)
            }
            for row in rows
        ]
    }


def row_source_metadata(row: dict[str, str], workbook_metadata: dict[str, Any]) -> dict[str, Any]:
    row_specific = {
        key: row.get(key, "")
        for key in ("source_name", "source_reference", "source_license")
        if row.get(key, "")
    }
    return {
        "workbook": workbook_metadata,
        "row_source": row_specific,
    }


def planned_row(sheet_name: str, row: dict[str, str], workbook_metadata: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {
        "row_status": ROW_STATUS,
        "review_status": row.get("review_status") or DEFAULT_REVIEW_STATUS,
        "source_sheet": sheet_name,
        "source_row_number": int(row["__row"]),
        "source_row_hash": stable_row_hash(sheet_name, row),
        "source_metadata": row_source_metadata(row, workbook_metadata),
    }

    for key, value in row.items():
        if key == "__row":
            continue
        if key in {"source_name", "source_reference", "source_license"}:
            continue
        output[key] = coerce_value(key, value)

    if sheet_name == "word_metadata" and "dialect_code" not in output:
        output["dialect_code"] = "en-GB"

    return output


def duplicate_summary(planned: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for table, rows in planned.items():
        fields = UNIQUE_KEY_FIELDS[table]
        counts: Counter[tuple[Any, ...]] = Counter()
        rows_by_key: dict[tuple[Any, ...], list[int]] = defaultdict(list)
        for row in rows:
            key = tuple(row.get(field) for field in fields)
            counts[key] += 1
            rows_by_key[key].append(row["source_row_number"])
        duplicates = [
            {
                "key": dict(zip(fields, key)),
                "count": count,
                "source_rows": rows_by_key[key],
            }
            for key, count in counts.items()
            if count > 1
        ]
        summary[table] = {
            "unique_key_fields": fields,
            "duplicate_count": len(duplicates),
            "duplicates": duplicates,
        }
    return summary


def build_manifest(workbook: Path, include_planned_rows: bool = False) -> dict[str, Any]:
    validator = load_validator()
    validation_report = validator.validate(workbook)
    sheets = validator.read_xlsx(workbook)
    workbook_metadata = import_notes_metadata(sheets.get("import_notes", []))

    if validation_report["issue_counts"]["errors"] > 0:
        return {
            "mode": "dry_run",
            "read_only": True,
            "workbook_path": str(workbook),
            "workbook_sha256": sha256_file(workbook),
            "source_commit": source_commit(),
            "validation": validation_report,
            "blocked_rows": validation_report["issues"],
            "planned_inserts_by_table": {},
            "status": "blocked_by_validation_errors",
        }

    planned: dict[str, list[dict[str, Any]]] = {}
    blocked_rows: list[dict[str, Any]] = []

    for sheet_name, table_name in SHEET_TO_TABLE.items():
        planned[table_name] = []
        for row in sheets.get(sheet_name, []):
            try:
                planned[table_name].append(planned_row(sheet_name, row, workbook_metadata))
            except (KeyError, TypeError, ValueError) as error:
                blocked_rows.append(
                    {
                        "sheet": sheet_name,
                        "row": row.get("__row"),
                        "message": str(error),
                    }
                )

    duplicates = duplicate_summary(planned)
    duplicate_blockers = [
        {"table": table, **details}
        for table, details in duplicates.items()
        if details["duplicate_count"] > 0
    ]
    blocked_rows.extend(duplicate_blockers)

    planned_counts = {table: len(rows) for table, rows in planned.items()}
    helper_sheet_counts = {sheet: len(sheets.get(sheet, [])) for sheet in HELPER_SHEETS if sheet in sheets}

    manifest = {
        "mode": "dry_run",
        "read_only": True,
        "actual_import_run": False,
        "workbook_path": str(workbook),
        "workbook_sha256": sha256_file(workbook),
        "source_commit": source_commit(),
        "validator_version": "canonical_spelling_word_map_validator_v1",
        "validation": {
            "catalog_key_count": validation_report["catalog_key_count"],
            "issue_counts": validation_report["issue_counts"],
            "issues": validation_report["issues"],
        },
        "row_counts_by_sheet": {
            sheet: len(rows)
            for sheet, rows in sheets.items()
        },
        "helper_sheet_counts": helper_sheet_counts,
        "planned_inserts_by_table": planned_counts,
        "duplicate_conflict_summary": {
            "workbook_duplicates": duplicates,
            "database_conflicts": "not_checked_in_dry_run_no_supabase_connection",
        },
        "blocked_rows": blocked_rows,
        "source_metadata": workbook_metadata,
        "status": "blocked_by_duplicate_or_coercion_errors" if blocked_rows else "ready_for_review",
    }
    if include_planned_rows:
        manifest["planned_rows_by_table"] = planned
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Plan a canonical spelling word-map import without mutating Supabase."
    )
    parser.add_argument("workbook", nargs="?", default=str(DEFAULT_WORKBOOK), help="Path to workbook .xlsx.")
    parser.add_argument("--report", help="Optional JSON manifest output path.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Refused. Use the separately guarded --apply-local preflight path.",
    )
    parser.add_argument(
        "--apply-local",
        action="store_true",
        help=(
            "Run local/dev apply preflight only. This verifies local DB safety and "
            "still performs no inserts."
        ),
    )
    parser.add_argument(
        "--apply-local-import",
        action="store_true",
        help=(
            "Run the local/dev import transaction after preflight. This is blocked "
            "for non-local targets and must not be used for hosted Supabase."
        ),
    )
    parser.add_argument(
        "--local-db-url",
        help="Explicit local Supabase Postgres URL, expected postgresql://postgres:postgres@127.0.0.1:54322/postgres.",
    )
    parser.add_argument(
        "--confirm-local-dev-import",
        help=f"Required with --apply-local. Must equal {LOCAL_CONFIRMATION_TOKEN!r}.",
    )
    parser.add_argument(
        "--psql-command",
        default="psql",
        help="psql executable used for host local/dev preflight checks. Defaults to psql.",
    )
    parser.add_argument(
        "--psql-mode",
        choices=("host", "docker"),
        default="host",
        help="Run preflight SELECT queries with host psql or the local Supabase Docker DB container.",
    )
    parser.add_argument(
        "--docker-container",
        help="Local Supabase DB container name, required with --psql-mode docker.",
    )
    args = parser.parse_args()

    if args.apply:
        print("Refusing --apply: generic apply remains disabled. Use --apply-local preflight.", file=sys.stderr)
        return 2
    if (args.apply_local or args.apply_local_import) and not args.local_db_url:
        print("Refusing local apply path without --local-db-url.", file=sys.stderr)
        return 2

    workbook = Path(args.workbook).expanduser().resolve()
    if not workbook.exists():
        print(f"Workbook not found: {workbook}", file=sys.stderr)
        return 2

    manifest = build_manifest(workbook, include_planned_rows=args.apply_local or args.apply_local_import)

    if args.apply_local or args.apply_local_import:
        try:
            manifest["local_apply_preflight"] = local_apply_preflight(
                manifest=manifest,
                db_url=args.local_db_url,
                confirmation_token=args.confirm_local_dev_import,
                psql_command=args.psql_command,
                psql_mode=args.psql_mode,
                docker_container=args.docker_container,
            )
            manifest["mode"] = "apply_local_preflight"
            manifest["actual_import_run"] = False
            manifest["read_only"] = not args.apply_local_import
            manifest["status"] = "local_apply_preflight_ready_no_import_run"
            if args.apply_local_import:
                import_report = run_local_import_transaction(
                    manifest=manifest,
                    preflight=manifest["local_apply_preflight"],
                    db_url=args.local_db_url,
                    psql_command=args.psql_command,
                    psql_mode=args.psql_mode,
                    docker_container=args.docker_container,
                )
                manifest["local_import"] = import_report
                manifest["mode"] = "apply_local_import"
                manifest["read_only"] = False
                manifest["actual_import_run"] = True
                manifest["status"] = import_report.get("status", "local_import_completed")
        except (OSError, ValueError) as error:
            manifest["mode"] = "apply_local_preflight"
            manifest["read_only"] = not args.apply_local_import
            manifest["actual_import_run"] = False
            manifest["status"] = "blocked_by_local_apply_preflight"
            if isinstance(error, LocalPreflightError):
                manifest.update(error.details)
            manifest["blocked_rows"].append(
                {
                    "scope": "local_apply_preflight",
                    "message": str(error),
                }
            )

    manifest.pop("planned_rows_by_table", None)
    text = json.dumps(manifest, indent=2, sort_keys=True)
    print(text)

    if args.report:
        report_path = Path(args.report).expanduser().resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(text + "\n")
        print(f"Dry-run manifest written: {report_path}")

    return 1 if manifest["blocked_rows"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
