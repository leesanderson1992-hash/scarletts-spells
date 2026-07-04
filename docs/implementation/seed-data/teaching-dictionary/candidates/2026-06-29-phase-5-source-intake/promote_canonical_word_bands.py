#!/usr/bin/env python3
"""Promote reviewed frequency/age band recommendations into canonical_words.csv.

This script is candidate-data only. It updates exactly two fields in
csv/canonical_words.csv: frequency_band and age_band. It does not import data,
touch Supabase, create migrations, or change runtime behavior.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


BASE = Path(__file__).resolve().parent
CSV_DIR = BASE / "csv"

WORDS_PATH = CSV_DIR / "canonical_words.csv"
BEFORE_PATH = BASE / "canonical_words_before_band_promotion.csv"
RECOMMENDATIONS_PATH = BASE / "canonical_words_frequency_aoa_band_recommendations.csv"
AUDIT_PATH = BASE / "canonical_words_band_promotion_audit.csv"
SUMMARY_PATH = BASE / "canonical_words_band_promotion_summary.json"
BUILD_SUMMARY_PATH = BASE / "build_summary.json"

ALLOWED_CHANGED_FIELDS = {"frequency_band", "age_band"}


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def update_json(path: Path, updates: dict[str, Any]) -> None:
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    data.update(updates)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    word_fields, word_rows = read_csv(WORDS_PATH)
    before_fields, before_rows = read_csv(BEFORE_PATH)
    rec_fields, rec_rows = read_csv(RECOMMENDATIONS_PATH)

    if word_fields != before_fields:
        raise SystemExit("Current canonical_words.csv headers differ from before snapshot")
    if len(word_rows) != 874 or len({row["word_key"] for row in word_rows}) != 874:
        raise SystemExit("Expected 874 unique canonical word rows")
    if [row["word_key"] for row in word_rows] != [row["word_key"] for row in before_rows]:
        raise SystemExit("Before snapshot row order does not match canonical_words.csv")
    if [row["word_key"] for row in word_rows] != [row["word_key"] for row in rec_rows]:
        raise SystemExit("Recommendation row order does not match canonical_words.csv")

    required_rec_fields = {
        "recommended_frequency_band",
        "recommended_age_band",
        "recommended_age_number",
        "frequency_source_used",
        "age_source_status",
        "age_review_flags",
    }
    missing_fields = sorted(required_rec_fields - set(rec_fields))
    if missing_fields:
        raise SystemExit(f"Recommendation file missing required fields: {missing_fields}")

    audit_rows: list[dict[str, str]] = []
    promoted_rows: list[dict[str, str]] = []
    changed_field_violations: list[str] = []
    frequency_before = Counter()
    frequency_after = Counter()
    age_before = Counter()
    age_after = Counter()

    for before_row, current_row, rec_row in zip(before_rows, word_rows, rec_rows):
        promoted_frequency = rec_row["recommended_frequency_band"].strip()
        promoted_age = rec_row["recommended_age_band"].strip()
        if not promoted_frequency:
            raise SystemExit(f"Blank promoted frequency_band for {current_row['word_key']}")
        if not promoted_age:
            raise SystemExit(f"Blank promoted age_band for {current_row['word_key']}")

        promoted = dict(current_row)
        promoted["frequency_band"] = promoted_frequency
        promoted["age_band"] = promoted_age

        for field in word_fields:
            if promoted[field] != current_row[field] and field not in ALLOWED_CHANGED_FIELDS:
                changed_field_violations.append(f"{current_row['word_key']}:{field}")

        frequency_before[current_row["frequency_band"]] += 1
        frequency_after[promoted_frequency] += 1
        age_before[current_row["age_band"]] += 1
        age_after[promoted_age] += 1

        audit_rows.append(
            {
                "word_key": current_row["word_key"],
                "normalised_word": current_row["normalised_word"],
                "display_word": current_row["display_word"],
                "dialect_code": current_row["dialect_code"],
                "previous_frequency_band": current_row["frequency_band"],
                "promoted_frequency_band": promoted_frequency,
                "frequency_changed": str(current_row["frequency_band"] != promoted_frequency).upper(),
                "frequency_source_used": rec_row.get("frequency_source_used", ""),
                "recommended_frequency_band": rec_row.get("recommended_frequency_band", ""),
                "previous_age_band": current_row["age_band"],
                "promoted_age_band": promoted_age,
                "age_changed": str(current_row["age_band"] != promoted_age).upper(),
                "recommended_age_number": rec_row.get("recommended_age_number", ""),
                "recommended_age_number_unrounded": rec_row.get("recommended_age_number_unrounded", ""),
                "age_source_status": rec_row.get("age_source_status", ""),
                "age_review_flags": rec_row.get("age_review_flags", ""),
                "promotion_status": "promoted",
                "review_notes": "Reviewed band recommendation promoted into candidate canonical_words.csv.",
            }
        )
        promoted_rows.append(promoted)

    if changed_field_violations:
        raise SystemExit(
            "Promotion attempted to change non-band fields: "
            + ", ".join(changed_field_violations[:20])
        )

    write_csv(WORDS_PATH, word_fields, promoted_rows)
    write_csv(AUDIT_PATH, list(audit_rows[0].keys()), audit_rows)

    summary = {
        "generated_at": date.today().isoformat(),
        "rows": len(promoted_rows),
        "unique_word_keys": len({row["word_key"] for row in promoted_rows}),
        "before_snapshot_file": str(BEFORE_PATH.relative_to(Path.cwd())),
        "audit_file": str(AUDIT_PATH.relative_to(Path.cwd())),
        "recommendations_file": str(RECOMMENDATIONS_PATH.relative_to(Path.cwd())),
        "updated_file": str(WORDS_PATH.relative_to(Path.cwd())),
        "changed_fields": sorted(ALLOWED_CHANGED_FIELDS),
        "non_band_fields_changed": 0,
        "frequency_band_before_counts": dict(frequency_before),
        "frequency_band_after_counts": dict(frequency_after),
        "age_band_before_counts": dict(age_before),
        "age_band_after_counts": dict(age_after),
        "frequency_rows_changed": sum(row["frequency_changed"] == "TRUE" for row in audit_rows),
        "age_rows_changed": sum(row["age_changed"] == "TRUE" for row in audit_rows),
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
    update_json(
        BUILD_SUMMARY_PATH,
        {
            "canonical_words_band_promotion_completed": True,
            "canonical_words_band_promotion_rows": len(promoted_rows),
            "canonical_words_frequency_band_values_promoted": True,
            "canonical_words_age_band_values_promoted": True,
            "canonical_words_frequency_band_counts_after_promotion": dict(frequency_after),
            "canonical_words_age_band_counts_after_promotion": dict(age_after),
        },
    )
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
