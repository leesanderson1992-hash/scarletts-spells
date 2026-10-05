#!/usr/bin/env python3
"""Build an editable -ing teaching-content template from canonical releases.

The export keeps every stored word, metadata, morphology, dictation, and
existing scoped-meaning field for canonical rows whose reviewed word sum
contains ``+ ing →``.  It deliberately leaves the new reusable -ing authoring
fields blank: completing them is a content-review task, not an inference.
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASES = ROOT / "docs/implementation/seed-data/teaching-dictionary/releases"
OUTPUT_DIR = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-10-03-ing-endings-template"
OUTPUT = OUTPUT_DIR / "ing-endings-teaching-dictionary-template.csv"

ING_WORD_SUM = re.compile(r"\+\s*ing\s*→", re.IGNORECASE)

WORD_FIELDS = [
    "word_key", "normalised_word", "display_word", "dialect_code", "frequency_band",
    "age_band", "complexity_band", "source_category", "source_name", "source_url",
    "source_licence", "source_use_note", "confidence", "review_status", "row_status",
]
METADATA_FIELDS = [
    "syllables", "phoneme_hint", "grapheme_notes", "stress_pattern", "has_schwa",
    "morphemes", "morphology_notes", "irregularity_notes", "source_category",
    "source_name", "source_url", "source_licence", "source_use_note", "confidence",
    "review_status",
]
MORPHOLOGY_FIELDS = [
    "raw_morpholex_segmentation", "raw_morpholex_pos", "morphology_parts", "feature_keys",
    "morphology_joins", "transformation_notes", "word_sum", "analysis_status",
    "source_category", "source_name", "source_url", "source_licence", "source_use_note",
    "confidence", "review_status", "reviewed_by", "reviewed_at", "review_notes",
]
DICTATION_FIELDS = [
    "display_word", "age_band", "complexity_band", "dictation_sentence",
    "dictation_target_token_index", "audio_text", "source_category", "source_name",
    "source_url", "source_licence", "source_use_note", "confidence", "review_status",
    "reviewed_by", "reviewed_at", "review_notes",
]
MEANING_FIELDS = [
    "micro_skill_key", "base_family_key", "member_role", "transformation",
    "child_friendly_meaning", "meaning_provenance", "source_row_sha256",
    "generator_sha256", "reviewed_by", "reviewed_at",
]
AUTHORING_FIELDS = [
    "ing_rule_key", "base_verb", "derived_ing_word", "child_friendly_definition",
    "definition_sense_note", "transformation_for_child", "eligible_for_ing_lesson",
    "authoring_review_status", "authoring_reviewed_by", "authoring_reviewed_at",
    "authoring_notes",
]


def read_csv(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        return {row["word_key"]: row for row in csv.DictReader(handle)}


def prefix(row: dict[str, str], fields: list[str], namespace: str) -> dict[str, str]:
    return {f"{namespace}_{field}": row.get(field, "") for field in fields}


def base_from_word_sum(word_sum: str) -> str:
    return word_sum.split("+", 1)[0].strip() if "+" in word_sum else ""


def main() -> None:
    # Later release paths win when a word occurs in more than one release.
    selected: dict[str, tuple[Path, dict[str, str]]] = {}
    occurrences: defaultdict[str, list[str]] = defaultdict(list)
    for morphology_path in sorted(RELEASES.glob("*/package/canonical_word_morphology.csv")):
        with morphology_path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                if ING_WORD_SUM.search(row.get("word_sum", "")):
                    key = row["word_key"]
                    selected[key] = (morphology_path.parent, row)
                    occurrences[key].append(str(morphology_path.parent.relative_to(ROOT)))

    meaning_rows: dict[str, dict[str, str]] = {}
    for meaning_path in sorted(RELEASES.glob("*/audit/family-meaning-audit.csv")):
        meaning_rows.update(read_csv(meaning_path))

    rows: list[dict[str, str]] = []
    for key, (package, morphology) in sorted(selected.items(), key=lambda item: item[1][1]["word_sum"].casefold()):
        words = read_csv(package / "canonical_words.csv")
        metadata = read_csv(package / "canonical_word_metadata.csv")
        dictation = read_csv(package / "dictation_sentences.csv")
        word = words.get(key, {})
        row: dict[str, str] = {
            "source_release_package": str(package.relative_to(ROOT)),
            "all_matching_release_packages": " | ".join(occurrences[key]),
            "system_detected_match": "word_sum contains '+ ing →'",
            "system_detected_base_verb": base_from_word_sum(morphology.get("word_sum", "")),
        }
        row.update(prefix(word, WORD_FIELDS, "word"))
        row.update(prefix(metadata.get(key, {}), METADATA_FIELDS, "metadata"))
        row.update(prefix(morphology, MORPHOLOGY_FIELDS, "morphology"))
        row.update(prefix(dictation.get(key, {}), DICTATION_FIELDS, "dictation"))
        row.update(prefix(meaning_rows.get(key, {}), MEANING_FIELDS, "existing_scoped_meaning"))
        row.update({field: "" for field in AUTHORING_FIELDS})
        rows.append(row)

    fieldnames = (
        ["source_release_package", "all_matching_release_packages", "system_detected_match", "system_detected_base_verb"]
        + [f"word_{field}" for field in WORD_FIELDS]
        + [f"metadata_{field}" for field in METADATA_FIELDS]
        + [f"morphology_{field}" for field in MORPHOLOGY_FIELDS]
        + [f"dictation_{field}" for field in DICTATION_FIELDS]
        + [f"existing_scoped_meaning_{field}" for field in MEANING_FIELDS]
        + AUTHORING_FIELDS
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} unique -ing word-sum rows to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
