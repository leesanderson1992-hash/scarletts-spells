#!/usr/bin/env python3
"""Local/dev-only micro_skill_catalog prerequisite seeder for Stage 2C.4.

Default mode is a read-only report. Mutation is limited to missing
micro_skill_catalog rows already present in the Domain 4 seed artifacts and is
gated by an explicit local Supabase Postgres URL plus a confirmation token.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
WORD_MAP_IMPORTER = ROOT / "scripts/import-canonical-spelling-word-map.py"
MICRO_SKILLS_ARTIFACT = (
    ROOT / "docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json"
)
MVP1_MANIFEST = ROOT / "docs/implementation/seed-data/domain4-mvp1-seed-manifest.json"

CONFIRMATION_TOKEN = "micro-skill-catalog-local-dev-prereq"

MICRO_SKILL_COLUMNS = [
    "mastery_domain_key",
    "skill_family_key",
    "skill_cluster_key",
    "micro_skill_key",
    "display_name",
    "practice_route",
    "is_assignable",
    "is_active",
    "allowed_template_keys",
    "metadata",
]

PROTECTED_COUNT_TABLES = [
    "micro_skill_catalog",
    "learning_items",
    "learning_item_evidence",
    "assignment_items",
    "spelling_canonical_mappings",
    "spelling_canonical_mapping_events",
    "spelling_canonical_mapping_recommendations",
    "spelling_catalog_review_cases",
    "canonical_spelling_word_map_import_batches",
    "canonical_spelling_word_metadata",
    "canonical_spelling_word_map_diversity_groups",
    "canonical_spelling_word_map_words",
    "canonical_spelling_word_map_contrast_pairs",
    "canonical_spelling_word_map_diagnostic_examples",
    "canonical_spelling_word_map_route_support",
]


def load_word_map_importer():
    spec = importlib.util.spec_from_file_location("canonical_word_map_importer", WORD_MAP_IMPORTER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load importer from {WORD_MAP_IMPORTER}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def read_json(path: Path) -> Any:
    return json.loads(path.read_text("utf-8"))


def quote_sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def quote_sql_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def sql_value(value: Any, jsonb: bool = False, text_array: bool = False) -> str:
    if value is None:
        return "null"
    if text_array:
        if not isinstance(value, list):
            raise ValueError("Expected a list for text[] SQL value.")
        return "array[" + ", ".join(quote_sql_literal(str(item)) for item in value) + "]::text[]"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list)):
        literal = quote_sql_literal(json.dumps(value, sort_keys=True, separators=(",", ":")))
        return f"{literal}::jsonb" if jsonb else literal
    return quote_sql_literal(str(value))


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
        "host": parsed.hostname,
        "port": parsed.port,
        "database": (parsed.path or "").lstrip("/"),
        "username": parsed.username,
        "classification": "local_dev_only",
    }


def psql_command(
    db_url: str,
    sql: str,
    psql_command_name: str,
    psql_mode: str,
    docker_container: str | None,
) -> list[str]:
    if psql_mode == "host":
        return [
            psql_command_name,
            db_url,
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            sql,
        ]
    if psql_mode == "docker":
        if not docker_container:
            raise ValueError("--docker-container is required when --psql-mode docker is used.")
        return [
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
            sql,
        ]
    raise ValueError(f"Unsupported psql mode: {psql_mode!r}.")


def run_psql_json(
    db_url: str,
    sql: str,
    psql_command_name: str,
    psql_mode: str,
    docker_container: str | None,
) -> Any:
    wrapped_sql = (
        "select coalesce(jsonb_agg(row_to_json(result_rows)), '[]'::jsonb) "
        f"from ({sql}) result_rows"
    )
    result = subprocess.run(
        psql_command(db_url, wrapped_sql, psql_command_name, psql_mode, docker_container),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise ValueError((result.stderr or result.stdout).strip())
    return json.loads(result.stdout.strip() or "[]")


def run_psql_text(
    db_url: str,
    sql: str,
    psql_command_name: str,
    psql_mode: str,
    docker_container: str | None,
) -> str:
    result = subprocess.run(
        psql_command(db_url, sql, psql_command_name, psql_mode, docker_container),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise ValueError((result.stderr or result.stdout).strip())
    return result.stdout.strip()


def word_map_micro_skill_keys() -> list[str]:
    importer = load_word_map_importer()
    manifest = importer.build_manifest(importer.DEFAULT_WORKBOOK, include_planned_rows=True)
    if manifest["blocked_rows"]:
        raise ValueError("Word-map dry-run manifest has blocked rows; refusing prerequisite planning.")

    keys: set[str] = set()
    for table, rows in manifest["planned_rows_by_table"].items():
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


def matched_seed_rows(keys: list[str]) -> tuple[list[dict[str, Any]], list[str], dict[str, bool]]:
    artifact_rows = read_json(MICRO_SKILLS_ARTIFACT)
    rows_by_key = {row["micro_skill_key"]: row for row in artifact_rows}
    mvp_manifest = read_json(MVP1_MANIFEST)
    mvp_keys = set(mvp_manifest.get("starter_subset", {}).get("assignable_node_ids", []))

    matched = []
    missing_from_artifacts = []
    mvp_membership = {}
    for key in keys:
        row = rows_by_key.get(key)
        if row is None:
            missing_from_artifacts.append(key)
            continue
        matched.append(row)
        mvp_membership[key] = key in mvp_keys
    return matched, missing_from_artifacts, mvp_membership


def db_table_counts(
    db_url: str,
    psql_command_name: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, int]:
    values = ", ".join(f"({quote_sql_literal(table)})" for table in PROTECTED_COUNT_TABLES)
    existing_rows = run_psql_json(
        db_url,
        f"""
          with requested(table_name) as (values {values}),
          existing as (
            select table_name
            from information_schema.tables
            where table_schema = 'public'
          )
          select requested.table_name
          from requested
          join existing using (table_name)
          order by requested.table_name
        """,
        psql_command_name,
        psql_mode,
        docker_container,
    )
    existing_tables = [row["table_name"] for row in existing_rows]
    if not existing_tables:
        return {}

    selects = [
        (
            f"select {quote_sql_literal(table)} as table_name, "
            f"count(*)::integer as row_count from public.{table}"
        )
        for table in existing_tables
    ]
    count_rows = run_psql_json(
        db_url,
        " union all ".join(selects),
        psql_command_name,
        psql_mode,
        docker_container,
    )
    return {row["table_name"]: int(row["row_count"]) for row in count_rows}


def db_existing_catalog_keys(
    db_url: str,
    keys: list[str],
    psql_command_name: str,
    psql_mode: str,
    docker_container: str | None,
) -> list[str]:
    values = ", ".join(f"({quote_sql_literal(key)})" for key in keys)
    rows = run_psql_json(
        db_url,
        f"""
          select planned.micro_skill_key
          from (values {values}) as planned(micro_skill_key)
          join public.micro_skill_catalog catalog using (micro_skill_key)
          order by planned.micro_skill_key
        """,
        psql_command_name,
        psql_mode,
        docker_container,
    )
    return [row["micro_skill_key"] for row in rows]


def insert_sql(rows: list[dict[str, Any]], missing_keys: list[str]) -> str:
    missing = [row for row in rows if row["micro_skill_key"] in set(missing_keys)]
    if not missing:
        return ""

    columns_sql = ", ".join(quote_sql_identifier(column) for column in MICRO_SKILL_COLUMNS)
    value_rows = []
    for row in missing:
        values = []
        for column in MICRO_SKILL_COLUMNS:
            values.append(
                sql_value(
                    row.get(column),
                    jsonb=column == "metadata",
                    text_array=column == "allowed_template_keys",
                )
            )
        value_rows.append("(" + ", ".join(values) + ")")

    return f"""
      insert into public.micro_skill_catalog ({columns_sql})
      values
      {",\n      ".join(value_rows)}
      on conflict (micro_skill_key) do nothing
    """.strip()


def transaction_sql(rows: list[dict[str, Any]], missing_keys: list[str], before_counts: dict[str, int]) -> str:
    if not missing_keys:
        return "select jsonb_build_object('inserted_count', 0, 'status', 'nothing_to_seed')::text;"

    expected = len(missing_keys)
    protected_values = ", ".join(
        f"({quote_sql_literal(table)}, {count})"
        for table, count in sorted(before_counts.items())
        if table != "micro_skill_catalog"
    )
    protected_check = ""
    if protected_values:
        protected_after = " union all ".join(
            f"select {quote_sql_literal(table)} as table_name, count(*)::integer as row_count from public.{table}"
            for table in sorted(before_counts)
            if table != "micro_skill_catalog"
        )
        protected_check = f"""
          with before_counts(table_name, row_count) as (values {protected_values}),
          after_counts as ({protected_after})
          select count(*) into protected_mismatch_count
          from before_counts
          join after_counts using (table_name)
          where before_counts.row_count <> after_counts.row_count;

          if protected_mismatch_count <> 0 then
            raise exception 'protected table count changed during micro_skill_catalog prerequisite seed';
          end if;
        """

    return f"""
