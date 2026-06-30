#!/usr/bin/env python3
"""Regression coverage for the Phase 5F teaching dictionary CSV importer.

These checks are local and no-Supabase. They assert dry-run planning and
preflight refusal behavior only.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/import-teaching-dictionary-csv.py"
FIXTURES = ROOT / "scripts/fixtures/teaching-dictionary-csv"
TMP = ROOT / ".tmp/teaching-dictionary-import-regression"
LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
CONFIRM = "canonical-teaching-dictionary-local-dev"


def run_cmd(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def normalize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    normalized = json.loads(json.dumps(manifest))
    normalized["csv_folder"] = "<csv_folder>"
    normalized["source_commit"] = "<source_commit>"
    if "validation" in normalized:
        normalized["validation"]["input_folder"] = "<csv_folder>"
    return normalized


def main() -> int:
    TMP.mkdir(parents=True, exist_ok=True)
    importer_source = SCRIPT.read_text(encoding="utf-8")
    assert_true(
        "db_active_signed_off_content_conflicts" in importer_source,
        "Importer must preflight existing active signed-off content conflicts.",
    )
    assert_true(
        "active.final_readiness_review_status = 'signed_off'" in importer_source,
        "Importer must query existing active signed-off content before local import.",
    )

    help_result = run_cmd(["--help"])
    assert_true(help_result.returncode == 0, "--help should exit 0.")
    assert_true("--apply-local-import" in help_result.stdout, "Help output should mention --apply-local-import.")

    valid_report = TMP / "valid-import-plan.json"
    valid_result = run_cmd([str(FIXTURES / "valid_first_exposure_pg"), "--report", str(valid_report)])
    assert_true(valid_result.returncode == 0, valid_result.stderr or valid_result.stdout)
    valid_manifest = read_json(valid_report)
    assert_true(valid_manifest["status"] == "ready_for_local_preflight", "Valid fixture should plan cleanly.")
    assert_true(valid_manifest["read_only"] is True, "Dry-run must be read-only.")
    assert_true(valid_manifest["actual_import_run"] is False, "Dry-run must not import.")
    assert_true(
        valid_manifest["planned_inserts_by_table"]["canonical_teaching_dictionary_words"] == 2,
        "Valid fixture should plan two word rows.",
    )
    assert_true(
        valid_manifest["planned_inserts_by_table"]["canonical_teaching_dictionary_readiness_reports"] == 1,
        "Valid fixture should plan one readiness report.",
    )
    assert_true(
        valid_manifest["readiness_summary"]["ready_for_first_exposure"] == 1,
        "Valid fixture should preserve readiness summary.",
    )
    first_report = normalize_manifest(valid_manifest)
    second_report_path = TMP / "valid-import-plan-repeat.json"
    second_result = run_cmd([str(FIXTURES / "valid_first_exposure_pg"), "--report", str(second_report_path)])
    assert_true(second_result.returncode == 0, second_result.stderr or second_result.stdout)
    second_report = normalize_manifest(read_json(second_report_path))
    assert_true(first_report == second_report, "Dry-run manifest should be deterministic after path/commit normalization.")

    invalid_report = TMP / "unknown-skill-import-plan.json"
    invalid_result = run_cmd([str(FIXTURES / "unknown_micro_skill_key"), "--report", str(invalid_report)])
    assert_true(invalid_result.returncode == 2, "Invalid fixture should refuse planning.")
    invalid_manifest = read_json(invalid_report)
    assert_true(invalid_manifest["status"] == "blocked_by_validation_errors", "Invalid fixture should be validation-blocked.")
    assert_true(invalid_manifest["validation"]["summary"]["errors"] > 0, "Invalid fixture should include validator errors.")

    apply_result = run_cmd([str(FIXTURES / "valid_first_exposure_pg"), "--apply"])
    assert_true(apply_result.returncode == 2, "Generic --apply must refuse.")
    assert_true("Refusing --apply" in apply_result.stderr, "Generic --apply refusal should be explicit.")

    no_url_result = run_cmd([str(FIXTURES / "valid_first_exposure_pg"), "--apply-local"])
    assert_true(no_url_result.returncode == 2, "Local preflight without URL must refuse.")
    assert_true("without --local-db-url" in no_url_result.stderr, "Missing URL refusal should be explicit.")

    no_confirm_result = run_cmd([str(FIXTURES / "valid_first_exposure_pg"), "--apply-local", "--local-db-url", LOCAL_URL])
    assert_true(no_confirm_result.returncode == 2, "Local preflight without confirmation must refuse.")
    assert_true("confirm-local-dev-import" in no_confirm_result.stderr, "Missing confirmation refusal should be explicit.")

    hosted_result = run_cmd(
        [
            str(FIXTURES / "valid_first_exposure_pg"),
            "--apply-local",
            "--local-db-url",
            "postgresql://postgres:postgres@example.supabase.co:5432/postgres",
            "--confirm-local-dev-import",
            CONFIRM,
        ]
    )
    assert_true(hosted_result.returncode == 2, "Hosted DB URL must refuse before psql.")
    assert_true("Refusing non-local database host" in hosted_result.stderr, "Hosted URL refusal should be explicit.")

    duplicate_result = run_cmd(
        [
            str(FIXTURES / "duplicate_active_version"),
            "--apply-local",
            "--local-db-url",
            LOCAL_URL,
            "--confirm-local-dev-import",
            CONFIRM,
        ]
    )
    assert_true(duplicate_result.returncode == 2, "Duplicate active fixture must block before local import.")
    assert_true(
        "validator reported structural errors" in duplicate_result.stderr,
        "Duplicate active fixture should block through validator structural errors.",
    )

    print("import-teaching-dictionary-csv-regression: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
