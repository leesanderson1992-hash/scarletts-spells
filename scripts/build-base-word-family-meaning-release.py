#!/usr/bin/env python3
"""Build the reviewed, immutable Base Word family release artifacts."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
AUDITOR_PATH = ROOT / "scripts/audit-base-word-family-meaning-release.py"
RELEASE_ID = "adle_base_word_family_meanings_v1_2026_08_09"
RELEASE_DIR = ROOT / (
    "docs/implementation/seed-data/teaching-dictionary/releases/"
    "2026-08-09-base-word-family-meanings-v1"
)
OLD_BATCH_ID = "d659485d-7bd2-44ca-815e-f5a3995eb068"
UUID_NAMESPACE = uuid.UUID("12345678-1234-5678-1234-567812345678")
MIGRATION_VERSION = "20260809160000"
MIGRATION_PATH = ROOT / "supabase/migrations/20260809160000_allow_base_word_family_release_ledger.sql"


def load_auditor():
    spec = importlib.util.spec_from_file_location("base_word_family_meaning_audit", AUDITOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load the Base Word family-meaning auditor.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_uuid(kind: str, key: str) -> str:
    return str(uuid.uuid5(UUID_NAMESPACE, f"{kind}:{key}"))


def release_family_id(family_key: str) -> str:
    return stable_uuid("base_word_family_release", f"{RELEASE_ID}|{family_key}")


def release_member_id(family_key: str, word_key: str) -> str:
    return stable_uuid("base_word_family_member_release", f"{RELEASE_ID}|{family_key}|{word_key}")


def authority_slug(skill: str) -> str:
    if skill == "D4_MOR_BASE_WORDS_IDENTIFY_BASE":
        return "identify-base"
    if skill == "D4_MOR_BASE_WORDS_PRESERVE_BASE":
        return "preserve-base"
    raise ValueError(f"Unsupported Base Word skill {skill!r}.")


def authority_manifest(audit: dict[str, Any], skill: str) -> dict[str, Any]:
    families = []
    for family in sorted(
        (row for row in audit["families"] if row["microSkillKey"] == skill),
        key=lambda row: row["baseFamilyKey"],
    ):
        family_key = family["baseFamilyKey"]
        members = []
        for member in sorted(
            (
                row
                for row in audit["members"]
                if row["microSkillKey"] == skill and row["baseFamilyKey"] == family_key
            ),
            key=lambda row: row["wordKey"],
        ):
            members.append(
                {
                    "memberId": release_member_id(family_key, member["wordKey"]),
                    "wordKey": member["wordKey"],
                    "memberRole": member["memberRole"],
                    "assignmentEligible": member["assignmentEligible"],
                    "complexityLevel": None,
                    "wordSum": member["wordSum"],
                    "morphologyParts": member["morphologyParts"],
                    "morphologyJoins": member["morphologyJoins"],
                    "morphologyTransformations": member["morphologyTransformations"],
                    "transformationNotes": member["transformationNotes"],
                    "childFriendlyMeaning": member["childFriendlyMeaning"],
                }
            )
        families.append(
            {
                "familyId": release_family_id(family_key),
                "baseFamilyKey": family_key,
                "baseWordKey": family["baseWordKey"],
                "baseMeaning": family["baseMeaning"],
                "etymologyRoute": family["etymologyRoute"],
                "members": members,
            }
        )
    approval_refs = sorted(
        [
            f"commit:{audit['authoritativeSourceCommit']}",
            (
                "file:"
                + audit["sourceFiles"]["reviewReceipt"]["path"]
                + "#sha256:"
                + audit["sourceFiles"]["reviewReceipt"]["sha256"]
            ),
            "meaning-pair-sha256:" + audit["review"]["meaningPairSha256"],
        ]
    )
    return {
        "schemaVersion": "base_word_family_authority_source_v1",
        "authoritySchemaVersion": "1",
        "authorityKey": f"base_word_family_membership:{authority_slug(skill)}:{RELEASE_ID}",
        "microSkillKey": skill,
        "importBatchId": stable_uuid("base_word_family_release_batch", RELEASE_ID),
        "approvalRefs": approval_refs,
        "families": families,
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    auditor = load_auditor()
    audit = auditor.audit()
    if audit["counts"]["missingOrUnreviewed"] != 0:
        raise RuntimeError("The immutable release cannot contain unresolved teaching glosses.")

    authority_entries = []
    for skill in sorted(audit["counts"]["skills"]):
        relative_path = Path("authorities") / f"{authority_slug(skill)}.json"
        absolute_path = RELEASE_DIR / relative_path
        authority = authority_manifest(audit, skill)
        write_json(absolute_path, authority)
        authority_entries.append(
            {
                "microSkillKey": skill,
                "authorityKey": authority["authorityKey"],
                "path": str(relative_path),
                "sha256": sha256_bytes(absolute_path.read_bytes()),
                "families": len(authority["families"]),
                "members": sum(len(family["members"]) for family in authority["families"]),
            }
        )

    auditor.write_audit_csv(RELEASE_DIR / "audit/family-meaning-audit.csv", audit)
    manifest_fingerprint = {
        "schemaVersion": "base_word_family_release_v1",
        "releaseId": RELEASE_ID,
        "packageType": "base_word_family_batch_v1",
        "packageSchemaVersion": "v1",
        "sourceCommit": audit["authoritativeSourceCommit"],
        "requiredMigrationVersions": [MIGRATION_VERSION],
        "requiredMigrations": [
            {
                "version": MIGRATION_VERSION,
                "path": str(MIGRATION_PATH.relative_to(ROOT)),
                "sha256": sha256_bytes(MIGRATION_PATH.read_bytes()),
            }
        ],
        "predecessorImportBatchId": OLD_BATCH_ID,
        "importBatchId": stable_uuid("base_word_family_release_batch", RELEASE_ID),
        "workbookSha256": audit["review"]["meaningPairSha256"],
        "workbookSha256Basis": "reviewed_word_teaching_gloss_projection",
        "sourceFiles": audit["sourceFiles"],
        "review": audit["review"],
        "rowCounts": {
            "baseWordFamilies": audit["counts"]["families"],
            "baseWordFamilyMembers": audit["counts"]["members"],
            "missingOrUnreviewedMeanings": audit["counts"]["missingOrUnreviewed"],
        },
        "meaningClassCounts": audit["counts"]["classifications"],
        "roleCounts": audit["counts"]["roles"],
        "skills": audit["counts"]["skills"],
        "authorityManifests": authority_entries,
        "semanticNote": (
            "child_friendly_meaning is the reviewed word teaching gloss used by the current "
            "Base Word member projection; it is not asserted to be a family-disambiguated "
            "canonical dictionary definition"
        ),
        "operationalEffects": {
            "createsRouteRelease": False,
            "createsActivationRevision": False,
            "changesLearnerGate": False,
            "writesLearnerData": False,
        },
    }
    manifest = {
        **manifest_fingerprint,
        "packageSha256": sha256_bytes(canonical_json(manifest_fingerprint).encode()),
    }
    write_json(RELEASE_DIR / "manifest.json", manifest)
    print(
        json.dumps(
            {
                "releaseDir": str(RELEASE_DIR.relative_to(ROOT)),
                "releaseId": RELEASE_ID,
                "importBatchId": manifest["importBatchId"],
                "packageSha256": manifest["packageSha256"],
                "authorityManifests": authority_entries,
                "rowCounts": manifest["rowCounts"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
