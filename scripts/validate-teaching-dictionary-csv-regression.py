#!/usr/bin/env python3
"""Regression coverage for the Phase 5C teaching dictionary CSV validator.

The committed fixture folders are synthetic test data only. They are not
reviewed curriculum content and must not be treated as teaching truth.
"""

from __future__ import annotations

import copy
import csv
import importlib.util
import json
import shutil
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = ROOT / "scripts/validate-teaching-dictionary-csv.py"
FIXTURE_ROOT = ROOT / "scripts/fixtures/teaching-dictionary-csv"
TMP_ROOT = ROOT / ".tmp/teaching-dictionary-csv-regression"

PG_SKILL = "D4_PG_CVC_SHORT_VOWELS_SHORT_A"
MOR_SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE"
HOM_SKILL = "D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO"
SCHWA_SKILL = "D4_SCHWA_INITIAL_A_INITIAL"

HEADERS = {
    "canonical_words.csv": [
        "word_key",
        "normalised_word",
        "display_word",
        "dialect_code",
        "frequency_band",
        "age_band",
        "complexity_band",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "confidence",
        "review_status",
        "row_status",
    ],
    "canonical_word_metadata.csv": [
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
    ],
    "canonical_word_micro_skills.csv": [
        "word_key",
        "micro_skill_key",
        "micro_skill_role",
        "difficulty_band",
        "evidence_weight",
        "display_order",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "confidence",
        "review_status",
    ],
    "teaching_content_versions.csv": [
        "micro_skill_key",
        "content_version",
        "version_status",
        "is_active",
        "teaching_objective",
        "child_friendly_explanation",
        "rule_explanation",
        "memory_tip",
        "anchor_word_key",
        "ordered_example_word_keys",
        "contrast_word_keys",
        "common_misconceptions",
        "first_exposure_progression",
        "review_progression",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "confidence",
        "supersedes_content_version",
        "final_readiness_review_status",
        "final_readiness_reviewed_by",
        "final_readiness_reviewed_at",
    ],
    "teaching_content_field_reviews.csv": [
        "micro_skill_key",
        "content_version",
        "field_key",
        "review_gate",
        "review_status",
        "reviewed_by",
        "reviewed_at",
        "review_notes",
    ],
    "teaching_content_sources.csv": [
        "source_key",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "importability_status",
        "legal_review_status",
    ],
}

FIRST_EXPOSURE_REVIEW_FIELDS = [
    "teaching_objective",
    "child_friendly_explanation",
    "rule_explanation",
    "anchor_word_key",
    "ordered_example_word_keys",
    "first_exposure_progression",
    "review_progression",
    "source",
    "licence",
]


