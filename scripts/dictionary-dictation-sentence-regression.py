#!/usr/bin/env python3
"""Local regression coverage for the canonical dictation sentence CSV contract."""

from __future__ import annotations

import csv
import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv"
VALIDATOR = ROOT / "scripts/validate-teaching-dictionary-csv.py"
TMP = ROOT / ".tmp/dictionary-dictation-sentence-regression"


def validate(folder: Path) -> dict:
    report = folder.parent / "report.json"
    result = subprocess.run([sys.executable, str(VALIDATOR), str(folder), "--report", str(report)], cwd=ROOT, capture_output=True, text=True)
    payload = json.loads(report.read_text(encoding="utf-8"))
    payload["returncode"] = result.returncode
    return payload


def main() -> int:
    shutil.rmtree(TMP, ignore_errors=True)
    shutil.copytree(SOURCE, TMP / "csv")
    csv_path = TMP / "csv/dictation_sentences.csv"
    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = reader.fieldnames
    assert fields is not None
    assert len(rows) == 875
    assert len({row["word_key"] for row in rows}) == 875
    assert {row["review_status"] for row in rows} in ({"ai_draft"}, {"approved_for_first_exposure"})
    assert all(row["audio_text"] == row["dictation_sentence"] for row in rows)
    assert validate(TMP / "csv")["summary"]["errors"] == 0

    rows.pop()
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    invalid = validate(TMP / "csv")
    assert invalid["summary"]["errors"] > 0
    assert any("exactly one row for every active approved canonical word" in issue["message"] for issue in invalid["issues"])
    print("dictionary-dictation-sentence-regression: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
