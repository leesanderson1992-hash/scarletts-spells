#!/usr/bin/env python3
"""Validate the pre-review 1,000-word candidate package without promoting it."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path


FORCED = {"belief", "brownie", "diabetes", "either", "immigrants", "summary"}


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    package, issues = args.package, []
    csv_dir = package / "csv"
    words = rows(csv_dir / "canonical_words.csv")
    metadata = rows(csv_dir / "canonical_word_metadata.csv")
    morphology = rows(csv_dir / "canonical_word_morphology.csv")
    dictations = rows(csv_dir / "dictation_sentences.csv")
    sources = rows(csv_dir / "teaching_content_sources.csv")
    snapshot = json.loads((package / "production-snapshot.json").read_text())
    manifest = json.loads((package / "manifest.json").read_text())

    def check(condition: bool, code: str, message: str) -> None:
        if not condition: issues.append({"code": code, "message": message})

    word_keys = [row["word_key"] for row in words]
    normalised = [row["normalised_word"] for row in words]
    active = {row["normalised_word"] for row in snapshot["activeWords"]}
    check(len(words) == 1000, "word_count", f"Expected 1000 words, found {len(words)}")
    check(len(set(word_keys)) == 1000 and len(set(normalised)) == 1000, "word_uniqueness", "Word keys or identities are duplicated")
    check(not (set(normalised) & active), "production_collision", "Candidate identities collide with the production snapshot")
    check(FORCED.issubset(set(normalised)), "forced_words", "A forced learner-demand word is missing")
    check(len(metadata) == 1000 and {row["word_key"] for row in metadata} == set(word_keys), "metadata_coverage", "Metadata coverage is not exactly one row per word")
    check(len(dictations) == 1000 and {row["word_key"] for row in dictations} == set(word_keys), "dictation_coverage", "Dictation coverage is not exactly one row per word")
    check(not (csv_dir / "micro_skill_word_support.csv").exists(), "no_support_links", "Canonical-word readiness batches must not include word-to-skill support links")
    check(len(morphology) == 1000 and {row["word_key"] for row in morphology} == set(word_keys), "morphology_coverage", "Morphology coverage is not exactly one row per word")
    check(all(row["analysis_status"] == "in_review" and row["review_status"] == "in_review" for row in morphology), "fail_closed_morphology", "Pre-review morphology must remain in_review")
    check(all(row["row_status"] == "draft" and row["review_status"] == "in_review" for row in words), "fail_closed_words", "Pre-review words must remain draft/in_review")
    check(all(row["review_status"] == "in_review" for row in metadata + morphology + dictations), "fail_closed_content", "Pre-review content must remain in_review")
    for row in dictations:
        tokens = row["dictation_sentence"].split()
        index = int(row["dictation_target_token_index"])
        actual = re.sub(r"^[^\w']+|[^\w']+$", "", tokens[index]).lower() if 0 <= index < len(tokens) else ""
        expected = next(word["normalised_word"] for word in words if word["word_key"] == row["word_key"])
        check(actual == expected, "dictation_target", f"{row['word_key']} target index does not identify the word")
    check(any(row["importability_status"] != "importable" or row["legal_review_status"] not in {"passed", "not_required"} for row in sources), "source_gate", "Pre-review package should retain the unresolved source gate")
    checksum = hashlib.sha256("\n".join(normalised).encode()).hexdigest()
    check(checksum == manifest["selectionSha256"], "selection_checksum", "Selection checksum does not match manifest")

    check(manifest.get("batchType") == "canonical_word_only" and manifest.get("supportRows") == 0, "manifest_contract", "Manifest must declare a zero-support canonical-word-only package")
    report = {"schemaVersion": "canonical_word_readiness_validation_v1", "status": "valid_human_review_required" if not issues else "invalid", "issues": issues, "counts": {"words": len(words), "metadata": len(metadata), "morphology": len(morphology), "support_links": 0, "dictations": len(dictations), "sources": len(sources)}, "protectedTableCounts": snapshot["protectedTableCounts"]}
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    if issues: raise SystemExit(1)


if __name__ == "__main__":
    main()
