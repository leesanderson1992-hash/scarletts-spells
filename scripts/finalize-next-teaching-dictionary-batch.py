#!/usr/bin/env python3
"""Emit approved CSVs only after complete named workbook review."""

from __future__ import annotations

import argparse
import csv
import json
import shutil
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


APPROVED = "approved"


def clean(value: Any) -> str:
    return str(value or "").strip()


def rows_from_sheet(workbook: Any, name: str) -> list[dict[str, str]]:
    sheet = workbook[name]
    values = sheet.iter_rows(values_only=True)
    headers = [clean(value) for value in next(values)]
    return [dict(zip(headers, (clean(value) for value in row))) for row in values if any(clean(value) for value in row)]


def require_approved(rows: list[dict[str, str]], gates: list[str], label: str, expected: int | None = None) -> None:
    if expected is not None and len(rows) != expected:
        raise ValueError(f"{label}: expected {expected} rows, found {len(rows)}")
    failures = []
    for index, row in enumerate(rows, 2):
        missing = [gate for gate in gates if row.get(gate) != APPROVED]
        if not row.get("reviewed_by") or not row.get("reviewed_at"):
            missing.append("named_review")
        if missing:
            failures.append({"row": index, "word": row.get("word") or row.get("word_key") or row.get("source_key"), "missing": missing})
    if failures:
        raise ValueError(f"{label}: {len(failures)} rows are not fully approved; first failures: {json.dumps(failures[:10])}")


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def headers(path: Path) -> list[str]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(next(csv.reader(handle)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, required=True)
    parser.add_argument("--candidate-csv", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    workbook = load_workbook(args.workbook, read_only=True, data_only=True)
    selection = rows_from_sheet(workbook, "Selection register")
    metadata = rows_from_sheet(workbook, "Metadata review")
    mappings = rows_from_sheet(workbook, "Mapping review")
    dictations = rows_from_sheet(workbook, "Dictation review")
    sources = rows_from_sheet(workbook, "Sources")
    repairs = rows_from_sheet(workbook, "Existing repairs")

    require_approved(selection, ["mapping_review", "morphology_review", "pronunciation_review", "dictation_review", "british_english_review", "accessibility_review", "source_licence_review", "final_decision"], "selection", 1000)
    require_approved(metadata, ["pronunciation_review", "morphology_review", "british_english_review", "final_decision"], "metadata", 1000)
    require_approved(mappings, ["mapping_review", "final_decision"], "mappings")
    require_approved(dictations, ["child_language_review", "british_english_review", "accessibility_review", "final_decision"], "dictations", 1000)
    require_approved(sources, ["source_review"], "sources")
    require_approved(repairs, ["review_status"], "existing repairs")

    generic = [row["word_key"] for row in dictations if row.get("dictation_sentence", "").startswith("The class practised the word ")]
    if generic:
        raise ValueError(f"Dictation review: {len(generic)} generic placeholders remain; first: {generic[:10]}")
    unresolved_sources = [row["source_key"] for row in sources if row.get("importability_status") != "importable" or row.get("legal_review_status") not in {"passed", "not_required"}]
    if unresolved_sources:
        raise ValueError(f"Source review remains blocked: {unresolved_sources}")

    words_path = args.candidate_csv / "canonical_words.csv"
    with words_path.open(encoding="utf-8-sig", newline="") as handle:
        words = list(csv.DictReader(handle))
    for row in words:
        row["row_status"] = "active"
        row["review_status"] = "approved_for_first_exposure"
        row["confidence"] = "high"
    for row in metadata:
        row["review_status"] = "approved_for_first_exposure"
        row["confidence"] = "high"
    for row in mappings:
        row["review_status"] = "approved_for_first_exposure"
        row["confidence"] = "high"
    for row in dictations:
        row["review_status"] = "approved_for_first_exposure"
        row["confidence"] = "high"

    write_csv(args.output / "canonical_words.csv", headers(words_path), words)
    write_csv(args.output / "canonical_word_metadata.csv", headers(args.candidate_csv / "canonical_word_metadata.csv"), metadata)
    write_csv(args.output / "micro_skill_word_support.csv", headers(args.candidate_csv / "micro_skill_word_support.csv"), mappings)
    write_csv(args.output / "dictation_sentences.csv", headers(args.candidate_csv / "dictation_sentences.csv"), dictations)
    write_csv(args.output / "teaching_content_sources.csv", headers(args.candidate_csv / "teaching_content_sources.csv"), sources)
    for filename in ("teaching_content_versions.csv", "teaching_content_field_reviews.csv"):
        shutil.copyfile(args.candidate_csv / filename, args.output / filename)

    (args.output.parent / "approved-existing-row-repairs.json").write_text(json.dumps(repairs, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "approved_csv_emitted", "words": len(words), "metadata": len(metadata), "mappings": len(mappings), "dictations": len(dictations), "repairs": len(repairs)}))


if __name__ == "__main__":
    main()
