#!/usr/bin/env python3
"""Populate canonical pronunciation metadata from approved lexicon intake rows.

This script updates only the candidate CSV folder. It does not import data,
touch Supabase, mutate schema, or change runtime behavior.
"""

from __future__ import annotations

import csv
import json
import shutil
from collections import Counter
from datetime import date
from pathlib import Path


BASE = Path(__file__).resolve().parent
CSV_DIR = BASE / "csv"

METADATA_PATH = CSV_DIR / "canonical_word_metadata.csv"
WORDS_PATH = CSV_DIR / "canonical_words.csv"
SOURCES_PATH = CSV_DIR / "teaching_content_sources.csv"
BRITISH_IPA_PATH = BASE / "british_ipa_metadata_intake_all_canonical_words.csv"
CMUDICT_PATH = BASE / "lexicon_metadata_intake_all_canonical_words.csv"

BEFORE_PATH = BASE / "canonical_word_metadata_before_lexicon_population.csv"
AUDIT_PATH = BASE / "canonical_word_metadata_lexicon_population_audit.csv"
SUMMARY_PATH = BASE / "canonical_word_metadata_lexicon_population_summary.json"

IPA_SOURCE_KEY = "open_dict_data_ipa_dict_en_uk_2026_07_01"
IPA_SOURCE_NAME = "open-dict-data ipa-dict en_UK"
IPA_SOURCE_URL = "https://github.com/open-dict-data/ipa-dict/blob/master/data/en_UK.txt"
IPA_SOURCE_LICENCE = "MIT repository; English UK data credited to ipacards under GPL 3.0"
IPA_SOURCE_NOTE = (
    "British English Received Pronunciation IPA candidate metadata. Project "
    "legal/importability review passed for this candidate metadata use."
)

CMU_SOURCE_NAME = "CMU Pronouncing Dictionary"
CMU_SOURCE_URL = "https://github.com/cmusphinx/cmudict"
CMU_SOURCE_LICENCE = "CMUdict BSD-style permissive licence"
CMU_SOURCE_NOTE = (
    "CMUdict fallback pronunciation metadata used only where no exact British "
    "IPA row exists. Project legal/importability review passed for this fallback "
    "candidate metadata use; no import performed by this pass."
)

PRONUNCIATION_FIELDS = ["syllables", "phoneme_hint", "stress_pattern", "has_schwa"]
PRESERVED_FIELDS = ["grapheme_notes", "morphemes", "morphology_notes", "irregularity_notes"]


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def update_lexicon_source_registers() -> None:
    fieldnames, rows = read_csv(SOURCES_PATH)
    replacements = {
        IPA_SOURCE_KEY: {
            "source_key": IPA_SOURCE_KEY,
            "source_category": "open_licensed",
            "source_name": IPA_SOURCE_NAME,
            "source_url": IPA_SOURCE_URL,
            "source_licence": IPA_SOURCE_LICENCE,
            "source_use_note": IPA_SOURCE_NOTE,
            "importability_status": "importable",
            "legal_review_status": "passed",
        },
        "cmu_pronouncing_dictionary_reference_2026_07_01": {
            "source_key": "cmu_pronouncing_dictionary_reference_2026_07_01",
            "source_category": "open_licensed",
            "source_name": CMU_SOURCE_NAME,
            "source_url": CMU_SOURCE_URL,
            "source_licence": CMU_SOURCE_LICENCE,
            "source_use_note": CMU_SOURCE_NOTE,
            "importability_status": "importable",
            "legal_review_status": "passed",
        },
    }
    rows = [row for row in rows if row.get("source_key") not in replacements]
    rows.extend(replacements.values())
    write_csv(SOURCES_PATH, fieldnames, rows)


def selected_source(ipa: dict[str, str] | None, cmu: dict[str, str] | None) -> dict[str, str]:
    if ipa and ipa.get("ipa_selected_for_comparison"):
        return {
            "selected_source": "british_ipa",
            "selection_reason": "Exact British IPA row exists; British IPA is approved primary pronunciation source.",
            "syllables": ipa.get("ipa_syllables", ""),
            "phoneme_hint": ipa.get("ipa_selected_for_comparison", ""),
            "stress_pattern": ipa.get("ipa_stress_pattern", ""),
            "has_schwa": ipa.get("ipa_has_schwa", ""),
            "source_category": "open_licensed",
            "source_name": IPA_SOURCE_NAME,
            "source_url": IPA_SOURCE_URL,
            "source_licence": IPA_SOURCE_LICENCE,
            "source_use_note": (
                "British IPA is the approved primary source for pronunciation metadata. "
                "CMUdict comparison is retained in the audit artifact where available. "
                "Candidate CSV only; no import performed by this pass."
            ),
            "confidence": "medium",
        }

    if cmu and cmu.get("lexicon_match_status") == "matched" and cmu.get("phoneme_hint"):
        return {
            "selected_source": "cmudict_fallback",
            "selection_reason": "No exact British IPA row exists; CMUdict fallback is approved for this candidate pass.",
            "syllables": cmu.get("syllables", ""),
            "phoneme_hint": cmu.get("phoneme_hint", ""),
            "stress_pattern": cmu.get("stress_pattern", ""),
            "has_schwa": cmu.get("has_schwa", ""),
            "source_category": "open_licensed",
            "source_name": CMU_SOURCE_NAME,
            "source_url": CMU_SOURCE_URL,
            "source_licence": CMU_SOURCE_LICENCE,
            "source_use_note": CMU_SOURCE_NOTE,
            "confidence": "low",
        }

    return {
        "selected_source": "none",
        "selection_reason": "No British IPA row and no CMUdict fallback row.",
        "syllables": "",
        "phoneme_hint": "",
        "stress_pattern": "",
        "has_schwa": "",
        "source_category": "",
        "source_name": "",
        "source_url": "",
        "source_licence": "",
        "source_use_note": "",
        "confidence": "",
    }


