#!/usr/bin/env python3
"""Create a read-only, human-reviewable audit of base-word family lessons.

The audit intentionally evaluates one family at a time.  It does not invent
mixed-family targets, write to Supabase, or alter the pilot gate.  Its output
separates a genuine data defect from a family which simply needs a second
authentic target (or more transfers) before it can form a standalone lesson.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV_DIR = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv"
DEFAULT_OUTPUT = ROOT / "docs/implementation/qa/base-word-family-lesson-audit.csv"
REFERENCE_FAMILIES = {"play_base_family", "govern_base_family"}
APPROVED = "approved_for_first_exposure"
ASSIGNMENT_ROLES = {"base", "authentic_target", "transfer"}
TRANSFER_ROLES = {"base", "transfer"}


@dataclass(frozen=True)
class AuditResult:
    family_key: str
    status: str
    blockers: tuple[str, ...]
    row: dict[str, str]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def normalise_token(value: str) -> str:
    return value.lower().replace("’", "'")


def sentence_tokens(value: str) -> list[str]:
    return [normalise_token(token) for token in re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)?", value)]


def has_valid_sentence(row: dict[str, str], display_word: str) -> bool:
    sentence = row.get("dictation_sentence", "").strip()
    audio = row.get("audio_text", "").strip()
    try:
        index = int(row.get("dictation_target_token_index", ""))
    except ValueError:
        return False
    target = sentence_tokens(display_word)
    tokens = sentence_tokens(sentence)
    if not sentence or audio != sentence or not target or index < 0 or index + len(target) > len(tokens):
        return False
    occurrences = [position for position in range(len(tokens) - len(target) + 1) if tokens[position:position + len(target)] == target]
    return occurrences == [index]


def valid_json_array(value: str) -> bool:
    try:
        return isinstance(json.loads(value), list)
    except json.JSONDecodeError:
        return False


def member_content_blockers(member: dict[str, str], word: dict[str, str] | None, sentence: dict[str, str] | None) -> list[str]:
    word_key = member["word_key"]
    blockers: list[str] = []
    if word is None or word.get("row_status") != "active" or word.get("review_status") != APPROVED:
        blockers.append(f"{word_key}: canonical word is not active and approved")
    if not member.get("child_friendly_meaning", "").strip():
        blockers.append(f"{word_key}: missing child-friendly meaning")
    if not member.get("word_sum", "").strip():
        blockers.append(f"{word_key}: missing word sum")
    if not valid_json_array(member.get("morphology_parts", "")) or not json.loads(member["morphology_parts"]):
        blockers.append(f"{word_key}: missing or invalid morphology parts")
    if not valid_json_array(member.get("morphology_joins", "")):
        blockers.append(f"{word_key}: invalid morphology joins")
    if sentence is None or sentence.get("review_status") != APPROVED or not has_valid_sentence(sentence, (word or {}).get("display_word", "")):
        blockers.append(f"{word_key}: missing or invalid approved canonical dictation sentence")
    return blockers


def describe_member(member: dict[str, str], words: dict[str, dict[str, str]], sentences: dict[str, dict[str, str]]) -> str:
    word = words.get(member["word_key"], {})
    sentence = sentences.get(member["word_key"], {})
    return " | ".join([
        word.get("display_word", member["word_key"]),
        member["member_role"],
        member.get("word_sum", ""),
        member.get("child_friendly_meaning", ""),
        sentence.get("dictation_sentence", ""),
    ])


def audit(csv_dir: Path, exclude_references: bool = True) -> list[AuditResult]:
    words = {row["word_key"]: row for row in read_csv(csv_dir / "canonical_words.csv")}
    sentences_by_key: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in read_csv(csv_dir / "dictation_sentences.csv"):
        sentences_by_key[row["word_key"]].append(row)
    sentences = {key: rows[0] for key, rows in sentences_by_key.items() if len(rows) == 1}
    families = read_csv(csv_dir / "base_word_families.csv")
    members_by_family: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in read_csv(csv_dir / "base_word_family_members.csv"):
        members_by_family[row["base_family_key"]].append(row)

    results: list[AuditResult] = []
    for family in sorted(families, key=lambda row: row["base_family_key"]):
        family_key = family["base_family_key"]
        if exclude_references and family_key in REFERENCE_FAMILIES:
            continue
        members = members_by_family[family_key]
        blockers: list[str] = []
        if family.get("review_status") != APPROVED:
            blockers.append("family is not approved for first exposure")
        base_members = [member for member in members if member["member_role"] == "base"]
        if len(base_members) != 1:
            blockers.append(f"expected exactly one base member; found {len(base_members)}")
        duplicate_words = sorted(key for key, count in Counter(member["word_key"] for member in members).items() if count > 1)
        if duplicate_words:
            blockers.append(f"duplicate member word keys: {', '.join(duplicate_words)}")

        safe_members: list[dict[str, str]] = []
        content_blockers: list[str] = []
        for member in members:
            if member["member_role"] not in ASSIGNMENT_ROLES:
                continue
            member_blockers = member_content_blockers(member, words.get(member["word_key"]), sentences.get(member["word_key"]))
            if member.get("assignment_eligible") == "TRUE" and member.get("review_status") == APPROVED and not member_blockers:
                safe_members.append(member)
            elif member.get("assignment_eligible") == "TRUE" and member.get("review_status") == APPROVED:
                content_blockers.extend(member_blockers)
        blockers.extend(content_blockers)

        safe_authentic = sorted((member for member in safe_members if member["member_role"] == "authentic_target"), key=lambda member: member["word_key"])
        safe_transfers = sorted((member for member in safe_members if member["member_role"] in TRANSFER_ROLES), key=lambda member: member["word_key"])
        if not blockers:
            if len(safe_authentic) < 2:
                blockers.append("requires at least two eligible authentic targets for a standalone family lesson")
            if len(safe_transfers) < 4:
                blockers.append("requires four eligible base/transfer words for a standalone family lesson")

        status = "ready_for_individual_family_lesson" if not blockers else (
            "incomplete_approved_content" if content_blockers or len(base_members) != 1 or duplicate_words else "requires_mixed_family_targets"
        )
        proposed = safe_authentic[:2] + safe_transfers[:4]
        base_word = words.get(family.get("base_word_key", ""), {}).get("display_word", family.get("base_word_key", ""))
        results.append(AuditResult(
            family_key=family_key,
            status=status,
            blockers=tuple(blockers),
            row={
                "base_family_key": family_key,
                "micro_skill_key": family["micro_skill_key"],
                "base_word": base_word,
                "base_meaning": family["base_meaning"],
                "validation_status": status,
                "eligible_authentic_target_count": str(len(safe_authentic)),
                "eligible_authentic_targets": " ; ".join(words[member["word_key"]]["display_word"] for member in safe_authentic),
                "eligible_transfer_count": str(len(safe_transfers)),
                "eligible_transfer_pool": " ; ".join(words[member["word_key"]]["display_word"] for member in safe_transfers),
                "proposed_six_word_lesson": " ; ".join(describe_member(member, words, sentences) for member in proposed),
                "family_member_details": " || ".join(describe_member(member, words, sentences) for member in members),
                "blocking_reasons": " | ".join(blockers),
                "human_review_status": "",
                "human_review_notes": "",
            },
        ))
    return results


def write_report(results: Iterable[AuditResult], output: Path) -> dict[str, int]:
    rows = [result.row for result in results]
    output.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "base_family_key", "micro_skill_key", "base_word", "base_meaning", "validation_status",
        "eligible_authentic_target_count", "eligible_authentic_targets", "eligible_transfer_count",
        "eligible_transfer_pool", "proposed_six_word_lesson", "family_member_details", "blocking_reasons",
        "human_review_status", "human_review_notes",
    ]
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    return dict(sorted(Counter(result.status for result in results).items()))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv-dir", type=Path, default=DEFAULT_CSV_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--include-reference-families", action="store_true")
    args = parser.parse_args()
    results = audit(args.csv_dir, exclude_references=not args.include_reference_families)
    summary = write_report(results, args.output)
    print(json.dumps({"status": "base_word_family_lesson_audit_complete", "output": str(args.output), "family_count": len(results), "counts_by_status": summary}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
