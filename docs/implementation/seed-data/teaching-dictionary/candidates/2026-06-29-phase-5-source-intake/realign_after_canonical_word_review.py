#!/usr/bin/env python3
"""Realign dependent candidate CSVs after canonical_words.csv review edits.

The reviewed canonical_words.csv is treated as the authority for this candidate
folder. This script keeps its first row for each word_key, records duplicate
rows in an audit CSV, removes dependent rows/references for deleted word_keys,
and adds draft placeholder metadata rows for newly added word_keys.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


CANDIDATE_DIR = Path(__file__).resolve().parent
CSV_DIR = CANDIDATE_DIR / "csv"

METADATA_HEADERS = [
    "word_key",
    "syllables",
    "phoneme_hint",
    "grapheme_notes",
    "stress_pattern",
    "has_schwa",
    "morphemes",
    "morphology_notes",
    "irregularity_notes",
    "source_category",
    "source_name",
    "source_url",
    "source_licence",
    "source_use_note",
    "confidence",
    "review_status",
]

AUDIT_HEADERS = [
    "file",
    "row_number",
    "word_key",
    "field",
    "value",
    "action",
    "reason",
]


def clean(value: Any) -> str:
    return str(value or "").strip()


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        rows = []
        for index, row in enumerate(reader, start=2):
            cleaned = {header: clean(row.get(header)) for header in headers}
            cleaned["__row_number"] = str(index)
            rows.append(cleaned)
        return headers, rows


def write_csv(path: Path, headers: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: clean(row.get(header)) for header in headers})


def split_keys(value: str) -> list[str]:
    return [part.strip() for part in clean(value).split("|") if part.strip()]


def main() -> None:
    audit: list[dict[str, str]] = []
    duplicate_word_rows: list[dict[str, str]] = []

    word_headers, word_rows = read_csv(CSV_DIR / "canonical_words.csv")
    unique_words: list[dict[str, str]] = []
    words_by_key: dict[str, dict[str, str]] = {}
    for row in word_rows:
        key = clean(row.get("word_key"))
        if key in words_by_key:
            duplicate_word_rows.append(row)
            audit.append(
                {
                    "file": "canonical_words.csv",
                    "row_number": row["__row_number"],
                    "word_key": key,
                    "field": "word_key",
                    "value": key,
                    "action": "removed_duplicate_word_row",
                    "reason": "canonical_words.csv must have one row per word_key; kept the first occurrence.",
                }
            )
            continue
        words_by_key[key] = row
        unique_words.append(row)

    word_keys = set(words_by_key)
    write_csv(CSV_DIR / "canonical_words.csv", word_headers, unique_words)
    write_csv(CANDIDATE_DIR / "canonical_words_duplicate_rows_removed.csv", word_headers, duplicate_word_rows)

    metadata_headers, metadata_rows = read_csv(CSV_DIR / "canonical_word_metadata.csv")
    metadata_by_key: dict[str, dict[str, str]] = {}
    kept_metadata: list[dict[str, str]] = []
    dropped_metadata: list[dict[str, str]] = []
    duplicate_metadata = 0

    for row in metadata_rows:
        key = clean(row.get("word_key"))
        if key not in word_keys:
            dropped_metadata.append(row)
            audit.append(
                {
                    "file": "canonical_word_metadata.csv",
                    "row_number": row["__row_number"],
                    "word_key": key,
                    "field": "word_key",
                    "value": key,
                    "action": "removed_row",
                    "reason": "word_key is no longer present in reviewed canonical_words.csv.",
                }
            )
            continue
        if key in metadata_by_key:
            duplicate_metadata += 1
            audit.append(
                {
                    "file": "canonical_word_metadata.csv",
                    "row_number": row["__row_number"],
                    "word_key": key,
                    "field": "word_key",
                    "value": key,
                    "action": "removed_duplicate_metadata_row",
                    "reason": "kept the first metadata row for this word_key.",
                }
            )
            continue
        metadata_by_key[key] = row
        kept_metadata.append(row)

    placeholder_metadata = 0
    for key in sorted(word_keys - set(metadata_by_key)):
        word = words_by_key[key]
        kept_metadata.append(
            {
                "word_key": key,
                "syllables": "",
                "phoneme_hint": "",
                "grapheme_notes": "",
                "stress_pattern": "",
                "has_schwa": "FALSE",
                "morphemes": "",
                "morphology_notes": "",
                "irregularity_notes": "",
                "source_category": clean(word.get("source_category")),
                "source_name": clean(word.get("source_name")),
                "source_url": clean(word.get("source_url")),
                "source_licence": clean(word.get("source_licence")),
                "source_use_note": (
                    clean(word.get("source_use_note"))
                    + " Metadata placeholder added after canonical word review; requires human review."
                ).strip(),
                "confidence": "low",
                "review_status": "draft",
            }
        )
        placeholder_metadata += 1
        audit.append(
            {
                "file": "canonical_word_metadata.csv",
                "row_number": "",
                "word_key": key,
                "field": "word_key",
                "value": key,
                "action": "added_placeholder_metadata_row",
                "reason": "new reviewed word_key had no metadata row yet.",
            }
        )

    write_csv(
        CSV_DIR / "canonical_word_metadata.csv",
        metadata_headers or METADATA_HEADERS,
        sorted(kept_metadata, key=lambda row: clean(row.get("word_key"))),
    )

    mapping_headers, mapping_rows = read_csv(CSV_DIR / "canonical_word_micro_skills.csv")
    kept_mappings: list[dict[str, str]] = []
    dropped_mappings = 0
    for row in mapping_rows:
        key = clean(row.get("word_key"))
        if key not in word_keys:
            dropped_mappings += 1
            audit.append(
                {
                    "file": "canonical_word_micro_skills.csv",
                    "row_number": row["__row_number"],
                    "word_key": key,
                    "field": "word_key",
                    "value": key,
                    "action": "removed_row",
                    "reason": "word_key is no longer present in reviewed canonical_words.csv.",
                }
            )
            continue
        kept_mappings.append(row)
    write_csv(CSV_DIR / "canonical_word_micro_skills.csv", mapping_headers, kept_mappings)

    version_headers, version_rows = read_csv(CSV_DIR / "teaching_content_versions.csv")
    teaching_refs_removed = 0
    for row in version_rows:
        anchor = clean(row.get("anchor_word_key"))
        if anchor and anchor not in word_keys:
            audit.append(
                {
                    "file": "teaching_content_versions.csv",
                    "row_number": row["__row_number"],
                    "word_key": anchor,
                    "field": "anchor_word_key",
                    "value": anchor,
                    "action": "cleared_reference",
                    "reason": "anchor_word_key is no longer present in reviewed canonical_words.csv.",
                }
            )
            row["anchor_word_key"] = ""
            teaching_refs_removed += 1
        for field in ["ordered_example_word_keys", "contrast_word_keys"]:
            original = split_keys(row.get(field, ""))
            kept = [key for key in original if key in word_keys]
            removed = [key for key in original if key not in word_keys]
            if removed:
                teaching_refs_removed += len(removed)
                for key in removed:
                    audit.append(
                        {
                            "file": "teaching_content_versions.csv",
                            "row_number": row["__row_number"],
                            "word_key": key,
                            "field": field,
                            "value": key,
                            "action": "removed_list_reference",
                            "reason": f"{field} contained a word_key no longer present in reviewed canonical_words.csv.",
                        }
                    )
                row[field] = "|".join(kept)
    write_csv(CSV_DIR / "teaching_content_versions.csv", version_headers, version_rows)

    unrepresented_path = CANDIDATE_DIR / "unrepresented_rows.csv"
    unrepresented_headers, unrepresented_rows = read_csv(unrepresented_path)
    kept_unrepresented: list[dict[str, str]] = []
    dropped_unrepresented = 0
    for row in unrepresented_rows:
        key = clean(row.get("related_word_key"))
        if key and key not in word_keys:
            dropped_unrepresented += 1
            audit.append(
                {
                    "file": "unrepresented_rows.csv",
                    "row_number": row["__row_number"],
                    "word_key": key,
                    "field": "related_word_key",
                    "value": key,
                    "action": "removed_row",
                    "reason": "related_word_key is no longer present in reviewed canonical_words.csv.",
                }
            )
            continue
        kept_unrepresented.append(row)
    write_csv(unrepresented_path, unrepresented_headers, kept_unrepresented)

    write_csv(CANDIDATE_DIR / "realignment_audit_after_canonical_word_review.csv", AUDIT_HEADERS, audit)

    summary = {
        "canonical_words_input_rows": len(word_rows),
        "canonical_words_rows_after_deduplication": len(unique_words),
        "duplicate_canonical_word_rows_removed": len(duplicate_word_rows),
        "metadata_rows_removed_for_deleted_words": len(dropped_metadata),
        "duplicate_metadata_rows_removed": duplicate_metadata,
        "placeholder_metadata_rows_added": placeholder_metadata,
        "mapping_rows_removed_for_deleted_words": dropped_mappings,
        "teaching_content_word_references_removed_or_cleared": teaching_refs_removed,
        "unrepresented_rows_removed_for_deleted_words": dropped_unrepresented,
        "audit_rows": len(audit),
    }
    (CANDIDATE_DIR / "realignment_summary_after_canonical_word_review.json").write_text(
        json.dumps(summary, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
