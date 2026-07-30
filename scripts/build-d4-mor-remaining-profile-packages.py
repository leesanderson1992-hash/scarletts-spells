#!/usr/bin/env python3
"""Build six disabled D4_MOR first-impression profile candidates.

The frozen July package is an immutable reviewed source. These derived profile
candidates do not alter it, activate runtime selection, or claim that missing
Teaching Dictionary facts have been approved.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
APPROVED = ROOT / "data/adle/approved/d4-mor/v1"
OUTPUT = ROOT / "data/adle/candidates/d4-mor-remaining-profiles/v1"
CONTENT = APPROVED / "d4-mor-v1-content.json"
ANALYSES = APPROVED / "d4-mor-v1-word-analyses.json"
MORPHEMES = APPROVED / "d4-mor-v1-morpheme-catalog.json"
MANIFEST = APPROVED / "d4-mor-v1-manifest.json"
TAXONOMY = ROOT / "docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json"
SCHEMA_VERSION = "d4_mor_morphology_profile_package_v1"
CONTENT_VERSION = "d4_mor_remaining_profiles_v1_2026_07_29"

COMMON_REQUIREMENTS = [
    "active approved_for_first_exposure canonical identity",
    "clean child-facing component/root meanings",
    "clean child-facing whole-word meaning",
    "reviewed child teaching decomposition",
    "canonical ordered morphology parts",
    "canonical morphology joins",
    "canonical morphology transformations",
    "canonical morphology notes and provenance",
    "pronunciation, syllables, stress, schwa and phoneme facts",
    "frequency, age and complexity bands",
    "reviewed dictation sentence, audio text and complete target location",
    "explicit profile membership",
    "explicit transfer eligibility",
]

PROFILE_CONFIGS = [
    {
        "slug": "closed-compounds",
        "microSkillKey": "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
        "profileType": "compound",
        "compoundKind": "closed",
        "words": ["football", "bedroom", "playground", "rainbow"],
        "itemCount": 16,
        "guidedShape": ["two discovery/build interactions", "four meaning matches"],
        "reflection": {
            "promptKey": "closed-compounds-two-bases-v1",
            "promptText": "How do the two smaller words help you spell a closed compound?",
        },
    },
    {
        "slug": "open-hyphenated-compounds",
        "microSkillKey": "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
        "profileType": "compound",
        "compoundKind": "open_and_hyphenated",
        "words": ["ice cream", "post office", "twenty-one", "part-time"],
        "itemCount": 18,
        "guidedShape": [
            "four join-style decisions",
            "one form-preserving build for each word",
        ],
        "reflection": {
            "promptKey": "compound-join-style-v1",
            "promptText": "What tells you whether compound parts need no gap, a space, or a hyphen?",
        },
    },
    {
        "slug": "common-greek-roots",
        "microSkillKey": "D4_MOR_ROOTS_COMMON_GREEK_ROOTS",
        "profileType": "root",
        "rootKind": "common_greek",
        "words": ["telephone", "telescope", "microphone", "microscope"],
        "itemCount": 18,
        "guidedShape": ["root-meaning practice", "meaning-led builds"],
        "reflection": {
            "promptKey": "greek-root-meaning-v1",
            "promptText": "How did the Greek root meaning help you build or understand a word?",
        },
    },
    {
        "slug": "common-latin-roots",
        "microSkillKey": "D4_MOR_ROOTS_COMMON_LATIN_ROOTS",
        "profileType": "root",
        "rootKind": "common_latin",
        "words": ["transport", "export", "construct", "structure"],
        "itemCount": 18,
        "guidedShape": ["root-meaning practice", "meaning-led builds"],
        "reflection": {
            "promptKey": "latin-root-meaning-v1",
            "promptText": "How did the Latin root meaning help you build or understand a word?",
        },
    },
    {
        "slug": "root-family-spelling",
        "microSkillKey": "D4_MOR_ROOTS_ROOT_FAMILY_SPELLING",
        "profileType": "root",
        "rootKind": "root_family",
        "words": ["action", "active", "actor", "react"],
        "itemCount": 16,
        "guidedShape": ["two root-family discoveries", "four meaning matches"],
        "reflection": {
            "promptKey": "root-family-stable-spelling-v1",
            "promptText": "What spelling stayed the same across this root family?",
        },
    },
    {
        "slug": "science-maths-roots",
        "microSkillKey": "D4_MOR_ROOTS_SCIENCE_MATH_ROOTS",
        "profileType": "root",
        "rootKind": "science_maths",
        "words": ["biology", "geography", "thermometer", "triangle"],
        "itemCount": 18,
        "guidedShape": ["root-meaning practice", "meaning-led builds"],
        "reflection": {
            "promptKey": "science-maths-root-meaning-v1",
            "promptText": "How did the root meaning help you spell this science or maths word?",
        },
    },
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def rendered(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered(value), encoding="utf-8")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_profile(profile: dict[str, Any]) -> None:
    errors: list[str] = []
    if len(profile["members"]) != 4:
        errors.append("profile must contain exactly four reviewed roster members")
    if profile["stagingEnabled"] or profile["productionEnabled"]:
        errors.append("candidate profile must remain disabled")
    if profile["runtimeSelectionAllowed"]:
        errors.append("candidate profile must fail closed")
    if profile["profileReviewStatus"] != "profile_specific_human_review_required":
        errors.append("new profile copy must not claim unrecorded human approval")
    if profile["immutableLessonShape"]["itemCount"] not in {16, 18}:
        errors.append("unsupported immutable lesson shape")
    for member in profile["members"]:
        analysis = member["approvedHistoricalAnalysis"]
        if analysis["approvalStatus"] != "human_approved":
            errors.append(f"{member['displayWord']} analysis is not human-approved source")
        if analysis["activationStatus"] != "not_activated":
            errors.append(f"{member['displayWord']} historical analysis was activated")
        reconstructed = ""
        for index, part in enumerate(analysis["parts"]):
            reconstructed += part["surfaceText"]
            if index < len(analysis["joins"]):
                reconstructed += analysis["joins"][index]["surfaceText"]
        if reconstructed != member["displayWord"]:
            errors.append(f"{member['displayWord']} morphology does not reconstruct")
        if member["assignmentEligible"]:
            errors.append(f"{member['displayWord']} must remain ineligible before dictionary release")
    if profile["profileType"] == "compound":
        for member in profile["members"]:
            joins = member["approvedHistoricalAnalysis"]["joins"]
            if not joins or joins[0]["joinType"] not in {"none", "space", "hyphen"}:
                errors.append(f"{member['displayWord']} lacks an explicit compound join")
        if profile["compoundContract"]["answerComparison"] != "separator_significant":
            errors.append("compound comparison must preserve separators")
        if profile["compoundKind"] == "open_and_hyphenated":
            if profile["compoundContract"]["dictationTargetLocation"] != "reviewed_token_span_required":
                errors.append("open compounds require reviewed token-span targeting")
    if profile["profileType"] == "root":
        if not profile["rootArtifacts"]:
            errors.append("root profile must include artifact-card source facts")
        for artifact in profile["rootArtifacts"]:
            for field in ("rootText", "meaning", "originLine", "variantGroupKey"):
                if field not in artifact:
                    errors.append(f"root artifact lacks {field}")
    if errors:
        raise RuntimeError(f"{profile['microSkillKey']}: {'; '.join(errors)}")


def main() -> None:
    content = read_json(CONTENT)
    analyses = read_json(ANALYSES)
    morphemes = read_json(MORPHEMES)
    taxonomy = read_json(TAXONOMY)
    current_keys = {
        row["micro_skill_key"]
        for row in taxonomy
        if row["skill_family_key"] == "D4_MOR"
    }
    content_by_key = {
        row["microSkillKey"]: row for row in content["microSkillContent"]
    }
    distractors_by_key = {
        row["microSkillKey"]: row for row in content["distractorSets"]
    }
    analysis_by_key = {
        (row["microSkillKey"], row["displayWord"]): row
        for row in analyses["wordAnalyses"]
    }
    morpheme_by_key = {
        row["morphemeKey"].lower(): row for row in morphemes["morphemes"]
    }
    root_artifact_by_key = {
        row["rootArtifactKey"].lower(): row for row in morphemes["rootArtifacts"]
    }

    output_files: list[Path] = []
    summaries = []
    for config in PROFILE_CONFIGS:
        key = config["microSkillKey"]
        if key not in current_keys:
            raise RuntimeError(f"current taxonomy lacks {key}")
        approved_content = content_by_key[key]
        selected_analyses = [analysis_by_key[(key, word)] for word in config["words"]]
        referenced_morpheme_keys = sorted(
            {
                part["morphemeKey"]
                for analysis in selected_analyses
                for part in analysis["parts"]
                if part.get("morphemeKey")
            }
        )
        referenced_morphemes = [
            morpheme_by_key[morpheme_key.lower()]
            for morpheme_key in referenced_morpheme_keys
            if morpheme_key.lower() in morpheme_by_key
        ]
        root_artifacts = [
            root_artifact_by_key[morpheme_key.lower()]
            for morpheme_key in referenced_morpheme_keys
            if morpheme_key.lower() in root_artifact_by_key
        ]
        profile: dict[str, Any] = {
            "schemaVersion": SCHEMA_VERSION,
            "contentVersion": CONTENT_VERSION,
            "profileType": config["profileType"],
            "microSkillKey": key,
            "stagingEnabled": False,
            "productionEnabled": False,
            "runtimeSelectionAllowed": False,
            "profileReviewStatus": "profile_specific_human_review_required",
            "reviewBoundary": (
                "Roster, teaching source and historical analyses are human-reviewed. "
                "The new profile reflection/shape and released dictionary facts require "
                "their own approval before staging activation."
            ),
            "reviewedIntroduction": {
                "title": approved_content["skillTitle"],
                "childFriendlyExplanation": approved_content["childFriendlyExplanation"],
                "ruleExplanation": approved_content["ruleExplanation"],
                "watchForCue": approved_content["watchForCue"],
                "sourceApprovalStatus": approved_content["approvalStatus"],
                "sourceReviewerDecision": approved_content["reviewerDecision"],
            },
            "reflection": {
                **config["reflection"],
                "reviewStatus": "profile_specific_human_review_required",
            },
            "immutableLessonShape": {
                "itemCount": config["itemCount"],
                "guidedShape": config["guidedShape"],
                "independentProduction": [
                    "one controlled spelling item per roster word",
                    "one reviewed full-sentence dictation per roster word",
                ],
                "guidedInteractionsInflateIndependentMastery": False,
            },
            "selectionPolicy": {
                "rosterSize": 4,
                "selectionKind": "fixed_reviewed_profile_membership",
                "requiresExplicitMembership": True,
                "requiresExplicitTransferEligibility": True,
                "existingAssignmentSnapshotsImmutable": True,
            },
            "eligibilityRequirements": COMMON_REQUIREMENTS,
            "members": [
                {
                    "displayWord": analysis["displayWord"],
                    "assignmentEligible": False,
                    "transferEligible": False,
                    "runtimeReadiness": "blocked_pending_complete_released_dictionary_facts",
                    "approvedHistoricalAnalysis": analysis,
                }
                for analysis in selected_analyses
            ],
            "approvedHistoricalDistractors": distractors_by_key[key],
            "referencedMorphemes": referenced_morphemes,
            "provenance": {
                "approvedManifest": str(MANIFEST.relative_to(ROOT)),
                "approvedContent": str(CONTENT.relative_to(ROOT)),
                "approvedWordAnalyses": str(ANALYSES.relative_to(ROOT)),
                "approvedMorphemeCatalog": str(MORPHEMES.relative_to(ROOT)),
                "currentTaxonomy": str(TAXONOMY.relative_to(ROOT)),
                "approvedManifestSha256": sha256(MANIFEST),
                "currentTaxonomySha256": sha256(TAXONOMY),
            },
        }
        if config["profileType"] == "compound":
            profile["compoundKind"] = config["compoundKind"]
            profile["compoundContract"] = {
                "joinsAreTeachingFacts": ["none", "space", "hyphen"],
                "answerComparison": "separator_significant",
                "forbiddenNormaliser": "affix_normaliser_that_removes_spacing_or_punctuation",
                "dictationTargetLocation": (
                    "reviewed_token_span_required"
                    if config["compoundKind"] == "open_and_hyphenated"
                    else "reviewed_single_token_or_exact_span"
                ),
            }
        else:
            profile["rootKind"] = config["rootKind"]
            profile["rootContract"] = {
                "identityFields": [
                    "root identity",
                    "surface form",
                    "meaning",
                    "origin",
                    "variant group",
                    "artifact-card facts",
                ],
                "canonicalMorphologyAuthoritative": True,
                "letterSubstringNeverImpliesEligibility": True,
            }
            profile["rootArtifacts"] = root_artifacts

        validate_profile(profile)
        output_path = OUTPUT / f"{config['slug']}.json"
        write_json(output_path, profile)
        output_files.append(output_path)
        summaries.append(
            {
                "microSkillKey": key,
                "path": str(output_path.relative_to(ROOT)),
                "profileType": config["profileType"],
                "itemCount": config["itemCount"],
                "memberCount": 4,
                "runtimeSelectionAllowed": False,
                "profileReviewStatus": profile["profileReviewStatus"],
            }
        )

    package_manifest = {
        "packageKey": "d4_mor_remaining_profiles_v1",
        "schemaVersion": SCHEMA_VERSION,
        "contentVersion": CONTENT_VERSION,
        "stagingEnabled": False,
        "productionEnabled": False,
        "runtimeSelectionAllowed": False,
        "profileCount": len(summaries),
        "profiles": summaries,
        "artifacts": [
            {"path": str(path.relative_to(ROOT)), "sha256": sha256(path)}
            for path in output_files
        ],
        "releaseBoundary": (
            "Preparation only. Each profile needs complete immutable Teaching Dictionary "
            "facts, profile-specific human approval, staging import/proof and separate "
            "written production authority."
        ),
    }
    write_json(OUTPUT / "manifest.json", package_manifest)
    print(
        json.dumps(
            {
                "profiles": len(summaries),
                "members": sum(item["memberCount"] for item in summaries),
                "runtimeSelectionAllowed": False,
                "manifest": str((OUTPUT / "manifest.json").relative_to(ROOT)),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