begin;

select pg_advisory_xact_lock(hashtext('stage_2c4_micro_skill_catalog_prereq'));

create temporary table _seeded_micro_skill_catalog_keys (
  micro_skill_key text primary key
) on commit preserve rows;

with inserted as (
  {insert_sql(rows, missing_keys)}
  returning micro_skill_key
)
insert into _seeded_micro_skill_catalog_keys(micro_skill_key)
select micro_skill_key from inserted;

do $$
declare
  inserted_count integer;
  protected_mismatch_count integer;
begin
  select count(*) into inserted_count from _seeded_micro_skill_catalog_keys;
  if inserted_count <> {expected} then
    raise exception 'micro_skill_catalog prerequisite seed expected {expected} inserts, got %', inserted_count;
  end if;

  {protected_check}
end $$;

commit;

select jsonb_build_object(
  'inserted_count', (select count(*) from _seeded_micro_skill_catalog_keys),
  'inserted_micro_skill_keys', (
    select jsonb_agg(micro_skill_key order by micro_skill_key)
    from _seeded_micro_skill_catalog_keys
  ),
  'status', 'local_micro_skill_catalog_prereq_seeded'
)::text;
""".strip()


def build_report(
    db_url: str | None,
    psql_command_name: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, Any]:
    keys = word_map_micro_skill_keys()
    seed_rows, missing_from_artifacts, mvp_membership = matched_seed_rows(keys)
    report: dict[str, Any] = {
        "mode": "dry_run",
        "read_only": True,
        "actual_seed_run": False,
        "actual_word_map_import_run": False,
        "source_artifacts": {
            "word_map_importer": str(WORD_MAP_IMPORTER.relative_to(ROOT)),
            "micro_skills": str(MICRO_SKILLS_ARTIFACT.relative_to(ROOT)),
            "mvp1_manifest": str(MVP1_MANIFEST.relative_to(ROOT)),
        },
        "schema_requirements": {
            "table": "public.micro_skill_catalog",
            "fk_target": "micro_skill_key",
            "required_columns_seeded": MICRO_SKILL_COLUMNS,
            "practice_route_constraint": ["word_practice", "grouped_set_practice"],
            "conflict_policy": "insert missing rows only; on conflict do nothing",
        },
        "word_map_required_micro_skill_keys": keys,
        "missing_from_existing_seed_artifacts": missing_from_artifacts,
        "matched_seed_rows": [
            {
                "micro_skill_key": row["micro_skill_key"],
                "source_artifacts": [
                    str(MICRO_SKILLS_ARTIFACT.relative_to(ROOT)),
                    *([str(MVP1_MANIFEST.relative_to(ROOT))] if mvp_membership[row["micro_skill_key"]] else []),
                ],
                "display_name": row["display_name"],
                "mastery_domain_key": row["mastery_domain_key"],
                "skill_family_key": row["skill_family_key"],
                "skill_cluster_key": row["skill_cluster_key"],
                "practice_route": row["practice_route"],
                "is_active": row["is_active"],
                "is_assignable": row["is_assignable"],
            }
            for row in seed_rows
        ],
        "planned_seed": {
            "authorized_table": "public.micro_skill_catalog",
            "planned_key_count": len(seed_rows),
            "mutation_scope": "local/dev missing prerequisite rows only",
            "blocked_tables": [table for table in PROTECTED_COUNT_TABLES if table != "micro_skill_catalog"],
        },
    }

    if db_url:
        target = require_local_db_url(db_url)
        before_counts = db_table_counts(db_url, psql_command_name, psql_mode, docker_container)
        existing_keys = set(
            db_existing_catalog_keys(db_url, keys, psql_command_name, psql_mode, docker_container)
        )
        missing_keys = [key for key in keys if key not in existing_keys]
        report["target_environment"] = {
            **target,
            "psql_mode": psql_mode,
            "docker_container": docker_container if psql_mode == "docker" else None,
        }
        report["row_counts_before"] = before_counts
        report["local_catalog_readiness_before"] = {
            "required_key_count": len(keys),
            "existing_key_count": len(existing_keys),
            "missing_key_count": len(missing_keys),
            "missing_micro_skill_keys": missing_keys,
        }
        report["planned_seed"]["planned_insert_count"] = len(missing_keys)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Dry-run or locally seed required D4 micro_skill_catalog rows for word-map FK preflight."
    )
    parser.add_argument("--report", help="Optional JSON report output path.")
    parser.add_argument("--local-db-url", help="Explicit local Supabase Postgres URL.")
    parser.add_argument("--apply-local", action="store_true", help="Insert missing local prerequisite rows.")
    parser.add_argument("--confirm-local-dev-seed", help=f"Must equal {CONFIRMATION_TOKEN!r}.")
    parser.add_argument("--psql-command", default="psql")
    parser.add_argument("--psql-mode", choices=("host", "docker"), default="host")
    parser.add_argument("--docker-container")
    args = parser.parse_args()

    if args.apply_local and not args.local_db_url:
        print("Refusing --apply-local without --local-db-url.", file=sys.stderr)
        return 2
    if args.apply_local and args.confirm_local_dev_seed != CONFIRMATION_TOKEN:
        print(
            f"Refusing --apply-local without --confirm-local-dev-seed {CONFIRMATION_TOKEN!r}.",
            file=sys.stderr,
        )
        return 2

    try:
        report = build_report(
            args.local_db_url,
            args.psql_command,
            args.psql_mode,
            args.docker_container,
        )
        if args.apply_local:
            keys = report["word_map_required_micro_skill_keys"]
            seed_rows, _missing_from_artifacts, _mvp_membership = matched_seed_rows(keys)
            missing_keys = report["local_catalog_readiness_before"]["missing_micro_skill_keys"]
            sql = transaction_sql(seed_rows, missing_keys, report["row_counts_before"])
            result = run_psql_text(
                args.local_db_url,
                sql,
                args.psql_command,
                args.psql_mode,
                args.docker_container,
            )
            report["mode"] = "apply_local"
            report["read_only"] = False
            report["actual_seed_run"] = bool(missing_keys)
            report["local_seed_result"] = json.loads(result.splitlines()[-1] or "{}")
            report["row_counts_after"] = db_table_counts(
                args.local_db_url,
                args.psql_command,
                args.psql_mode,
                args.docker_container,
            )
            existing_after = set(
                db_existing_catalog_keys(
                    args.local_db_url,
                    keys,
                    args.psql_command,
                    args.psql_mode,
                    args.docker_container,
                )
            )
            report["local_catalog_readiness_after"] = {
                "required_key_count": len(keys),
                "existing_key_count": len(existing_after),
                "missing_key_count": len([key for key in keys if key not in existing_after]),
                "missing_micro_skill_keys": [key for key in keys if key not in existing_after],
            }
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1

    text = json.dumps(report, indent=2, sort_keys=True)
    print(text)
    if args.report:
        report_path = Path(args.report).expanduser().resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(text + "\n", "utf-8")
        print(f"Report written: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
