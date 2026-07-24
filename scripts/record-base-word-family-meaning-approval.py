#!/usr/bin/env python3
"""Record an explicit human decision for already-generated meaning drafts."""

import argparse
import csv
import hashlib
from datetime import datetime
from pathlib import Path


CSV_PATH = Path(__file__).parent.parent / (
    "docs/implementation/seed-data/teaching-dictionary/candidates/"
    "2026-06-29-phase-5-source-intake/csv/base_word_family_members.csv"
)
CONFIRMATION = "RECORD-HUMAN-BASE-WORD-FAMILY-MEANINGS-APPROVAL-V1"


def meaning_hash(rows: list[dict[str, str]]) -> str:
    value = "\n".join(
        f"{row['word_key']}\u0000{row['child_friendly_meaning']}"
        for row in sorted(rows, key=lambda row: row["word_key"])
    )
    return hashlib.sha256(value.encode()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--reviewed-at", required=True)
    parser.add_argument("--confirm", required=True)
    args = parser.parse_args()
    if args.confirm != CONFIRMATION:
        raise SystemExit("Refusing to record approval without the exact confirmation token.")
    try:
        datetime.fromisoformat(args.reviewed_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise SystemExit("--reviewed-at must be ISO-8601.") from error
    if not args.reviewer.strip():
        raise SystemExit("--reviewer must be non-empty.")

    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = reader.fieldnames or []
    if len(rows) != 227:
        raise SystemExit(f"Expected exactly 227 generated meaning rows, found {len(rows)}.")
    if any(
        not row.get("word_key", "").strip()
        or not row.get("child_friendly_meaning", "").strip()
        or row.get("review_status") != "approved_for_first_exposure"
        for row in rows
    ):
        raise SystemExit("Every row must be populated and already have the approved runtime status.")

    for row in rows:
        row["reviewed_by"] = args.reviewer
        row["reviewed_at"] = args.reviewed_at
        row["source_use_note"] = (
            "Child-friendly meaning reviewed and approved by a named human; "
            "this record does not approve route activation or other curriculum fields."
        )
    with CSV_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print({"rows": len(rows), "reviewer": args.reviewer, "reviewed_at": args.reviewed_at, "meaning_sha256": meaning_hash(rows)})


if __name__ == "__main__":
    main()
