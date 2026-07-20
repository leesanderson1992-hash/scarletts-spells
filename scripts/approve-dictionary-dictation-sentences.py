#!/usr/bin/env python3
"""Apply one explicit human approval to reviewed dictionary dictation rows."""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/dictation_sentences.csv"


def main() -> int:
    parser = argparse.ArgumentParser(description="Mark reviewed dictation sentence rows approved.")
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--approved-at", default=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"))
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--confirm", action="store_true", help="Required acknowledgement that every row was human reviewed.")
    args = parser.parse_args()
    if not args.confirm:
        parser.error("Refusing approval without --confirm.")
    with args.csv.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = reader.fieldnames
    if not fields:
        raise ValueError("CSV has no header.")
    for row in rows:
        if not row.get("dictation_sentence", "").strip():
            raise ValueError(f"Cannot approve blank sentence for {row.get('word_key')!r}.")
        row["review_status"] = "approved_for_first_exposure"
        row["reviewed_by"] = args.reviewer
        row["reviewed_at"] = args.approved_at
    with args.csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Approved {len(rows)} dictionary dictation sentences.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
