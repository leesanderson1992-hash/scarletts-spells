#!/usr/bin/env python3
"""Regression coverage for the individual base-word family lesson audit."""

from __future__ import annotations

import csv
import importlib.util
import shutil
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv"
SCRIPT = ROOT / "scripts/audit-base-word-family-lessons.py"


def load_module():
    spec = importlib.util.spec_from_file_location("base_word_family_lesson_audit", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def status_by_family(results):
    return {result.family_key: result.status for result in results}


def main() -> int:
    module = load_module()
    results = module.audit(SOURCE)
    statuses = status_by_family(results)
    assert len(results) == 85, "reference play/govern families must be excluded from the review batch"
    assert statuses["act_base_family"] == "ready_for_individual_family_lesson", "act must remain a complete standalone-family example"
    assert all(result.status in {"ready_for_individual_family_lesson", "requires_mixed_family_targets", "incomplete_approved_content"} for result in results)

    with tempfile.TemporaryDirectory() as tmp:
        copied = Path(tmp) / "csv"
        shutil.copytree(SOURCE, copied)
        members_path = copied / "base_word_family_members.csv"
        with members_path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            rows = list(reader)
            fields = reader.fieldnames
        assert fields is not None
        for row in rows:
            if row["base_family_key"] == "act_base_family" and row["word_key"] == "actor_en_gb":
                row["assignment_eligible"] = "FALSE"
        with members_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        damaged = status_by_family(module.audit(copied))
        assert damaged["act_base_family"] != "ready_for_individual_family_lesson", "loss of a required transfer must fail the standalone-family audit"

    print("base-word-family-lesson-audit-regression: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