def load_validator():
    spec = importlib.util.spec_from_file_location("teaching_dictionary_validator", VALIDATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load validator from {VALIDATOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def source_fields(category: str = "internal_authored") -> dict[str, str]:
    return {
        "source_category": category,
        "source_name": "Synthetic Phase 5D fixture",
        "source_url": "",
        "source_licence": "",
        "source_use_note": "Synthetic test-only fixture content; not reviewed curriculum truth.",
        "confidence": "high",
    }


def word(word_key: str, text: str) -> dict[str, str]:
    return {
        "word_key": word_key,
        "normalised_word": text,
        "display_word": text,
        "dialect_code": "en-GB",
        "frequency_band": "high",
        "age_band": "synthetic",
        "complexity_band": "low",
        **source_fields(),
        "review_status": "approved_for_first_exposure",
        "row_status": "active",
    }


def metadata(
    word_key: str,
    *,
    has_schwa: str = "FALSE",
    phoneme_hint: str = "",
    stress_pattern: str = "",
    morphemes: str = "",
    morphology_notes: str = "",
) -> dict[str, str]:
    return {
        "word_key": word_key,
        "syllables": "1",
        "phoneme_hint": phoneme_hint,
        "grapheme_notes": "",
        "stress_pattern": stress_pattern,
        "has_schwa": has_schwa,
        "morphemes": morphemes,
        "morphology_notes": morphology_notes,
        "irregularity_notes": "",
        **source_fields(),
        "review_status": "approved_for_first_exposure",
    }


def mapping(word_key: str, skill: str, role: str, order: int) -> dict[str, str]:
    return {
        "word_key": word_key,
        "micro_skill_key": skill,
        "micro_skill_role": role,
        "difficulty_band": "low",
        "evidence_weight": "1",
        "display_order": str(order),
        **source_fields(),
        "review_status": "approved_for_first_exposure",
    }


def teaching_version(
    skill: str,
    *,
    version: str = "v1",
    status: str = "active",
    active: str = "TRUE",
    anchor: str = "cat_en_gb",
    examples: str = "cat_en_gb|sat_en_gb",
    contrasts: str = "",
    child_explanation: str = "Synthetic child-facing explanation.",
    source_category: str = "internal_authored",
    final_status: str = "signed_off",
) -> dict[str, str]:
    fields = source_fields(source_category)
    return {
        "micro_skill_key": skill,
        "content_version": version,
        "version_status": status,
        "is_active": active,
        "teaching_objective": "Synthetic teaching objective.",
        "child_friendly_explanation": child_explanation,
        "rule_explanation": "Synthetic rule explanation.",
        "memory_tip": "",
        "anchor_word_key": anchor,
        "ordered_example_word_keys": examples,
        "contrast_word_keys": contrasts,
        "common_misconceptions": "",
        "first_exposure_progression": "rule_explanation|guided_rule_application",
        "review_progression": "rapid_recall",
        **fields,
        "supersedes_content_version": "",
        "final_readiness_review_status": final_status,
        "final_readiness_reviewed_by": "Synthetic Admin",
        "final_readiness_reviewed_at": "2026-06-29",
    }


def field_reviews(skill: str, version: str = "v1", status: str = "approved_for_first_exposure") -> list[dict[str, str]]:
    rows = []
    for field in FIRST_EXPOSURE_REVIEW_FIELDS:
        rows.append(
            {
                "micro_skill_key": skill,
                "content_version": version,
                "field_key": field,
                "review_gate": "source_licence" if field in {"source", "licence"} else "pedagogy",
                "review_status": status,
                "reviewed_by": "Synthetic Admin",
                "reviewed_at": "2026-06-29",
                "review_notes": "Synthetic test-only fixture review.",
            }
        )
    return rows


def base_pg() -> dict[str, list[dict[str, str]]]:
    return {
        "canonical_words.csv": [word("cat_en_gb", "cat"), word("sat_en_gb", "sat")],
        "canonical_word_metadata.csv": [metadata("cat_en_gb"), metadata("sat_en_gb")],
        "canonical_word_micro_skills.csv": [
            mapping("cat_en_gb", PG_SKILL, "anchor", 1),
            mapping("sat_en_gb", PG_SKILL, "ordered_example", 2),
        ],
        "teaching_content_versions.csv": [teaching_version(PG_SKILL)],
        "teaching_content_field_reviews.csv": field_reviews(PG_SKILL),
        "teaching_content_sources.csv": [],
    }


def write_fixture(name: str, data: dict[str, list[dict[str, str]]]) -> None:
    folder = FIXTURE_ROOT / name
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    readme = (
        "Synthetic Phase 5D fixture for the teaching dictionary CSV validator.\n"
        "This content is test-only and must not be used as curriculum truth.\n"
    )
    (folder / "README.md").write_text(readme, encoding="utf-8")
    for file_name, headers in HEADERS.items():
        with (folder / file_name).open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            writer.writerows(data.get(file_name, []))


def build_fixtures() -> None:
    if FIXTURE_ROOT.exists():
        shutil.rmtree(FIXTURE_ROOT)
    FIXTURE_ROOT.mkdir(parents=True)

    write_fixture("valid_first_exposure_pg", base_pg())

    guided = base_pg()
    guided["teaching_content_versions.csv"][0]["version_status"] = "in_review"
    guided["teaching_content_versions.csv"][0]["is_active"] = "FALSE"
    guided["teaching_content_versions.csv"][0]["child_friendly_explanation"] = ""
    guided["teaching_content_versions.csv"][0]["first_exposure_progression"] = ""
    guided["teaching_content_versions.csv"][0]["final_readiness_review_status"] = "signed_off"
    guided["teaching_content_field_reviews.csv"] = field_reviews(PG_SKILL, status="approved_for_guided_review")
    write_fixture("guided_review_only_pg", guided)

    missing_child = base_pg()
    missing_child["teaching_content_versions.csv"][0]["child_friendly_explanation"] = ""
    write_fixture("missing_child_friendly_explanation", missing_child)

    missing_source = base_pg()
    missing_source["teaching_content_versions.csv"][0]["source_name"] = ""
    missing_source["teaching_content_versions.csv"][0]["source_use_note"] = ""
    write_fixture("missing_source_licence", missing_source)

    reference_only = base_pg()
    reference_only["teaching_content_versions.csv"][0]["source_category"] = "reference_only"
    write_fixture("reference_only_surfaced", reference_only)

    ai_draft = base_pg()
    ai_draft["teaching_content_versions.csv"][0]["source_category"] = "ai_assisted_draft"
    write_fixture("ai_draft_claims_final", ai_draft)

    duplicate = base_pg()
    second = copy.deepcopy(duplicate["teaching_content_versions.csv"][0])
    second["content_version"] = "v2"
    duplicate["teaching_content_versions.csv"].append(second)
    duplicate["teaching_content_field_reviews.csv"].extend(field_reviews(PG_SKILL, version="v2"))
    write_fixture("duplicate_active_version", duplicate)

    archived = base_pg()
    archived["teaching_content_versions.csv"][0]["version_status"] = "archived"
    archived["teaching_content_versions.csv"][0]["is_active"] = "FALSE"
    archived["teaching_content_versions.csv"][0]["final_readiness_review_status"] = "not_started"
    write_fixture("archived_non_active", archived)

    unknown_word = base_pg()
    unknown_word["teaching_content_versions.csv"][0]["anchor_word_key"] = "missing_word_key"
    write_fixture("unknown_word_reference", unknown_word)

    unknown_skill = base_pg()
    unknown_skill["teaching_content_versions.csv"][0]["micro_skill_key"] = "D4_UNKNOWN_SYNTHETIC"
    unknown_skill["teaching_content_field_reviews.csv"] = field_reviews("D4_UNKNOWN_SYNTHETIC")
    write_fixture("unknown_micro_skill_key", unknown_skill)

    hom = {
        "canonical_words.csv": [word("to_en_gb", "to"), word("too_en_gb", "too")],
        "canonical_word_metadata.csv": [metadata("to_en_gb"), metadata("too_en_gb")],
        "canonical_word_micro_skills.csv": [
            mapping("to_en_gb", HOM_SKILL, "anchor", 1),
            mapping("too_en_gb", HOM_SKILL, "ordered_example", 2),
        ],
        "teaching_content_versions.csv": [
            teaching_version(HOM_SKILL, anchor="to_en_gb", examples="to_en_gb|too_en_gb", contrasts="")
        ],
        "teaching_content_field_reviews.csv": field_reviews(HOM_SKILL),
        "teaching_content_sources.csv": [],
    }
    write_fixture("hom_missing_contrast", hom)

    mor = {
        "canonical_words.csv": [word("playful_en_gb", "playful"), word("helpful_en_gb", "helpful")],
        "canonical_word_metadata.csv": [metadata("playful_en_gb"), metadata("helpful_en_gb")],
        "canonical_word_micro_skills.csv": [
            mapping("playful_en_gb", MOR_SKILL, "anchor", 1),
            mapping("helpful_en_gb", MOR_SKILL, "ordered_example", 2),
        ],
        "teaching_content_versions.csv": [
            teaching_version(MOR_SKILL, anchor="playful_en_gb", examples="playful_en_gb|helpful_en_gb")
        ],
        "teaching_content_field_reviews.csv": field_reviews(MOR_SKILL),
        "teaching_content_sources.csv": [],
    }
    write_fixture("mor_missing_morphology", mor)

    schwa = {
        "canonical_words.csv": [word("about_en_gb", "about"), word("again_en_gb", "again")],
        "canonical_word_metadata.csv": [metadata("about_en_gb"), metadata("again_en_gb")],
        "canonical_word_micro_skills.csv": [
            mapping("about_en_gb", SCHWA_SKILL, "anchor", 1),
            mapping("again_en_gb", SCHWA_SKILL, "ordered_example", 2),
        ],
        "teaching_content_versions.csv": [
            teaching_version(SCHWA_SKILL, anchor="about_en_gb", examples="about_en_gb|again_en_gb")
        ],
        "teaching_content_field_reviews.csv": field_reviews(SCHWA_SKILL),
        "teaching_content_sources.csv": [],
    }
    write_fixture("schwa_missing_sound_metadata", schwa)


EXPECTED = {
    "valid_first_exposure_pg": {
        "states": {"ready_for_first_exposure": 1},
        "blockers": set(),
        "errors": 0,
    },
    "guided_review_only_pg": {
        "states": {"ready_for_guided_review_only": 1},
        "blockers": set(),
        "errors": 0,
    },
    "missing_child_friendly_explanation": {
        "states": {"content_gap": 1},
        "blockers": {"missing_child_friendly_explanation"},
        "errors": 0,
    },
    "missing_source_licence": {
        "states": {"source_or_license_gap": 1},
        "blockers": {"missing_source", "missing_licence"},
        "errors": 3,
    },
    "reference_only_surfaced": {
        "states": {"source_or_license_gap": 1},
        "blockers": {"copyrighted_reference_only_content"},
        "errors": 0,
    },
    "ai_draft_claims_final": {
        "states": {"needs_manual_review": 1},
        "blockers": {"unreviewed_ai_generated_content"},
        "errors": 0,
    },
    "duplicate_active_version": {
        "states": {"ready_for_first_exposure": 2},
        "blockers": set(),
        "errors": 2,
    },
    "archived_non_active": {
        "states": {"archived": 1},
        "blockers": set(),
        "errors": 0,
    },
    "unknown_word_reference": {
        "states": {"content_gap": 1},
        "blockers": {"missing_anchor_word"},
        "errors": 1,
    },
    "unknown_micro_skill_key": {
        "states": {"content_gap": 1},
        "blockers": {"unsupported_practice_route"},
        "errors": 1,
    },
    "hom_missing_contrast": {
        "states": {"content_gap": 1},
        "blockers": {"insufficient_ordered_example_words"},
        "errors": 0,
    },
    "mor_missing_morphology": {
        "states": {"content_gap": 1},
        "blockers": {"missing_rule_explanation"},
        "errors": 0,
    },
    "schwa_missing_sound_metadata": {
        "states": {"content_gap": 1},
        "blockers": {"missing_rule_explanation"},
        "errors": 0,
    },
}


def blocker_codes(report: dict[str, Any]) -> set[str]:
    codes: set[str] = set()
    for version in report["versions"]:
        codes.update(blocker["blocker_reason"] for blocker in version["blockers"])
    return codes


def assert_scenario(name: str, report: dict[str, Any]) -> None:
    expected = EXPECTED[name]
    summary = report["summary"]
    for state, count in expected["states"].items():
        actual = summary[state]
        if actual != count:
            raise AssertionError(f"{name}: expected {state}={count}, got {actual}")

    actual_blockers = blocker_codes(report)
    missing_blockers = expected["blockers"] - actual_blockers
    if missing_blockers:
        raise AssertionError(f"{name}: missing blocker codes {sorted(missing_blockers)}; got {sorted(actual_blockers)}")

    if summary["errors"] != expected["errors"]:
        raise AssertionError(f"{name}: expected errors={expected['errors']}, got {summary['errors']}")

    if report["dry_run_only"] is not True:
        raise AssertionError(f"{name}: report must be dry_run_only")
    for boundary in ["no Supabase writes", "no migrations", "no imports"]:
        if boundary not in report["hard_boundaries"]:
            raise AssertionError(f"{name}: missing hard boundary {boundary!r}")


def normalize_report(report: dict[str, Any]) -> dict[str, Any]:
    copy_report = copy.deepcopy(report)
    copy_report["generated_at"] = "<generated_at>"
    copy_report["input_folder"] = "<input_folder>"
    return copy_report


def main() -> int:
    if not FIXTURE_ROOT.exists():
        raise FileNotFoundError(f"Fixture root is missing: {FIXTURE_ROOT}")
    validator = load_validator()
    if TMP_ROOT.exists():
        shutil.rmtree(TMP_ROOT)
    TMP_ROOT.mkdir(parents=True)

    for scenario in sorted(EXPECTED):
        folder = FIXTURE_ROOT / scenario
        report = validator.validate(folder)
        assert_scenario(scenario, report)

        first = normalize_report(report)
        second = normalize_report(validator.validate(folder))
        if first != second:
            raise AssertionError(f"{scenario}: report is not deterministic after normalizing generated_at/input_folder")

        (TMP_ROOT / f"{scenario}.json").write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    print("validate-teaching-dictionary-csv-regression: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
