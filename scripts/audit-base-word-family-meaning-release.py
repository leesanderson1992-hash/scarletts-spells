#!/usr/bin/env python3
"""Audit the reviewed Base Word family meanings without mutating source data."""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
SOURCE_ROOT = ROOT / (
    "docs/implementation/seed-data/teaching-dictionary/candidates/"
    "2026-06-29-phase-5-source-intake"
)
FAMILIES_PATH = SOURCE_ROOT / "csv/base_word_families.csv"
MEMBERS_PATH = SOURCE_ROOT / "csv/base_word_family_members.csv"
GENERATOR_PATH = ROOT / "scripts/populate-base-word-family-meanings.py"
REVIEW_PATH = SOURCE_ROOT / "MORPHOLOGY_FAMILY_MEANINGS_REVIEW.md"
AUTHORITATIVE_SOURCE_COMMIT = "e4219122b7e68f37a47af6fa4152e65d19083cd3"
APPROVED_BY = "Katie Sanderson"
APPROVED_AT = "2026-07-24T15:53:22+01:00"
APPROVED_MEANING_PAIR_SHA256 = (
    "acdc53a6c5f8aa3cbb73908539d7dd0020307dcd948fc7b7791b676872b09221"
)
SUPPORTED_SKILLS = {
    "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
    "D4_MOR_BASE_WORDS_PRESERVE_BASE",
}
ROLE_VALUES = {"authentic_target", "base", "transfer"}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def source_row_hash(file_name: str, row: dict[str, str]) -> str:
    content = {
        key: value
        for key, value in sorted(row.items())
        if key != "__row" and value not in ("", None)
    }
    return sha256_bytes(canonical_json({"file": file_name, "content": content}).encode())


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_generator():
    spec = importlib.util.spec_from_file_location("base_word_family_meanings", GENERATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load the Base Word family meaning generator.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_bool(value: str) -> bool:
    if value == "TRUE":
        return True
    if value == "FALSE":
        return False
    raise ValueError(f"Expected TRUE/FALSE, received {value!r}.")


def transformations_for(row: dict[str, str]) -> list[dict[str, str]]:
    parts = json.loads(row["morphology_parts"])
    if (
        row["transformation_notes"]
        == "The final y changes to i before the ending is added."
        and len(parts) >= 2
        and parts[0].get("kind") == "base"
        and str(parts[0].get("sourceText", "")).endswith("y")
        and str(parts[0].get("surfaceText", "")).endswith("i")
        and len(str(parts[0].get("sourceText", "")))
        == len(str(parts[0].get("surfaceText", "")))
        and str(parts[0].get("sourceText", ""))[:-1]
        == str(parts[0].get("surfaceText", ""))[:-1]
    ):
        return [
            {
                "transformationKey": "change_final_y_to_i",
                "type": "change_final_y_to_i",
                "sourcePartId": parts[0]["id"],
                "sourceText": parts[0]["sourceText"],
                "surfaceText": parts[0]["surfaceText"],
                "explanation": "Change the final i back to y before you add the ending.",
            }
        ]
    return []


def audit() -> dict[str, Any]:
    generator = load_generator()
    families = read_csv(FAMILIES_PATH)
    members = read_csv(MEMBERS_PATH)
    if len(families) != 87 or len(members) != 227:
        raise ValueError(
            f"Expected 87 families and 227 members; received {len(families)} and {len(members)}."
        )
    family_by_key = {row["base_family_key"]: row for row in families}
    if len(family_by_key) != len(families):
        raise ValueError("Base Word family keys are not unique.")

    meaning_pair_value = "\n".join(
        f"{row['word_key']}\0{row['child_friendly_meaning']}"
        for row in sorted(members, key=lambda item: item["word_key"])
    )
    meaning_pair_sha256 = sha256_bytes(meaning_pair_value.encode())
    if meaning_pair_sha256 != APPROVED_MEANING_PAIR_SHA256:
        raise ValueError("The reviewed meaning-pair fingerprint has drifted.")
    review_text = REVIEW_PATH.read_text(encoding="utf-8")
    if (
        APPROVED_MEANING_PAIR_SHA256 not in review_text
        or re.search(r"Katie\s+Sanderson", review_text) is None
        or APPROVED_AT not in review_text
    ):
        raise ValueError("The human-review receipt does not bind the approved meaning projection.")

    audited_members: list[dict[str, Any]] = []
    missing_or_unreviewed: list[str] = []
    for source_row_number, row in enumerate(members, start=2):
        family = family_by_key.get(row["base_family_key"])
        if family is None:
            raise ValueError(f"Unknown Base Word family {row['base_family_key']!r}.")
        word = row["word_key"].removesuffix("_en_gb")
        expected_meaning = generator.meaning_with_morpheme_theme(row)
        parts = json.loads(row["morphology_parts"])
        suffixes = {
            part["sourceText"]
            for part in parts
            if part.get("kind") == "suffix" and part.get("sourceText")
        }
        if word in generator.NATURAL_THEMED_MEANINGS:
            provenance = "reviewed_override"
        elif "ing" in suffixes or suffixes.intersection({"ed", "d"}):
            provenance = "generated_and_reviewed"
        else:
            provenance = "reviewed_source"
        reviewed = (
            row["child_friendly_meaning"] == expected_meaning
            and row["review_status"] == "approved_for_first_exposure"
            and row["reviewed_by"] == APPROVED_BY
            and row["reviewed_at"] == APPROVED_AT
        )
        if not reviewed:
            provenance = "missing_or_unreviewed"
            missing_or_unreviewed.append(row["word_key"])
        if family["micro_skill_key"] not in SUPPORTED_SKILLS:
            raise ValueError(f"Unsupported Base Word skill {family['micro_skill_key']!r}.")
        if row["member_role"] not in ROLE_VALUES:
            raise ValueError(f"Unsupported Base Word role {row['member_role']!r}.")
        audited_members.append(
            {
                "sourceRowNumber": source_row_number,
                "sourceRowSha256": source_row_hash("base_word_family_members.csv", row),
                "wordKey": row["word_key"],
                "displayWord": word.replace("_", "-") if word == "twenty_one" else word,
                "microSkillKey": family["micro_skill_key"],
                "baseFamilyKey": row["base_family_key"],
                "memberRole": row["member_role"],
                "wordSum": row["word_sum"],
                "morphologyParts": parts,
                "morphologyJoins": json.loads(row["morphology_joins"]),
                "morphologyTransformations": transformations_for(row),
                "transformationNotes": row["transformation_notes"],
                "childFriendlyMeaning": row["child_friendly_meaning"],
                "meaningProvenance": provenance,
                "dictationSentence": row["dictation_sentence"],
                "dictationTargetTokenIndex": int(row["dictation_target_token_index"]),
                "audioText": row["audio_text"],
                "assignmentEligible": parse_bool(row["assignment_eligible"]),
                "rowStatus": "active",
                "reviewStatus": row["review_status"],
                "reviewedBy": row["reviewed_by"],
                "reviewedAt": row["reviewed_at"],
                "sourceCategory": row["source_category"],
                "sourceName": row["source_name"],
                "sourceUrl": row["source_url"],
                "sourceLicence": row["source_licence"],
                "sourceUseNote": row["source_use_note"],
                "confidence": row["confidence"],
            }
        )

    audited_families = []
    for source_row_number, row in enumerate(families, start=2):
        audited_families.append(
            {
                "sourceRowNumber": source_row_number,
                "sourceRowSha256": source_row_hash("base_word_families.csv", row),
                "baseFamilyKey": row["base_family_key"],
                "microSkillKey": row["micro_skill_key"],
                "baseWordKey": row["base_word_key"],
                "baseMeaning": row["base_meaning"],
                "etymologyRoute": json.loads(row["etymology_route"]),
                "rowStatus": "active",
                "reviewStatus": row["review_status"],
                "reviewedBy": row["reviewed_by"],
                "reviewedAt": row["reviewed_at"],
                "sourceCategory": row["source_category"],
                "sourceName": row["source_name"],
                "sourceUrl": row["source_url"],
                "sourceLicence": row["source_licence"],
                "sourceUseNote": row["source_use_note"],
                "confidence": row["confidence"],
            }
        )

    classifications: dict[str, int] = {}
    roles: dict[str, int] = {}
    skills: dict[str, dict[str, Any]] = {}
    for member in audited_members:
        provenance = member["meaningProvenance"]
        classifications[provenance] = classifications.get(provenance, 0) + 1
        role = member["memberRole"]
        roles[role] = roles.get(role, 0) + 1
    for skill in sorted(SUPPORTED_SKILLS):
        skill_families = [row for row in audited_families if row["microSkillKey"] == skill]
        skill_members = [row for row in audited_members if row["microSkillKey"] == skill]
        skills[skill] = {
            "families": len(skill_families),
            "members": len(skill_members),
            "roles": {
                role: sum(member["memberRole"] == role for member in skill_members)
                for role in sorted(ROLE_VALUES)
            },
        }
    if missing_or_unreviewed:
        raise ValueError(
            "Unresolved Base Word family meanings: " + ", ".join(missing_or_unreviewed)
        )
    return {
        "schemaVersion": "base_word_family_meaning_audit_v1",
        "authoritativeSourceCommit": AUTHORITATIVE_SOURCE_COMMIT,
        "sourceFiles": {
            "families": {"path": str(FAMILIES_PATH.relative_to(ROOT)), "sha256": sha256_file(FAMILIES_PATH)},
            "members": {"path": str(MEMBERS_PATH.relative_to(ROOT)), "sha256": sha256_file(MEMBERS_PATH)},
            "generator": {"path": str(GENERATOR_PATH.relative_to(ROOT)), "sha256": sha256_file(GENERATOR_PATH)},
            "reviewReceipt": {"path": str(REVIEW_PATH.relative_to(ROOT)), "sha256": sha256_file(REVIEW_PATH)},
        },
        "review": {
            "approvedBy": APPROVED_BY,
            "approvedAt": APPROVED_AT,
            "meaningPairSha256": meaning_pair_sha256,
        },
        "counts": {
            "families": len(audited_families),
            "members": len(audited_members),
            "classifications": dict(sorted(classifications.items())),
            "roles": dict(sorted(roles.items())),
            "missingOrUnreviewed": len(missing_or_unreviewed),
            "skills": skills,
        },
        "families": audited_families,
        "members": audited_members,
    }


def write_audit_csv(path: Path, result: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "word_key", "display_word", "micro_skill_key", "base_family_key",
        "member_role", "transformation", "child_friendly_meaning",
        "meaning_provenance", "source_row_sha256", "generator_sha256",
        "reviewed_by", "reviewed_at",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for member in result["members"]:
            writer.writerow(
                {
                    "word_key": member["wordKey"],
                    "display_word": member["displayWord"],
                    "micro_skill_key": member["microSkillKey"],
                    "base_family_key": member["baseFamilyKey"],
                    "member_role": member["memberRole"],
                    "transformation": ";".join(
                        item["transformationKey"]
                        for item in member["morphologyTransformations"]
                    ),
                    "child_friendly_meaning": member["childFriendlyMeaning"],
                    "meaning_provenance": member["meaningProvenance"],
                    "source_row_sha256": member["sourceRowSha256"],
                    "generator_sha256": result["sourceFiles"]["generator"]["sha256"],
                    "reviewed_by": member["reviewedBy"],
                    "reviewed_at": member["reviewedAt"],
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit-csv")
    args = parser.parse_args()
    result = audit()
    if args.audit_csv:
        write_audit_csv(Path(args.audit_csv), result)
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
