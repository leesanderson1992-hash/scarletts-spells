#!/usr/bin/env python3
"""Fail-closed checks for comparative dictionary review candidates."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def token(value: str) -> str:
    return re.sub(r"^[^\w']+|[^\w']+$", "", value).lower()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidate_json", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.candidate_json.read_text(encoding="utf-8"))
    words = payload.get("rows", [])
    issues: list[str] = []
    if payload.get("schemaVersion") != "comparative_dictionary_candidates_v1" or payload.get("status") != "in_review" or payload.get("productionMutationAuthorisedByThisFile") is not False:
        issues.append("candidate_authority_not_fail_closed")
    if payload.get("counts") != {"approvedFamilies": 24, "approvedForms": 72, "existingCanonicalForms": 47, "newCanonicalCandidates": 25}:
        issues.append("scope_counts_mismatch")
    if len(words) != 25 or len({row.get("word") for row in words}) != 25 or len({row.get("wordKey") for row in words}) != 25:
        issues.append("candidate_word_uniqueness_or_count")
    for row in words:
        word = row["word"]
        for field in ("frequencyBandCandidate", "ageBandCandidate", "complexityBandCandidate", "britishIpaCandidate", "syllablesCandidate", "stressPatternCandidate", "hasSchwaCandidate", "childWordSumCandidate", "transformationNotesCandidate", "dictationSentenceCandidate", "audioTextCandidate", "ipaSource", "ageEvidence"):
            if row.get(field) in (None, ""):
                issues.append(f"{word}:missing:{field}")
        if row.get("reviewStatus") != "in_review" or row.get("reviewedBy") or row.get("reviewedAt"):
            issues.append(f"{word}:premature_review_authority")
        if row.get("wordKey") != f"{word}_en_gb":
            issues.append(f"{word}:word_key")
        sentence = row.get("dictationSentenceCandidate", "")
        hits = [i for i, part in enumerate(sentence.split()) if token(part) == word]
        if len(hits) != 1 or hits[0] != row.get("dictationTargetTokenIndexCandidate") or sentence != row.get("audioTextCandidate"):
            issues.append(f"{word}:dictation_binding")
        parts = row.get("morphologyPartsCandidate", [])
        if not parts or parts[0] != {"text": row.get("base"), "type": "base"}:
            issues.append(f"{word}:morphology_base")
        if row.get("degree") != "base" and (len(parts) != 2 or parts[1].get("type") != "suffix" or parts[1].get("text") not in {"er", "est"}):
            issues.append(f"{word}:morphology_suffix")
    if len([row for row in words if row.get("ipaMatchStatus") == "exact_source_match"]) != 24:
        issues.append("british_ipa_coverage_changed")
    if len([row for row in words if row.get("syllableAgreement") != "agree"]) != 6:
        issues.append("pronunciation_review_count_changed")
    if {row["word"] for row in words if row.get("adjectiveEvidenceStatus", "").startswith("no MorphoLex")} != {"close", "wetter"}:
        issues.append("adjective_sense_review_changed")
    if next(row for row in words if row["word"] == "close")["hasSchwaCandidate"] != "FALSE":
        issues.append("close_adjective_pronunciation_wrong")
    report = {"status": "valid_human_review_required" if not issues else "invalid", "wordCount": len(words), "issues": issues}
    print(json.dumps(report))
    if issues:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
