#!/usr/bin/env python3
"""Reconcile the reviewed Sheet with a fresh governed inventory before publication.

This is deliberately read-only. Candidate syllable cuts that conflict with a
target remain row-specific blockers; the script never substitutes another cut.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


def cuts_for(raw: str, word: str) -> list[int]:
    if re.fullmatch(r"\d+(?:\s*,\s*\d+)*", raw):
        return [int(piece.strip()) for piece in raw.split(",")]
    if "·" in raw:
        parts = raw.split("·")
    elif "|" in raw:
        parts = raw.split("|")
    elif "-" in raw and "-" not in word:
        parts = raw.split("-")
    elif "." in raw:
        parts = raw.split(".")
    else:
        raise ValueError("CUT_NOT_PARSEABLE")
    parts = [part.strip() for part in parts]
    if len(parts) < 2 or not all(parts) or "".join(parts) != word:
        raise ValueError("CUT_DOES_NOT_RECONSTRUCT_WORD")
    position = 0
    cuts = []
    for part in parts[:-1]:
        position += len(part)
        cuts.append(position)
    return cuts


def issue_report(sheet: dict, source: dict, audio_root: Path) -> list[str]:
    issues: list[str] = []
    word = sheet["word"]
    if sheet["canonical_word_id"] != source["canonical_word_id"]:
        issues.append("CANONICAL_ID_CHANGED")
    if sheet["assignment_status"] != source["assignment_status"]:
        issues.append("ASSIGNMENT_CHANGED")
    if sheet["source_fingerprint"] != source["source_fingerprint"]:
        issues.append("SOURCE_FINGERPRINT_CHANGED")
    if source["assignment_status"] != "assigned":
        return issues
    if sheet["part1_decision"] != "Approve":
        issues.append("DETECTIVE_PART1_NOT_APPROVED")
    if sheet["detective_decision"] not in {"Approve", "Skip"}:
        issues.append("FAMILY_DECISION_MISSING")
    if not sheet.get("dinner_decision", "").startswith("Approve"):
        issues.append("DINNER_DECISION_MISSING")
    if not sheet.get("dictation_decision", "").startswith("Approve"):
        issues.append("DICTATION_DECISION_MISSING")
    match = re.fullmatch(r"(.+?)\s+\[(\d+),(\d+)\)", sheet["target_span_to_review"].strip())
    if not match:
        issues.append("TARGET_SPAN_MISSING")
        return issues
    start, end = int(match[2]), int(match[3])
    if start < 0 or start >= end or word[start:end] != match[1]:
        issues.append("TARGET_SPAN_MISMATCH")
    # The approved teaching page for this skill explicitly investigates the
    # weak a in -al. A reviewed-sheet target on the preceding u cannot be
    # silently published as though it taught that objective.
    if sheet["micro_skill_key"] == "D4_SCHWA_MEDIAL_NATURAL_ACTUAL":
        al_start = word.find("al", max(0, len(word) - 4))
        if al_start < 0 or (start, end) != (al_start, al_start + 1):
            issues.append("TARGET_CONFLICTS_WITH_APPROVED_FINAL_AL_LESSON")
    if sheet["vowel_index_0based_candidate"]:
        index = int(sheet["vowel_index_0based_candidate"])
        if index < start or index >= end or index >= len(word) or word[index].upper() != sheet["vowel_tile_candidate"]:
            issues.append("DETECTIVE_VOWEL_MISMATCH")
    else:
        issues.append("DETECTIVE_VOWEL_INDEX_MISSING")
    try:
        count = int(sheet["dinner_spoken_syllable_count"])
        syllable = int(sheet["dinner_target_syllable_1based"])
        if count < 1 or syllable < 1 or syllable > count:
            raise ValueError("SPOKEN_COUNT_OR_TARGET_SYLLABLE_INVALID")
        raw = sheet["dinner_accepted_cut_variants_review"].strip() or sheet["dinner_written_breakdown_candidate"].strip()
        variants = [part.strip() for part in re.split(r"[;\n]+", raw) if part.strip()]
        if not variants:
            raise ValueError("DINNER_CUTS_MISSING")
        for variant in variants:
            cuts = cuts_for(variant, word)
            if len(cuts) != count - 1 or cuts != sorted(set(cuts)) or any(cut <= 0 or cut >= len(word) for cut in cuts):
                raise ValueError("CUT_COUNT_DISAGREES_WITH_RECORDING")
            bounds = [0, *cuts, len(word)]
            if not (bounds[syllable - 1] <= start and end <= bounds[syllable]):
                raise ValueError("TARGET_CROSSES_APPROVED_CUT")
    except (ValueError, IndexError) as error:
        issues.append(str(error) if str(error) else "DINNER_CUT_INVALID")
    if not sheet["rhythm_sentence_text"].strip():
        issues.append("DICTATION_SENTENCE_MISSING")
    elif len(re.findall(rf"(?<!\w){re.escape(word)}(?!\w)", sheet["rhythm_sentence_text"], flags=re.I)) != 1:
        issues.append("DICTATION_TARGET_NOT_UNIQUE")
    for field, digest_field, label in (
        ("word_audio_file", "word_audio_sha256", "WORD_AUDIO"),
        ("rhythm_recording_file", "rhythm_recording_sha256", "SENTENCE_AUDIO"),
    ):
        relative = Path(sheet[field])
        path = relative if relative.is_absolute() else audio_root / relative
        digest = sheet[digest_field]
        if not re.fullmatch(r"[a-f0-9]{64}", digest) or not path.is_file():
            issues.append(f"{label}_MISSING")
        elif hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            issues.append(f"{label}_HASH_CHANGED")
    return issues


def audit(sheet_path: Path, baseline_path: Path, audio_root: Path) -> dict:
    sheet = json.loads(sheet_path.read_text())["rows"]
    baseline = json.loads(baseline_path.read_text())
    live = {(r["canonical_word_id"], r["micro_skill_key"]): r for r in baseline["rows"]}
    reviewed = {(r["canonical_word_id"], r["micro_skill_key"]): r for r in sheet}
    if len(live) != len(baseline["rows"]) or len(reviewed) != len(sheet) or set(live) != set(reviewed):
        raise ValueError("INVENTORY_PAIR_COVERAGE_MISMATCH")
    rows = []
    for pair, source in live.items():
        candidate = reviewed[pair]
        issues = issue_report(candidate, source, audio_root)
        publication_issues: list[str] = []
        if source["assignment_status"] == "assigned" and not source["route_content_json"].strip():
            publication_issues.append("GOVERNED_WEAK_VOWEL_ROUTE_CONTENT_NOT_PUBLISHED")
        family_status = ("ready" if candidate["detective_decision"] == "Approve" and
            candidate["verified_base_family_authority_id"].strip() else
            "optional_authority_missing" if candidate["detective_decision"] == "Approve" else "not_applicable")
        rows.append({"canonicalWordId": pair[0], "word": candidate["word"],
            "microSkillKey": pair[1], "assignmentStatus": source["assignment_status"],
            "sourceFingerprint": source["source_fingerprint"], "issues": issues,
            "publicationIssues": publication_issues, "familyEligibility": family_status})
    assigned = [row for row in rows if row["assignmentStatus"] == "assigned"]
    if len(assigned) != baseline["effectivePairCount"]:
        raise ValueError("EFFECTIVE_ASSIGNMENT_COUNT_MISMATCH")
    return {"schemaVersion": "weak_vowel_release_audit_v1",
        "sourceExportedAt": baseline["exportedAt"],
        "sourceAuthorityFingerprint": baseline["reconciliation"]["sourceFingerprint"],
        "assignedCount": len(assigned), "inventoryCount": len(rows),
        "editorialBlockedCount": sum(bool(row["issues"]) for row in assigned),
        "publicationBlockedCount": sum(bool(row["publicationIssues"]) for row in assigned),
        "optionalFamilyAuthorityMissingCount": sum(row["familyEligibility"] == "optional_authority_missing" for row in assigned),
        "blockedCount": sum(bool(row["issues"] or row["publicationIssues"]) for row in assigned),
        "historicalSourceDriftCount": sum(bool(row["issues"]) for row in rows if row["assignmentStatus"] != "assigned"),
        "readyToPublish": all(not row["issues"] and not row["publicationIssues"] for row in assigned),
        "rows": rows}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sheet", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = audit(args.sheet, args.baseline, args.audio_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({key: report[key] for key in ("assignedCount", "inventoryCount", "editorialBlockedCount",
        "publicationBlockedCount", "blockedCount", "readyToPublish")}))


if __name__ == "__main__":
    main()
