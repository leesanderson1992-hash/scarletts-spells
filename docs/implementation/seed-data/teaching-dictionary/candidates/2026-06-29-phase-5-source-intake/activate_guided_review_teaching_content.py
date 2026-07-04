#!/usr/bin/env python3
"""Promote guided-review-only teaching content rows after metadata blockers clear.

This is a candidate CSV maintenance script. It does not import to Supabase or
touch runtime code.
"""

from __future__ import annotations

import csv
import json
import shutil
from collections import Counter
from datetime import date
from pathlib import Path


BASE = Path(__file__).resolve().parent
CSV_PATH = BASE / "csv" / "teaching_content_versions.csv"
VALIDATION_REPORT = BASE / "validation-report-after-phase-5ef-alignment.json"
BEFORE_PATH = BASE / "teaching_content_versions_before_guided_review_activation.csv"
AUDIT_PATH = BASE / "teaching_content_versions_guided_review_activation_audit.csv"
SUMMARY_PATH = BASE / "teaching_content_versions_guided_review_activation_summary.json"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    rows = read_csv(CSV_PATH)
    if not rows:
        raise SystemExit("No teaching content rows found.")

    fieldnames = list(rows[0].keys())
    report = json.loads(VALIDATION_REPORT.read_text(encoding="utf-8"))
    target_keys = {
        (version["micro_skill_key"], version["content_version"])
        for version in report.get("versions", [])
        if version.get("readiness_state") == "ready_for_guided_review_only"
        and version.get("first_exposure_allowed") is False
        and version.get("guided_review_allowed") is True
        and not version.get("blockers")
        and not version.get("warnings")
    }

    if len(target_keys) != 40:
        raise SystemExit(f"Expected 40 activation targets, found {len(target_keys)}.")

    shutil.copyfile(CSV_PATH, BEFORE_PATH)

    audit_rows: list[dict[str, str]] = []
    non_target_changes = 0
    activated = 0
    for row in rows:
        key = (row["micro_skill_key"], row["content_version"])
        before = dict(row)
        if key in target_keys:
            if not (
                row["version_status"] == "in_review"
                and row["is_active"] == "FALSE"
                and row["final_readiness_review_status"] == "signed_off"
            ):
                raise SystemExit(f"Unexpected target state for {key}: {row}")
            row["version_status"] = "active"
            row["is_active"] = "TRUE"
            activated += 1

        changed_fields = [
            name
            for name in fieldnames
            if before.get(name, "") != row.get(name, "")
        ]
        if key not in target_keys and changed_fields:
            non_target_changes += 1
        if key in target_keys:
            audit_rows.append(
                {
                    "micro_skill_key": row["micro_skill_key"],
                    "content_version": row["content_version"],
                    "previous_version_status": before["version_status"],
                    "promoted_version_status": row["version_status"],
                    "previous_is_active": before["is_active"],
                    "promoted_is_active": row["is_active"],
                    "final_readiness_review_status": row["final_readiness_review_status"],
                    "changed_fields": "|".join(changed_fields),
                    "activation_status": "activated_for_first_exposure_candidate",
                }
            )

    if activated != 40:
        raise SystemExit(f"Expected to activate 40 rows, activated {activated}.")
    if non_target_changes:
        raise SystemExit(f"Unexpected non-target row changes: {non_target_changes}.")

    write_csv(CSV_PATH, rows, fieldnames)
    write_csv(
        AUDIT_PATH,
        audit_rows,
        [
            "micro_skill_key",
            "content_version",
            "previous_version_status",
            "promoted_version_status",
            "previous_is_active",
            "promoted_is_active",
            "final_readiness_review_status",
            "changed_fields",
            "activation_status",
        ],
    )

    summary = {
        "generated_at": date.today().isoformat(),
        "updated_file": str(CSV_PATH.relative_to(BASE)),
        "before_snapshot_file": str(BEFORE_PATH.relative_to(BASE)),
        "audit_file": str(AUDIT_PATH.relative_to(BASE)),
        "source_validation_report": str(VALIDATION_REPORT.relative_to(BASE)),
        "rows": len(rows),
        "activated_rows": activated,
        "target_selection": "ready_for_guided_review_only rows with no blockers or warnings in validation-report-after-phase-5ef-alignment.json",
        "changed_fields": ["version_status", "is_active"],
        "status_counts_after": {
            "|".join(key): count
            for key, count in Counter(
                (row["version_status"], row["is_active"], row["final_readiness_review_status"])
                for row in rows
            ).items()
        },
        "hard_boundaries": [
            "no Supabase import",
            "no database mutation",
            "no migrations",
            "no importer changes",
            "no runtime hooks",
            "no resolver changes",
            "no assignment changes",
            "no evidence/proficiency changes",
            "no Word Treasure changes",
        ],
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