def main() -> None:
    metadata_fields, metadata_rows = read_csv(METADATA_PATH)
    word_fields, word_rows = read_csv(WORDS_PATH)
    _ipa_fields, ipa_rows = read_csv(BRITISH_IPA_PATH)
    _cmu_fields, cmu_rows = read_csv(CMUDICT_PATH)

    if [row["word_key"] for row in metadata_rows] != [row["word_key"] for row in word_rows]:
        raise SystemExit("canonical_word_metadata.csv row order does not match canonical_words.csv")

    ipa_by_key = {row["word_key"]: row for row in ipa_rows}
    cmu_by_key = {row["word_key"]: row for row in cmu_rows}

    if len(metadata_rows) != 874 or len({row["word_key"] for row in metadata_rows}) != 874:
        raise SystemExit("Expected 874 unique canonical metadata rows")

    if not BEFORE_PATH.exists():
        shutil.copyfile(METADATA_PATH, BEFORE_PATH)
    update_lexicon_source_registers()

    audit_rows: list[dict[str, str]] = []
    source_counts: Counter[str] = Counter()
    confidence_counts: Counter[str] = Counter()
    filled_field_counts: Counter[str] = Counter()
    morphology_changed = 0
    unpopulated_rows: list[str] = []

    for row in metadata_rows:
        word_key = row["word_key"]
        before = dict(row)
        selected = selected_source(ipa_by_key.get(word_key), cmu_by_key.get(word_key))
        source_counts[selected["selected_source"]] += 1

        if selected["selected_source"] != "none":
            for field in PRONUNCIATION_FIELDS:
                row[field] = selected[field]
                if row[field]:
                    filled_field_counts[field] += 1
            row["source_category"] = selected["source_category"]
            row["source_name"] = selected["source_name"]
            row["source_url"] = selected["source_url"]
            row["source_licence"] = selected["source_licence"]
            row["source_use_note"] = selected["source_use_note"]
            row["confidence"] = selected["confidence"]
            row["review_status"] = "approved_for_first_exposure"
        else:
            unpopulated_rows.append(word_key)

        for field in PRESERVED_FIELDS:
            if row[field] != before[field]:
                morphology_changed += 1

        confidence_counts[row.get("confidence", "")] += 1
        audit = {
            "word_key": word_key,
            "selected_source": selected["selected_source"],
            "selection_reason": selected["selection_reason"],
            "before_syllables": before.get("syllables", ""),
            "after_syllables": row.get("syllables", ""),
            "before_phoneme_hint": before.get("phoneme_hint", ""),
            "after_phoneme_hint": row.get("phoneme_hint", ""),
            "before_stress_pattern": before.get("stress_pattern", ""),
            "after_stress_pattern": row.get("stress_pattern", ""),
            "before_has_schwa": before.get("has_schwa", ""),
            "after_has_schwa": row.get("has_schwa", ""),
            "before_grapheme_notes": before.get("grapheme_notes", ""),
            "after_grapheme_notes": row.get("grapheme_notes", ""),
            "before_morphemes": before.get("morphemes", ""),
            "after_morphemes": row.get("morphemes", ""),
            "before_morphology_notes": before.get("morphology_notes", ""),
            "after_morphology_notes": row.get("morphology_notes", ""),
            "before_irregularity_notes": before.get("irregularity_notes", ""),
            "after_irregularity_notes": row.get("irregularity_notes", ""),
            "before_source_name": before.get("source_name", ""),
            "after_source_name": row.get("source_name", ""),
            "before_confidence": before.get("confidence", ""),
            "after_confidence": row.get("confidence", ""),
            "before_review_status": before.get("review_status", ""),
            "after_review_status": row.get("review_status", ""),
            "morphology_changed": "FALSE"
            if all(row[field] == before[field] for field in PRESERVED_FIELDS)
            else "TRUE",
        }
        audit_rows.append(audit)

    if morphology_changed:
        raise SystemExit(f"Unexpected preserved metadata field changes: {morphology_changed}")

    write_csv(METADATA_PATH, metadata_fields, metadata_rows)
    write_csv(AUDIT_PATH, list(audit_rows[0].keys()), audit_rows)

    summary = {
        "generated_at": date.today().isoformat(),
        "active_metadata_file": str(METADATA_PATH.relative_to(Path.cwd())),
        "before_snapshot": str(BEFORE_PATH.relative_to(Path.cwd())),
        "audit_file": str(AUDIT_PATH.relative_to(Path.cwd())),
        "rows": len(metadata_rows),
        "unique_word_keys": len({row["word_key"] for row in metadata_rows}),
        "row_order_matches_canonical_words": True,
        "selected_source_counts": dict(source_counts),
        "confidence_counts": dict(confidence_counts),
        "filled_field_counts": dict(filled_field_counts),
        "unpopulated_rows": unpopulated_rows,
        "morphology_changed_count": morphology_changed,
        "review_status_set": "approved_for_first_exposure",
        "british_ipa_source_importability_status": "importable",
        "british_ipa_source_legal_review_status": "passed",
        "cmudict_source_importability_status": "importable",
        "cmudict_source_legal_review_status": "passed",
        "morphology_scope": "preserved unchanged; separate later pass",
        "hard_boundaries": [
            "no Supabase import",
            "no database mutation",
            "no migrations",
            "no importer changes",
            "no runtime hooks",
            "no resolver changes",
            "no assignment changes",
            "no evidence/proficiency changes",
            "no Word Treasure changes",
        ],
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
