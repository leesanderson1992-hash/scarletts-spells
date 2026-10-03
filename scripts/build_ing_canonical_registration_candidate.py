#!/usr/bin/env python3
"""Create canonical-word registration CSVs from approved -ing content.

The default output remains a review candidate. Supplying the content-owner
approval fields produces a release-ready package. Neither mode creates a
resolver mapping, learner item, assignment, or route release.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


WORD_HEADERS = [
    "word_key", "normalised_word", "display_word", "dialect_code", "frequency_band",
    "age_band", "complexity_band", "source_category", "source_name", "source_url",
    "source_licence", "source_use_note", "confidence", "review_status", "row_status",
]
METADATA_HEADERS = [
    "word_key", "syllables", "phoneme_hint", "grapheme_notes", "stress_pattern", "has_schwa",
    "morphemes", "morphology_notes", "irregularity_notes", "source_category", "source_name",
    "source_url", "source_licence", "source_use_note", "confidence", "review_status",
]
MORPHOLOGY_HEADERS = [
    "word_key", "raw_morpholex_segmentation", "raw_morpholex_pos", "morphology_parts", "feature_keys",
    "morphology_joins", "transformation_notes", "word_sum", "analysis_status", "source_category",
    "source_name", "source_url", "source_licence", "source_use_note", "confidence", "review_status",
    "reviewed_by", "reviewed_at", "review_notes",
]
DICTATION_HEADERS = [
    "word_key", "display_word", "age_band", "complexity_band", "dictation_sentence",
    "dictation_target_token_index", "audio_text", "source_category", "source_name", "source_url",
    "source_licence", "source_use_note", "confidence", "review_status", "reviewed_by", "reviewed_at",
    "review_notes",
]
SOURCE_HEADERS = [
    "source_key", "source_category", "source_name", "source_url", "source_licence", "source_use_note",
    "importability_status", "legal_review_status",
]


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def band(zipf: float) -> str:
    return "high" if zipf >= 4 else "medium" if zipf >= 3 else "low"


def age_band(value: str) -> str:
    try:
        age = float(value)
    except ValueError:
        return "in_review"
    if age <= 7:
        return "early_primary"
    if age <= 9:
        return "middle_primary"
    if age <= 11:
        return "upper_primary"
    return "lower_secondary"


def complexity(word: str, syllables: str, morph_count: str) -> str:
    try:
        score = len(word) + int(syllables) * 2 + int(morph_count or "1")
    except ValueError:
        return "in_review"
    return "low" if score <= 9 else "medium" if score <= 15 else "high"


def target_index(sentence: str, word: str) -> int:
    tokens = [token.strip(".,!?;:'\"()[]{}").lower() for token in sentence.split()]
    return tokens.index(word.lower())


# The raw source lexicon did not contain en-GB IPA for these three spellings.
# These reviewed entries keep the release package complete without changing the
# supplied child-facing word, definition, sentence, or spelling transformation.
REVIEWED_EN_GB_PRONUNCIATION = {
    "reading_en_gb": {"ipa": "/rˈiːdɪŋ/"},
    "putting_en_gb": {"ipa": "/pˈʊtɪŋ/"},
    "untying_en_gb": {"stress_pattern": "unstressed-primary", "has_schwa": "FALSE"},
    "retying_en_gb": {"ipa": "/ˌriːˈtaɪɪŋ/", "syllables": "3", "stress_pattern": "secondary-primary-unstressed", "has_schwa": "FALSE"},
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--enriched", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--approved-by")
    parser.add_argument("--approved-at")
    args = parser.parse_args()
    if bool(args.approved_by) != bool(args.approved_at):
        raise SystemExit("--approved-by and --approved-at must be supplied together.")
    approved = bool(args.approved_by)
    review_status = "approved_for_first_exposure" if approved else "in_review"
    row_status = "active" if approved else "draft"
    approval_note = (
        "Approved word, child-friendly definition, dictation, pronunciation, and inflection analysis supplied or approved by the content owner."
        if approved
        else "Approved word, child-friendly definition and dictation supplied by the content owner; lexical enrichment remains queued for named factual review."
    )

    with args.enriched.open(encoding="utf-8", newline="") as handle:
        source_rows = list(csv.DictReader(handle))
    rows = [row for row in source_rows if not row["existing_canonical_word_key"]]
    if len(rows) != 50:
        raise SystemExit(f"Expected 50 unregistered words, found {len(rows)}.")

    words: list[dict[str, str]] = []
    metadata: list[dict[str, str]] = []
    morphology: list[dict[str, str]] = []
    dictations: list[dict[str, str]] = []
    for row in rows:
        word = row["display_word"]
        pronunciation = REVIEWED_EN_GB_PRONUNCIATION.get(row["word_key"], {})
        age = age_band(row["target_aoa_median"])
        complexity_band = complexity(word, row["target_syllables_candidate"], row["target_morpholex_nmorph"])
        common = {
            "source_category": "internal_authored",
            "source_name": "Approved -ing spelling words sheet",
            "source_url": "local:ing_spelling_words.csv",
            "source_licence": "internal/project-authored",
            "source_use_note": approval_note,
            "confidence": "high",
            "review_status": review_status,
        }
        words.append({
            "word_key": row["word_key"], "normalised_word": word, "display_word": word,
            "dialect_code": "en-GB", "frequency_band": band(float(row["target_wordfreq_zipf"])),
            "age_band": age, "complexity_band": complexity_band, **common, "row_status": row_status,
        })
        metadata.append({
            "word_key": row["word_key"], "syllables": pronunciation.get("syllables", row["target_syllables_candidate"]),
            "phoneme_hint": row["target_british_ipa"] or pronunciation.get("ipa", ""), "grapheme_notes": "",
            "stress_pattern": pronunciation.get("stress_pattern", row["target_stress_pattern_candidate"]), "has_schwa": pronunciation.get("has_schwa", row["target_has_schwa_candidate"]),
            "morphemes": row["target_morpholex_segmentation"],
            "morphology_notes": "Reviewed inflection analysis supported by MorphoLex-en lexical evidence." if approved else "Lexical candidate evidence from MorphoLex-en; review the child-facing inflection analysis below.",
            "irregularity_notes": "", **common,
        })
        parts = [{"text": row["proposed_base_verb"], "type": "base"}, {"text": "ing", "type": "suffix"}]
        morphology.append({
            "word_key": row["word_key"], "raw_morpholex_segmentation": row["target_morpholex_segmentation"],
            "raw_morpholex_pos": row["target_morpholex_pos"], "morphology_parts": json.dumps(parts),
            "feature_keys": json.dumps(["BASE", "SUFFIX"]), "morphology_joins": json.dumps(["plus"]),
            "transformation_notes": row["proposed_transformation_note"], "word_sum": row["proposed_word_sum"],
            "analysis_status": "approved" if approved else "in_review", "source_category": "open_licensed", "source_name": "MorphoLex-en and approved -ing spelling words sheet",
            "source_url": "https://github.com/hugomailhot/MorphoLex-en", "source_licence": "CC BY-NC-SA 4.0; internal/project-authored",
            "source_use_note": "MorphoLex is source evidence. The content owner approved the child-facing word sum and rule." if approved else "MorphoLex is source evidence only. The approved sheet provides the intended word; a named reviewer must approve the child-facing word sum and rule.",
            "confidence": "high", "review_status": review_status, "reviewed_by": args.approved_by or "", "reviewed_at": args.approved_at or "", "review_notes": "Content-owner approved." if approved else "",
        })
        sentence = row["provided_simple_dictation_sentence"]
        dictations.append({
            "word_key": row["word_key"], "display_word": word, "age_band": age, "complexity_band": complexity_band,
            "dictation_sentence": sentence, "dictation_target_token_index": str(target_index(sentence, word)), "audio_text": sentence.replace("retying", "re-tying") if word == "retying" else sentence,
            **common, "reviewed_by": args.approved_by or "", "reviewed_at": args.approved_at or "", "review_notes": "Content-owner approved." if approved else "Approved source sheet; add named release review before publication.",
        })

    write_csv(args.output / "canonical_words.csv", WORD_HEADERS, words)
    write_csv(args.output / "canonical_word_metadata.csv", METADATA_HEADERS, metadata)
    write_csv(args.output / "canonical_word_morphology.csv", MORPHOLOGY_HEADERS, morphology)
    write_csv(args.output / "dictation_sentences.csv", DICTATION_HEADERS, dictations)
    write_csv(args.output / "teaching_content_sources.csv", SOURCE_HEADERS, [{
        "source_key": "approved_ing_spelling_words_2026_10_03", "source_category": "internal_authored",
        "source_name": "Approved -ing spelling words sheet", "source_url": "local:ing_spelling_words.csv",
        "source_licence": "internal/project-authored", "source_use_note": "Approved child-facing definitions, dictation sentences, and inflection facts supplied or approved by the content owner." if approved else "Approved child-facing definitions and dictation sentences supplied by the content owner.",
        "importability_status": "importable", "legal_review_status": "not_required",
    }])
    print(json.dumps({"status": "release_ready_created" if approved else "candidate_created", "words": len(rows), "output": str(args.output)}, indent=2))


if __name__ == "__main__":
    main()
