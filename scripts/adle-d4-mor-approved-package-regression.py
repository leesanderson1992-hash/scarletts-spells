#!/usr/bin/env python3
"""ADLE 7-UI-E approved D4_MOR v1 source package regression.

Freezes the human-approved D4_MOR category-v1 candidate artifacts into a
deterministic approved source package. The package is not activated and is not
imported by runtime code.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

CANDIDATE_DIR = ROOT / "docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1"
REVIEW_DIR = ROOT / "docs/implementation/seed-data/adle-7-ui/review/d4-mor-human-review-pack"
SOURCE_DIR = ROOT / "docs/implementation/seed-data/adle-7-ui/source-artifacts/2026-07-10-d4-mor"
APPROVED_DIR = ROOT / "data/adle/approved/d4-mor/v1"

WORKBOOK = SOURCE_DIR / "D4_MOR_content_workbook_v1.xlsx"
RETAINED_DESIGN_PACK = SOURCE_DIR / "D4_MOR_template_design_pack.md"
EXISTING_TEACHING_CONTENT = (
    ROOT
    / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/teaching_content_versions.csv"
)

APPROVAL_RECORD = REVIEW_DIR / "d4-mor-human-approval-record-v1.json"
MICRO_SKILL_APPROVAL_TABLE = REVIEW_DIR / "d4-mor-micro-skill-approval-table.csv"
EXCEPTION_REVIEW_TABLE = REVIEW_DIR / "d4-mor-exception-review-table.csv"
SPOT_CHECK_TABLE = REVIEW_DIR / "d4-mor-cluster-spot-check-table.csv"
BATCH_APPROVAL_DECLARATION = REVIEW_DIR / "d4-mor-batch-approval-declaration.md"
REVIEW_PACK_SUMMARY = REVIEW_DIR / "d4-mor-human-review-pack-summary.json"

CANDIDATE_CONTENT = CANDIDATE_DIR / "d4-mor-content-candidate-v1.json"
CANDIDATE_WORD_ANALYSES = CANDIDATE_DIR / "d4-mor-word-analyses-candidate-v1.json"
CANDIDATE_MORPHEME_CATALOG = CANDIDATE_DIR / "d4-mor-morpheme-catalog-candidate-v1.json"
CANDIDATE_EXPERIENCE_MANIFEST = CANDIDATE_DIR / "d4-mor-experience-manifest-candidate-v1.json"
CANDIDATE_SUMMARY = CANDIDATE_DIR / "d4-mor-category-v1-summary.json"
CANDIDATE_ROW_AUDIT = CANDIDATE_DIR / "d4-mor-category-v1-row-audit.csv"
CANDIDATE_REVIEW_QUEUE = CANDIDATE_DIR / "d4-mor-category-v1-review-queue.csv"

PACKAGE_MANIFEST = APPROVED_DIR / "d4-mor-v1-manifest.json"
PACKAGE_CONTENT = APPROVED_DIR / "d4-mor-v1-content.json"
PACKAGE_WORD_ANALYSES = APPROVED_DIR / "d4-mor-v1-word-analyses.json"
PACKAGE_MORPHEME_CATALOG = APPROVED_DIR / "d4-mor-v1-morpheme-catalog.json"
PACKAGE_EXPERIENCE_MANIFEST = APPROVED_DIR / "d4-mor-v1-experience-manifest.json"
PILOT_FIXTURE = APPROVED_DIR / "d4-mor-prefixes-un-pilot-source-fixture.json"

PACKAGE_KEY = "d4_mor_category_v1"
SCHEMA_VERSION = "d4_mor_approved_package_schema_v1"
CONTENT_VERSION = "d4_mor_category_v1_2026_07_11"
GENERATOR_VERSION = "adle_d4_mor_approved_package_2026_07_11"
APPROVAL_COMMIT = "31b127ff0259c7d0b5e2da5eda8d88fef17a0aab"
APPROVAL_SCOPE = "d4_mor_category_v1"
PILOT_MICRO_SKILL_KEY = "D4_MOR_PREFIXES_UN"

PROFILE_KEY_MAP = {"d4_mor_default_v1_candidate": "d4_mor_default_v1"}
VARIANT_KEY_MAP = {"d4_mor_semantic_candidate_v1": "d4_mor_semantic_v1"}

EXPECTED_COUNTS = {
    "microSkills": 24,
    "wordAnalyses": 168,
    "morphemes": 50,
    "distractorSets": 24,
    "rootArtifacts": 24,
    "experienceProfiles": 1,
    "exceptionRows": 74,
    "spotChecks": 18,
}

FORBIDDEN_DIFF_PATHS = [
    "components/adle-session-runner.tsx",
    "components/adle/activities/registry.ts",
    "lib/adle/activity-template-registry.ts",
    "lib/adle/daily-assignment-composer.ts",
    "lib/adle/composer-policy.ts",
    "lib/adle/loaders/composer-facts-loader.ts",
    "lib/adle/assignment-attempt-events.ts",
    "lib/adle/loaders/session-completion-loader.ts",
    "lib/adle/review-scheduler.ts",
    "lib/adle/evidence-policy.ts",
    "lib/adle/evidence-pricing.ts",
    "lib/rewards/adle-reward-bridge.ts",
]


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def git_head_bytes(path: Path) -> bytes | None:
    result = subprocess.run(
        ["git", "show", f"HEAD:{rel(path)}"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout if result.returncode == 0 else None


def git_diff_paths() -> set[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def rendered_json(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False, sort_keys=False) + "\n"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered_json(value), encoding="utf-8")


def artifact_ref(path: Path) -> dict[str, str]:
    return {"path": rel(path), "sha256": sha256(path)}


def package_artifact_ref(path: Path, value: Any) -> dict[str, str]:
    return {
        "path": rel(path),
        "sha256": hashlib.sha256(rendered_json(value).encode("utf-8")).hexdigest(),
    }


def package_metadata(artifact_key: str) -> dict[str, Any]:
    return {
        "artifactKey": artifact_key,
        "packageKey": PACKAGE_KEY,
        "schemaVersion": SCHEMA_VERSION,
        "contentVersion": CONTENT_VERSION,
        "approvalStatus": "human_approved",
        "humanReviewStatus": "approved",
        "approvalScope": APPROVAL_SCOPE,
        "activationStatus": "not_activated",
        "runtimeEnabled": False,
        "approvalRecordRef": rel(APPROVAL_RECORD),
        "approvalCommit": APPROVAL_COMMIT,
        "generatorVersion": GENERATOR_VERSION,
    }


def approved_record(value: dict[str, Any]) -> dict[str, Any]:
    item = deepcopy(value)
    source_candidate_status = item.pop("candidateStatus", None)
    item.pop("humanReviewStatus", None)
    if source_candidate_status is not None:
        item["sourceCandidateStatus"] = source_candidate_status
    item["approvalStatus"] = "human_approved"
    item["humanReviewStatus"] = "approved"
    item["approvalScope"] = APPROVAL_SCOPE
    item["activationStatus"] = "not_activated"
    item["runtimeEnabled"] = False
    return item


def map_profile_key(value: str) -> str:
    return PROFILE_KEY_MAP.get(value, value)


def map_variant_key(value: str) -> str:
    return VARIANT_KEY_MAP.get(value, value)


def validate_approval_inputs() -> dict[str, Any]:
    approval = read_json(APPROVAL_RECORD)
    summary = read_json(REVIEW_PACK_SUMMARY)
    micro_rows = read_csv(MICRO_SKILL_APPROVAL_TABLE)
    exception_rows = read_csv(EXCEPTION_REVIEW_TABLE)
    spot_rows = read_csv(SPOT_CHECK_TABLE)

    errors: list[str] = []
    if approval["status"] != "human_approved_not_activated":
        errors.append("approval record must be human_approved_not_activated")
    if approval["approvalBoundary"]["runtimeActivated"] is not False:
        errors.append("approval record must preserve runtimeActivated=false")
    if approval["approvalBoundary"]["existingActiveGenericTeachingContentUnchanged"] is not True:
        errors.append("approval record must preserve active teaching content")
    if approval["scope"]["approvedMicroSkills"] != EXPECTED_COUNTS["microSkills"]:
        errors.append("approval record does not cover 24 micro-skills")
    if approval["scope"]["wordAnalysisCount"] != EXPECTED_COUNTS["wordAnalyses"]:
        errors.append("approval record does not cover 168 word analyses")
    if approval["scope"]["approvedExceptions"] != EXPECTED_COUNTS["exceptionRows"]:
        errors.append("approval record does not cover 74 exception rows")
    if approval["scope"]["approvedSpotChecks"] != EXPECTED_COUNTS["spotChecks"]:
        errors.append("approval record does not cover 18 spot checks")
    if approval["scope"]["blockedMicroSkills"] != 0:
        errors.append("approval record still contains blocked micro-skills")
    if len(micro_rows) != EXPECTED_COUNTS["microSkills"]:
        errors.append("micro-skill approval table row count mismatch")
    if len(exception_rows) != EXPECTED_COUNTS["exceptionRows"]:
        errors.append("exception review table row count mismatch")
    if len(spot_rows) != EXPECTED_COUNTS["spotChecks"]:
        errors.append("spot-check table row count mismatch")
    approved_micro_decisions = {"approved", "approved_with_amendment"}
    if any(row["reviewer_decision"].strip().lower() not in approved_micro_decisions for row in micro_rows):
        errors.append("not every micro-skill approval row is approved")
    if any(row["approve_amend_reject"].strip().lower() not in {"approve", "approved"} for row in exception_rows):
        errors.append("not every exception row is approved")
    if any(row["reviewer_decision"].strip().lower() != "approved" for row in spot_rows):
        errors.append("not every spot-check row is approved")

    spot_words = {row["display_word"] for row in spot_rows}
    pronunciation_spots = [
        row for row in spot_rows if row["micro_skill_key"] == "D4_MOR_WORD_FAMILIES_PRONUNCIATION_SHIFT"
    ]
    if "health" not in spot_words:
        errors.append("approved spot checks must include health")
    if any(row["display_word"] == "heal" for row in pronunciation_spots):
        errors.append("heal must not remain the approved pronunciation-shift spot check")

    amendment_summaries = " ".join(item["summary"] for item in approval["incorporatedAmendments"])
    if "hyphenated and open compounds" not in amendment_summaries:
        errors.append("compound teaching explanation amendment is missing from approval record")
    if "heal to health" not in amendment_summaries:
        errors.append("health spot-check amendment is missing from approval record")
    if summary["counts"]["approvedMicroSkills"] != EXPECTED_COUNTS["microSkills"]:
        errors.append("review-pack summary approved micro-skill count mismatch")
    if summary["counts"]["approvedExceptionRows"] != EXPECTED_COUNTS["exceptionRows"]:
        errors.append("review-pack summary approved exception count mismatch")

    if errors:
        raise RuntimeError("; ".join(errors))

    return {
        "approval": approval,
        "summary": summary,
        "microRows": micro_rows,
        "exceptionRows": exception_rows,
        "spotRows": spot_rows,
    }


def approved_content(candidate: dict[str, Any], micro_rows: list[dict[str, str]]) -> dict[str, Any]:
    by_key = {row["micro_skill_key"]: row for row in micro_rows}
    content = []
    amendments = []
    for source_item in candidate["microSkillContent"]:
        item = approved_record(source_item)
        row = by_key[item["microSkillKey"]]
        field_map = {
            "skillTitle": "title",
            "teachingObjective": "teaching_objective",
            "childFriendlyExplanation": "child_friendly_explanation",
            "ruleExplanation": "rule_explanation",
            "commonMisconceptions": "misconception",
            "watchForCue": "watch_for_cue",
            "anchorWord": "anchor_word",
        }
        for target, source in field_map.items():
            approved_value = row[source]
            if item.get(target) != approved_value:
                amendments.append(
                    {
                        "microSkillKey": item["microSkillKey"],
                        "field": target,
                        "sourceCandidateValue": item.get(target, ""),
                        "approvedValue": approved_value,
                    }
                )
            item[target] = approved_value
        item["approvedContentVersion"] = CONTENT_VERSION
        item["reviewerDecision"] = row["reviewer_decision"]
        item["reviewerComment"] = row["reviewer_comment"]
        content.append(item)

    distractors = [approved_record(item) for item in candidate["distractorSets"]]
    return {
        "metadata": package_metadata("d4-mor-v1-content"),
        "runtimeBoundary": {
            "existingActiveGenericTeachingContentRemainsRuntimeTruth": True,
            "approvedPackageDoesNotSupersedeExistingActiveContent": True,
            "approvedPackageDoesNotChangeRuntimeSelection": True,
            "activationRequiresSeparateRuntimeContentSelectionPr": True,
        },
        "approvedTeachingAmendmentsApplied": amendments,
        "microSkillContent": sorted(content, key=lambda item: item["microSkillKey"]),
        "distractorSets": sorted(distractors, key=lambda item: item["microSkillKey"]),
    }


def approved_word_analyses(candidate: dict[str, Any]) -> dict[str, Any]:
    analyses = [approved_record(item) for item in candidate["wordAnalyses"]]
    return {
        "metadata": package_metadata("d4-mor-v1-word-analyses"),
        "semanticModel": candidate["semanticModel"],
        "wordAnalyses": sorted(analyses, key=lambda item: item["analysisKey"]),
    }


def approved_morpheme_catalog(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "metadata": package_metadata("d4-mor-v1-morpheme-catalog"),
        "morphemes": sorted([approved_record(item) for item in candidate["morphemes"]], key=lambda item: item["morphemeKey"]),
        "rootArtifacts": sorted([approved_record(item) for item in candidate["rootArtifacts"]], key=lambda item: item["rootArtifactKey"]),
        "rootAliasModel": candidate["rootAliasModel"],
    }


def approved_experience_manifest(candidate: dict[str, Any]) -> dict[str, Any]:
    profiles = {}
    for key, source_profile in candidate["profiles"].items():
        profile = approved_record(source_profile)
        profile["sourceCandidateExperienceProfileKey"] = key
        profile["experienceProfileKey"] = map_profile_key(profile["experienceProfileKey"])
        profiles[map_profile_key(key)] = profile

    micro_skills = []
    for source_item in candidate["microSkills"]:
        item = approved_record(source_item)
        item["sourceCandidateExperienceProfileKey"] = item["experienceProfileKey"]
        item["experienceProfileKey"] = map_profile_key(item["experienceProfileKey"])
        for selection in item["templateVariantSelections"]:
            selection["sourceCandidateVariantKey"] = selection["variantKey"]
            selection["variantKey"] = map_variant_key(selection["variantKey"])
        micro_skills.append(item)

    return {
        "metadata": package_metadata("d4-mor-v1-experience-manifest"),
        "profileKeyMapping": PROFILE_KEY_MAP,
        "templateVariantKeyMapping": VARIANT_KEY_MAP,
        "profiles": profiles,
        "microSkills": sorted(micro_skills, key=lambda item: item["microSkillKey"]),
    }


def pilot_fixture(
    content: dict[str, Any],
    word_analyses: dict[str, Any],
    morpheme_catalog: dict[str, Any],
    experience_manifest: dict[str, Any],
) -> dict[str, Any]:
    micro_content = next(
        item for item in content["microSkillContent"] if item["microSkillKey"] == PILOT_MICRO_SKILL_KEY
    )
    words = [
        item for item in word_analyses["wordAnalyses"] if item["microSkillKey"] == PILOT_MICRO_SKILL_KEY
    ]
    anchor = next(item for item in words if item["displayWord"] == micro_content["anchorWord"])
    morpheme_keys = sorted(
        {
            part["morphemeKey"]
            for word in words
            for part in word["parts"]
            if part.get("morphemeKey")
        }
    )
    morphemes = [
        item for item in morpheme_catalog["morphemes"] if item["morphemeKey"] in morpheme_keys
    ]
    distractors = next(
        item for item in content["distractorSets"] if item["microSkillKey"] == PILOT_MICRO_SKILL_KEY
    )
    experience = next(
        item for item in experience_manifest["microSkills"] if item["microSkillKey"] == PILOT_MICRO_SKILL_KEY
    )
    return {
        "metadata": package_metadata("d4-mor-prefixes-un-pilot-source-fixture"),
        "fixtureBoundary": {
            "purpose": "Runtime-neutral approved-source fixture for future D4_MOR_PREFIXES_UN pilot work.",
            "implementsSelectionAlgorithm": False,
            "selectionPolicy": "none_fixture_lists_approved_available_words_only",
            "isAssignmentPayloadContract": False,
            "activationStatus": "not_activated",
            "runtimeEnabled": False,
        },
        "microSkillKey": PILOT_MICRO_SKILL_KEY,
        "approvedContentVersion": CONTENT_VERSION,
        "experienceProfileKey": experience["experienceProfileKey"],
        "originThemeKey": micro_content["originThemeKey"],
        "teachingObjective": micro_content["teachingObjective"],
        "childFriendlyExplanation": micro_content["childFriendlyExplanation"],
        "ruleExplanation": micro_content["ruleExplanation"],
        "watchForCue": micro_content["watchForCue"],
        "anchorWord": micro_content["anchorWord"],
        "anchorAnalysis": anchor,
        "approvedAvailableWordAnalyses": sorted(words, key=lambda item: (item["role"], item["displayWord"])),
        "morphemeIdentities": morphemes,
        "approvedDistractors": distractors,
        "intendedTemplateSequence": experience["templateVariantSelections"],
        "activationState": "not_activated",
        "runtimeEnabled": False,
    }


def validate_semantic_integrity(word_analyses: dict[str, Any], morpheme_catalog: dict[str, Any]) -> None:
    morpheme_keys = {item["morphemeKey"] for item in morpheme_catalog["morphemes"]}
    errors: list[str] = []
    for analysis in word_analyses["wordAnalyses"]:
        reconstructed = ""
        for index, part in enumerate(analysis["parts"]):
            reconstructed += part["surfaceText"]
            if index < len(analysis["joins"]):
                reconstructed += analysis["joins"][index]["surfaceText"]
            if part.get("morphemeKey") and part["morphemeKey"] not in morpheme_keys:
                errors.append(f"unresolved morpheme key: {analysis['analysisKey']} {part['morphemeKey']}")
        if reconstructed != analysis["displayWord"]:
            errors.append(f"word reconstruction failed: {analysis['analysisKey']}")
        if analysis["validation"]["status"] != "pass":
            errors.append(f"word validation not pass: {analysis['analysisKey']}")
        if analysis["activationStatus"] != "not_activated" or analysis["runtimeEnabled"] is not False:
            errors.append(f"word analysis activated unexpectedly: {analysis['analysisKey']}")
    if errors:
        raise RuntimeError("; ".join(errors[:10]))


def validate_package(
    content: dict[str, Any],
    word_analyses: dict[str, Any],
    morpheme_catalog: dict[str, Any],
    experience_manifest: dict[str, Any],
    fixture: dict[str, Any],
    approval_inputs: dict[str, Any],
) -> None:
    errors: list[str] = []
    if len(content["microSkillContent"]) != EXPECTED_COUNTS["microSkills"]:
        errors.append("approved content micro-skill count mismatch")
    if len(content["distractorSets"]) != EXPECTED_COUNTS["distractorSets"]:
        errors.append("approved distractor set count mismatch")
    if len(word_analyses["wordAnalyses"]) != EXPECTED_COUNTS["wordAnalyses"]:
        errors.append("approved word-analysis count mismatch")
    if len(morpheme_catalog["morphemes"]) != EXPECTED_COUNTS["morphemes"]:
        errors.append("approved morpheme count mismatch")
    if len(morpheme_catalog["rootArtifacts"]) != EXPECTED_COUNTS["rootArtifacts"]:
        errors.append("approved root-artifact count mismatch")
    if len(experience_manifest["profiles"]) != EXPECTED_COUNTS["experienceProfiles"]:
        errors.append("approved experience profile count mismatch")

    for artifact in [content, word_analyses, morpheme_catalog, experience_manifest, fixture]:
        metadata = artifact["metadata"]
        if metadata["activationStatus"] != "not_activated" or metadata["runtimeEnabled"] is not False:
            errors.append(f"{metadata['artifactKey']} is unexpectedly activated")
        if metadata["approvalStatus"] != "human_approved":
            errors.append(f"{metadata['artifactKey']} is not marked human_approved")

    all_records: list[dict[str, Any]] = (
        content["microSkillContent"]
        + content["distractorSets"]
        + word_analyses["wordAnalyses"]
        + morpheme_catalog["morphemes"]
        + morpheme_catalog["rootArtifacts"]
        + experience_manifest["microSkills"]
        + list(experience_manifest["profiles"].values())
    )
    for record in all_records:
        if record.get("candidateStatus") is not None:
            errors.append(f"approved record retained candidateStatus: {record}")
            break
        if record.get("humanReviewStatus") != "approved":
            errors.append("approved record missing humanReviewStatus=approved")
            break
        if record.get("activationStatus") != "not_activated" or record.get("runtimeEnabled") is not False:
            errors.append("approved record activated unexpectedly")
            break

    if not content["approvedTeachingAmendmentsApplied"]:
        errors.append("approved teaching amendments were not applied from approval table")
    compound = next(
        item for item in content["microSkillContent"] if item["microSkillKey"] == "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED"
    )
    if "hyphen" not in compound["childFriendlyExplanation"].lower() or "space" not in compound["childFriendlyExplanation"].lower():
        errors.append("approved compound explanation must mention hyphen and space")

    validate_semantic_integrity(word_analyses, morpheme_catalog)

    if fixture["fixtureBoundary"]["implementsSelectionAlgorithm"] is not False:
        errors.append("pilot fixture must not implement a selection algorithm")
    if fixture["microSkillKey"] != PILOT_MICRO_SKILL_KEY:
        errors.append("pilot fixture micro-skill mismatch")
    if len(fixture["approvedAvailableWordAnalyses"]) != 7:
        errors.append("pilot fixture should expose the seven approved available PREFIXES_UN analyses")

    if approval_inputs["approval"]["scope"]["approvedMicroSkills"] != len(content["microSkillContent"]):
        errors.append("approval/content coverage mismatch")

    if errors:
        raise RuntimeError("; ".join(errors))


def manifest(package_files: dict[Path, Any]) -> dict[str, Any]:
    approval = read_json(APPROVAL_RECORD)
    source_artifacts = [artifact_ref(WORKBOOK), artifact_ref(RETAINED_DESIGN_PACK)]
    candidate_artifacts = [
        artifact_ref(CANDIDATE_CONTENT),
        artifact_ref(CANDIDATE_WORD_ANALYSES),
        artifact_ref(CANDIDATE_MORPHEME_CATALOG),
        artifact_ref(CANDIDATE_EXPERIENCE_MANIFEST),
        artifact_ref(CANDIDATE_SUMMARY),
        artifact_ref(CANDIDATE_ROW_AUDIT),
        artifact_ref(CANDIDATE_REVIEW_QUEUE),
    ]
    approval_artifacts = [
        artifact_ref(APPROVAL_RECORD),
        artifact_ref(MICRO_SKILL_APPROVAL_TABLE),
        artifact_ref(EXCEPTION_REVIEW_TABLE),
        artifact_ref(SPOT_CHECK_TABLE),
        artifact_ref(BATCH_APPROVAL_DECLARATION),
        artifact_ref(REVIEW_PACK_SUMMARY),
    ]
    return {
        "packageKey": PACKAGE_KEY,
        "schemaVersion": SCHEMA_VERSION,
        "contentVersion": CONTENT_VERSION,
        "approvalStatus": "human_approved",
        "humanReviewStatus": "approved",
        "approvalScope": APPROVAL_SCOPE,
        "activationStatus": "not_activated",
        "runtimeEnabled": False,
        "approvalRecordRef": rel(APPROVAL_RECORD),
        "approvalCommit": APPROVAL_COMMIT,
        "approvedBy": approval["reviewer"],
        "approvedAt": approval["approvalDate"],
        "generatorVersion": GENERATOR_VERSION,
        "sourceArtifacts": source_artifacts,
        "candidateArtifacts": candidate_artifacts,
        "approvalArtifacts": approval_artifacts,
        "packageArtifacts": [package_artifact_ref(path, package_files[path]) for path in sorted(package_files)],
        "counts": {
            "microSkills": EXPECTED_COUNTS["microSkills"],
            "wordAnalyses": EXPECTED_COUNTS["wordAnalyses"],
            "morphemes": EXPECTED_COUNTS["morphemes"],
            "distractorSets": EXPECTED_COUNTS["distractorSets"],
            "rootArtifacts": EXPECTED_COUNTS["rootArtifacts"],
            "experienceProfiles": EXPECTED_COUNTS["experienceProfiles"],
        },
        "approvedAmendments": approval["incorporatedAmendments"],
        "runtimeBoundary": {
            "existingActiveGenericTeachingContentRemainsRuntimeTruth": True,
            "contentActivated": False,
            "composerSelectionChanged": False,
            "childRuntimeChanged": False,
            "supabaseChanged": False,
        },
        "futureConsumptionBoundary": "Future server-side content-selection work may consume this approved source package in a separate PR; this PR adds no runtime consumer.",
    }


def build_package() -> dict[Path, Any]:
    approval_inputs = validate_approval_inputs()
    candidate_content = read_json(CANDIDATE_CONTENT)
    candidate_words = read_json(CANDIDATE_WORD_ANALYSES)
    candidate_morphemes = read_json(CANDIDATE_MORPHEME_CATALOG)
    candidate_experience = read_json(CANDIDATE_EXPERIENCE_MANIFEST)

    content = approved_content(candidate_content, approval_inputs["microRows"])
    word_analyses = approved_word_analyses(candidate_words)
    morpheme_catalog = approved_morpheme_catalog(candidate_morphemes)
    experience_manifest = approved_experience_manifest(candidate_experience)
    fixture = pilot_fixture(content, word_analyses, morpheme_catalog, experience_manifest)
    validate_package(content, word_analyses, morpheme_catalog, experience_manifest, fixture, approval_inputs)

    package_files = {
        PACKAGE_CONTENT: content,
        PACKAGE_WORD_ANALYSES: word_analyses,
        PACKAGE_MORPHEME_CATALOG: morpheme_catalog,
        PACKAGE_EXPERIENCE_MANIFEST: experience_manifest,
        PILOT_FIXTURE: fixture,
    }
    return {**package_files, PACKAGE_MANIFEST: manifest(package_files)}


def assert_non_regression() -> None:
    for path in [EXISTING_TEACHING_CONTENT, WORKBOOK, RETAINED_DESIGN_PACK]:
        head = git_head_bytes(path)
        if head is not None and hashlib.sha256(head).hexdigest() != sha256(path):
            raise RuntimeError(f"{rel(path)} differs from HEAD")

    for path in [
        CANDIDATE_CONTENT,
        CANDIDATE_WORD_ANALYSES,
        CANDIDATE_MORPHEME_CATALOG,
        CANDIDATE_EXPERIENCE_MANIFEST,
        CANDIDATE_SUMMARY,
        CANDIDATE_ROW_AUDIT,
        CANDIDATE_REVIEW_QUEUE,
    ]:
        head = git_head_bytes(path)
        if head is not None and hashlib.sha256(head).hexdigest() != sha256(path):
            raise RuntimeError(f"candidate artifact changed unexpectedly: {rel(path)}")

    # Later gated implementation slices are allowed to change runtime and
    # migration files. This regression protects the immutable approved package
    # and its candidate inputs; it must not treat subsequent authorised work as
    # corruption of the approval slice.


def compare_existing(expected: dict[Path, Any]) -> None:
    missing = [rel(path) for path in expected if not path.exists()]
    if missing:
        raise RuntimeError(f"approved package files are missing: {missing}")
    mismatched = []
    for path, value in expected.items():
        rendered = rendered_json(value)
        if path.read_text(encoding="utf-8") != rendered:
            mismatched.append(rel(path))
    if mismatched:
        raise RuntimeError(f"approved package files are not deterministic/current: {mismatched}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate package files without rewriting them.")
    args = parser.parse_args()

    package = build_package()
    if args.check:
        compare_existing(package)
    else:
        for path, value in package.items():
            write_json(path, value)
    assert_non_regression()

    current = build_package()
    if not args.check:
        compare_existing(current)

    manifest_data = current[PACKAGE_MANIFEST]
    print("ADLE D4_MOR approved package regression passed")
    print(
        json.dumps(
            {
                "package": manifest_data["packageKey"],
                "content_version": manifest_data["contentVersion"],
                "micro_skills": manifest_data["counts"]["microSkills"],
                "word_analyses": manifest_data["counts"]["wordAnalyses"],
                "morphemes": manifest_data["counts"]["morphemes"],
                "activation_status": manifest_data["activationStatus"],
                "runtime_enabled": manifest_data["runtimeEnabled"],
                "pilot_fixture": rel(PILOT_FIXTURE),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
