#!/usr/bin/env python3
"""Regression coverage for reviewed ADLE base-word family CSV metadata.

Synthetic only: this script proves validator boundaries and does not import or
activate teaching content.
"""

from __future__ import annotations

import csv
import importlib.util
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = ROOT / "scripts/validate-teaching-dictionary-csv.py"
TMP = ROOT / ".tmp/adle-base-word-family-metadata-regression"

FAMILY_HEADERS = [
    "base_family_key", "micro_skill_key", "base_word_key", "base_meaning",
    "source_category", "source_name", "source_url", "source_licence", "source_use_note",
    "confidence", "review_status", "reviewed_by", "reviewed_at",
]
MEMBER_HEADERS = [
    "base_family_key", "word_key", "member_role", "word_sum", "morphology_parts", "morphology_joins",
    "transformation_notes", "dictation_sentence", "dictation_target_token_index", "audio_text", "assignment_eligible",
    "source_category", "source_name", "source_url", "source_licence", "source_use_note",
    "confidence", "review_status", "reviewed_by", "reviewed_at",
]


def load_validator():
    spec = importlib.util.spec_from_file_location("teaching_dictionary_validator", VALIDATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load teaching dictionary validator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def row_source() -> dict[str, str]:
    return {
        "source_category": "internal_authored",
        "source_name": "Synthetic base-word-family regression fixture",
        "source_url": "",
        "source_licence": "",
        "source_use_note": "Synthetic test-only fixture; never curriculum truth.",
        "confidence": "high",
        "review_status": "approved_for_first_exposure",
        "reviewed_by": "Synthetic Admin",
        "reviewed_at": "2026-07-17",
    }


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, lineterminator="\n", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_fixture(*, invalid_member: bool) -> Path:
    fixture = TMP / ("invalid" if invalid_member else "valid")
    fixture.mkdir(parents=True)
    source = row_source()
    words = [
        ("help_en_gb", "help"), ("helpful_en_gb", "helpful"), ("helpless_en_gb", "helpless"),
    ]
    write_csv(fixture / "canonical_words.csv", [
        "word_key", "normalised_word", "display_word", "dialect_code", "frequency_band", "age_band", "complexity_band",
        "source_category", "source_name", "source_url", "source_licence", "source_use_note", "confidence", "review_status", "row_status",
    ], [{"word_key": key, "normalised_word": text, "display_word": text, "dialect_code": "en-GB", "frequency_band": "high", "age_band": "synthetic", "complexity_band": "low", **source, "row_status": "active"} for key, text in words])
    write_csv(fixture / "canonical_word_metadata.csv", [
        "word_key", "syllables", "phoneme_hint", "grapheme_notes", "stress_pattern", "has_schwa", "morphemes", "morphology_notes", "irregularity_notes",
        "source_category", "source_name", "source_url", "source_licence", "source_use_note", "confidence", "review_status",
    ], [{"word_key": key, "syllables": "1", "phoneme_hint": "", "grapheme_notes": "", "stress_pattern": "", "has_schwa": "FALSE", "morphemes": "", "morphology_notes": "", "irregularity_notes": "", **source} for key, _ in words])
    write_csv(fixture / "micro_skill_word_support.csv", [
        "word_key", "micro_skill_key", "support_role", "source_category", "source_name", "source_url", "source_licence", "source_use_note", "confidence", "review_status", "review_notes",
    ], [{"word_key": key, "micro_skill_key": "D4_MOR_BASE_WORDS_PRESERVE_BASE", "support_role": "support_example", **source, "review_notes": "Synthetic."} for key, _ in words])
    write_csv(fixture / "teaching_content_versions.csv", [
        "micro_skill_key", "content_version", "version_status", "is_active", "teaching_objective", "child_friendly_explanation", "rule_explanation", "memory_tip", "common_misconceptions", "first_exposure_progression", "guided_practice_progression", "review_proofreading_progression", "example_selection_guidance", "contrast_policy_guidance", "sample_preview_word_key", "source_category", "source_name", "source_url", "source_licence", "source_use_note", "confidence", "supersedes_content_version", "final_readiness_review_status", "final_readiness_reviewed_by", "final_readiness_reviewed_at",
    ], [])
    write_csv(fixture / "teaching_content_field_reviews.csv", ["micro_skill_key", "content_version", "field_key", "review_gate", "review_status", "reviewed_by", "reviewed_at", "review_notes"], [])
    write_csv(fixture / "base_word_families.csv", FAMILY_HEADERS, [{
        "base_family_key": "BASE_HELP", "micro_skill_key": "D4_MOR_BASE_WORDS_PRESERVE_BASE", "base_word_key": "help_en_gb", "base_meaning": "give help", **source,
    }])
    member_rows = []
    for key, text in words:
        member_rows.append({
            "base_family_key": "BASE_HELP", "word_key": key, "member_role": "base" if text == "help" else "transfer",
            "word_sum": text if text == "help" else ("help + ful" if text == "helpful" else "help + less"),
            "morphology_parts": "" if invalid_member and text == "helpless" else "[{\"text\": \"help\", \"kind\": \"base\"}]",
            "morphology_joins": "[]", "transformation_notes": "", "dictation_sentence": f"I can spell {text}.", "dictation_target_token_index": "3", "audio_text": text,
            "assignment_eligible": "TRUE", **source,
        })
    write_csv(fixture / "base_word_family_members.csv", MEMBER_HEADERS, member_rows)
    return fixture


def main() -> int:
    if TMP.exists():
        shutil.rmtree(TMP)
    validator = load_validator()
    valid = validator.validate(write_fixture(invalid_member=False))
    if valid["summary"]["errors"] != 0:
        raise AssertionError(f"valid family fixture had errors: {valid['issues']}")
    invalid = validator.validate(write_fixture(invalid_member=True))
    if invalid["summary"]["errors"] != 1 or not any(issue["field"] == "morphology_parts" for issue in invalid["issues"]):
        raise AssertionError(f"invalid family fixture did not fail closed: {invalid['issues']}")
    print("adle-base-word-family-metadata-regression: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
