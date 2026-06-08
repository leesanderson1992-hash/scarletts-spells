#!/usr/bin/env python3
"""Dry-run planner for canonical spelling word-map storage imports.

This script intentionally performs no Supabase writes. It validates the workbook
with the Stage 2B validator, builds table-shaped planned rows, and emits a JSON
manifest that can be reviewed before any separately-authorized import slice.
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


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = (
    ROOT
    / "docs/implementation/seed-data/canonical-spelling-word-map/"
    / "canonical-spelling-word-map-v1.xlsx"
)
VALIDATOR_PATH = ROOT / "scripts/validate-canonical-spelling-word-map.py"

SHEET_TO_TABLE = {
    "word_metadata": "canonical_spelling_word_metadata",
    "micro_skill_diversity_groups": "canonical_spelling_word_map_diversity_groups",
    "micro_skill_word_bank": "canonical_spelling_word_map_words",
    "contrast_pairs": "canonical_spelling_word_map_contrast_pairs",
    "diagnostic_misspelling_mappings": "canonical_spelling_word_map_diagnostic_examples",
    "lesson_route_support": "canonical_spelling_word_map_route_support",
}

HELPER_SHEETS = {"allowed_values", "README"}

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


def build_manifest(workbook: Path) -> dict[str, Any]:
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

    return {
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


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Plan a canonical spelling word-map import without mutating Supabase."
    )
    parser.add_argument("workbook", nargs="?", default=str(DEFAULT_WORKBOOK), help="Path to workbook .xlsx.")
    parser.add_argument("--report", help="Optional JSON manifest output path.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Refused in Stage 2C.1. This script is dry-run only.",
    )
    args = parser.parse_args()

    if args.apply:
        print("Refusing --apply: Stage 2C.1 importer is dry-run only.", file=sys.stderr)
        return 2

    workbook = Path(args.workbook).expanduser().resolve()
    if not workbook.exists():
        print(f"Workbook not found: {workbook}", file=sys.stderr)
        return 2

    manifest = build_manifest(workbook)
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
