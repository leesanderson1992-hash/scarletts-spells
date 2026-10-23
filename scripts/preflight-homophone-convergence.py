#!/usr/bin/env python3
"""Fail-closed content preflight for the 68-skill homophone convergence."""

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data/adle/homophone/convergence-v1"


def read(name: str) -> list[dict[str, str]]:
    with (DIR / name).open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", action="store_true", help="Exit nonzero when any review gate is missing")
    args = parser.parse_args()
    manifest = json.loads((DIR / "manifest.json").read_text())
    dictionary = read("dictionary-intake-review.csv")
    members = read("contrast-set-review.csv")
    lessons = read("lesson-content-review.csv")
    redirects = read("redirect-review.csv")
    structure = read("incoming-canonical-structure-review.csv")
    base_dependencies = read("incoming-missing-base-and-expansion-words-review.csv")
    lexical_families = read("incoming-lexical-base-families-review.csv")
    lexical_members = read("incoming-lexical-base-family-members-review.csv")
    assert len(manifest["skills"]) == 68
    assert len(dictionary) == 38 and len(members) == 175 and len(lessons) == 58 and len(redirects) == 8
    assert len(structure) == 38 and len(base_dependencies) == 5
    assert len(lexical_families) == len(lexical_members) == 38
    dictionary_fields = ["en_gb_pronunciation", "syllables", "stress_pattern", "has_schwa",
                         "frequency_band", "age_band", "complexity_band", "reviewed_definition",
                         "morphology_parts_json", "child_facing_word_sum",
                         "contextual_target_sentence", "dictation_sentence", "dictation_target_index",
                         "dictation_audio_text", "source_category", "source_name", "source_url_or_reference",
                         "source_licence", "source_importability_status", "source_legal_review_status",
                         "reviewed_by", "reviewed_at"]
    member_fields = ["reviewed_relation_kind", "intended_sense", "grammatical_role",
                     "target_sentence", "sense_source_reference", "reviewed_by", "approval_reference"]
    lesson_fields = ["teaching_explanation", "common_misconception",
                     "sentence_choice_items_reference", "reviewed_by", "approval_reference"]
    structure_fields = ["part_of_speech", "analysis_kind", "base_or_root", "base_part_of_speech",
                        "base_family_key", "word_sum", "morphology_parts_json",
                        "morphology_joins_json", "morphology_transformations_json",
                        "morphology_notes", "morphology_source_reference",
                        "child_friendly_meaning", "content_approval_reference"]
    blockers = {
        "dictionary": sorted(row["word"] for row in dictionary
                             if row["review_status"] != "approved_for_first_exposure"
                             or any(not row[field].strip() for field in dictionary_fields)),
        "contrastSets": sorted({row["set_key"] for row in members
                                if row["review_status"] != "approved"
                                or any(not row[field].strip() for field in member_fields)}),
        "canonicalStructure": sorted(row["word"] for row in structure
                                     if row["structure_review_status"] != "approved"
                                     or row["family_review_status"] != "approved"
                                     or any(not row[field].strip() for field in structure_fields)),
        "baseDependencies": sorted(row["word"] for row in base_dependencies
                                   if row["review_status"] != "approved_for_first_exposure"),
        "lexicalFamilies": sorted(row["base_family_key"] for row in lexical_families
                                  if row["structure_review_status"] != "approved"
                                  or not all(row[field].strip() for field in
                                             ("base_meaning", "reviewed_by", "approval_reference"))),
        "lexicalMemberships": sorted(row["word"] for row in lexical_members
                                     if row["structure_review_status"] != "approved"
                                     or not all(row[field].strip() for field in
                                                ("intended_meaning", "word_sum", "morphology_parts_json",
                                                 "reviewed_by", "approval_reference"))),
        "lessons": sorted(row["micro_skill_key"] for row in lessons
                          if row["review_status"] != "approved"
                          or any(not row[field].strip() for field in lesson_fields)),
        "redirects": sorted({row["source_skill_key"] for row in redirects
                             if row["intake_redirect_status"] != "approved"
                             or not row["reviewed_by"].strip() or not row["approval_reference"].strip()}),
    }
    print(json.dumps({"ready": not any(blockers.values()),
                      "blockerCounts": {key: len(value) for key, value in blockers.items()},
                      "blockers": blockers if args.release else {}}, indent=2))
    if args.release and any(blockers.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
