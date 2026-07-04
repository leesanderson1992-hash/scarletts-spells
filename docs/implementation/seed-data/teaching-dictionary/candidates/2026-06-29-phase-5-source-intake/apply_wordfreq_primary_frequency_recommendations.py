#!/usr/bin/env python3
"""Make wordfreq the primary frequency recommendation source.

This script is audit-only. It reads the existing BNC frequency intake,
SUBTLEX/wordfreq comparison, AoA intake, and canonical words, then rewrites the
frequency/AoA recommendation artifact so `wordfreq` is the primary frequency
signal and BNC is fallback evidence. It does not update canonical_words.csv,
import data, touch Supabase, or change runtime behavior.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path


BASE = Path(__file__).resolve().parent
CSV_DIR = BASE / "csv"

WORDS_PATH = CSV_DIR / "canonical_words.csv"
BNC_INTAKE_PATH = BASE / "british_frequency_intake_all_canonical_words.csv"
COMPARISON_PATH = BASE / "bnc_subtlex_uk_frequency_comparison_all_canonical_words.csv"
AOA_INTAKE_PATH = BASE / "aoa_intake_all_canonical_words.csv"
RECOMMENDATIONS_PATH = BASE / "canonical_words_frequency_aoa_band_recommendations.csv"
WORDFREQ_INTAKE_PATH = BASE / "wordfreq_frequency_intake_all_canonical_words.csv"
SUMMARY_PATH = BASE / "frequency_priority_wordfreq_update_summary.json"
FREQUENCY_AOA_SUMMARY_PATH = BASE / "frequency_aoa_band_audit_summary.json"
BUILD_SUMMARY_PATH = BASE / "build_summary.json"


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_by_key(path: Path) -> dict[str, dict[str, str]]:
    _fields, rows = read_csv(path)
    return {row["word_key"]: row for row in rows}


def choose_frequency(comparison: dict[str, str]) -> tuple[str, str, str, str, str]:
    wordfreq_band = comparison.get("wordfreq_proposed_frequency_band", "")
    bnc_band = comparison.get("bnc_proposed_frequency_band", "")
    if wordfreq_band:
        return (
            wordfreq_band,
            "wordfreq",
            comparison.get("wordfreq_match_status", ""),
            f"wordfreq zipf={comparison.get('wordfreq_zipf', '')}",
            "wordfreq primary; BNC retained as fallback/comparison evidence.",
        )
    if bnc_band:
        return (
            bnc_band,
            "bnc_fallback",
            comparison.get("bnc_match_status", ""),
            (
                "BNC frequency="
                f"{comparison.get('bnc_raw_frequency_per_million', '')}; "
                f"rank={comparison.get('bnc_frequency_rank', '')}"
            ),
            "wordfreq unavailable; BNC fallback recommendation.",
        )
    return (
        "",
        "no_frequency_evidence",
        "",
        "",
        "No wordfreq or BNC frequency band available; keep active frequency_band unchanged.",
    )


def update_json(path: Path, updates: dict[str, object]) -> None:
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    data.update(updates)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    _word_fields, word_rows = read_csv(WORDS_PATH)
    if len(word_rows) != 874 or len({row["word_key"] for row in word_rows}) != 874:
        raise SystemExit("Expected 874 unique canonical word rows")

    bnc_by_key = load_by_key(BNC_INTAKE_PATH)
    comparison_by_key = load_by_key(COMPARISON_PATH)
    aoa_by_key = load_by_key(AOA_INTAKE_PATH)
    expected_keys = [row["word_key"] for row in word_rows]
    for label, lookup in [
        ("BNC intake", bnc_by_key),
        ("frequency comparison", comparison_by_key),
        ("AoA intake", aoa_by_key),
    ]:
        if expected_keys != list(lookup.keys()):
            raise SystemExit(f"{label} row order does not match canonical_words.csv")

    wordfreq_rows: list[dict[str, str]] = []
    recommendation_rows: list[dict[str, str]] = []
    primary_counts: Counter[str] = Counter()
    recommended_band_counts: Counter[str] = Counter()
    bnc_fallback_counts: Counter[str] = Counter()

    for word_row in word_rows:
        key = word_row["word_key"]
        comparison = comparison_by_key[key]
        bnc = bnc_by_key[key]
        aoa = aoa_by_key[key]
        (
            recommended_frequency_band,
            source_used,
            match_status,
            evidence,
            review_note,
        ) = choose_frequency(comparison)

        primary_counts[source_used] += 1
        recommended_band_counts[recommended_frequency_band or "blank"] += 1
        if source_used == "bnc_fallback":
            bnc_fallback_counts[bnc.get("match_status", "")] += 1

        wordfreq_rows.append(
            {
                "word_key": key,
                "normalised_word": word_row["normalised_word"],
                "display_word": word_row["display_word"],
                "dialect_code": word_row["dialect_code"],
                "source_category": "open_licensed",
                "source_name": comparison.get("wordfreq_source_name", "wordfreq Python package"),
                "source_url": comparison.get("wordfreq_source_url", "https://github.com/rspeer/wordfreq/"),
                "source_licence": (
                    "Apache-2.0 package licence; underlying data-source "
                    "importability requires review"
                ),
                "source_use_note": (
                    "Primary frequency audit signal. BNC remains fallback/"
                    "comparison evidence. Active canonical_words.csv "
                    "frequency_band values are not updated by this pass."
                ),
                "source_data_status": comparison.get("wordfreq_source_data_status", ""),
                "match_status": comparison.get("wordfreq_match_status", ""),
                "matched_form": comparison.get("wordfreq_matched_form", ""),
                "zipf_frequency": comparison.get("wordfreq_zipf", ""),
                "current_frequency_band": word_row["frequency_band"],
                "proposed_frequency_band": comparison.get("wordfreq_proposed_frequency_band", ""),
                "bnc_fallback_match_status": bnc.get("match_status", ""),
                "bnc_fallback_proposed_frequency_band": bnc.get("proposed_frequency_band", ""),
                "review_status": "in_review",
                "review_notes": (
                    "wordfreq primary audit evidence; review legal/importability "
                    "and pedagogy before active band update."
                ),
            }
        )

        recommendation_rows.append(
            {
                "word_key": key,
                "normalised_word": word_row["normalised_word"],
                "display_word": word_row["display_word"],
                "dialect_code": word_row["dialect_code"],
                "current_frequency_band": word_row["frequency_band"],
                "recommended_frequency_band": recommended_frequency_band,
                "frequency_primary_source": "wordfreq",
                "frequency_source_used": source_used,
                "frequency_match_status": match_status,
                "frequency_evidence": evidence,
                "bnc_fallback_match_status": bnc.get("match_status", ""),
                "bnc_fallback_evidence": (
                    ""
                    if not bnc.get("proposed_frequency_band")
                    else (
                        "BNC frequency="
                        f"{bnc.get('raw_frequency_per_million', '')}; "
                        f"rank={bnc.get('frequency_rank', '')}; "
                        f"band={bnc.get('proposed_frequency_band', '')}"
                    )
                ),
                "bnc_wordfreq_band_comparison_status": comparison.get("band_comparison_status", ""),
                "current_age_band": word_row["age_band"],
                "recommended_age_band": aoa.get("proposed_age_band", ""),
                "aoa_evidence_status": aoa.get("source_data_status", ""),
                "recommendation_status": (
                    "frequency_ready_aoa_pending"
                    if recommended_frequency_band and not aoa.get("proposed_age_band", "")
                    else "frequency_and_aoa_ready"
                    if recommended_frequency_band and aoa.get("proposed_age_band", "")
                    else "needs_source_review"
                ),
                "review_notes": (
                    f"{review_note} Audit recommendation only; do not update "
                    "active canonical_words.csv until reviewed."
                ),
            }
        )

    write_csv(WORDFREQ_INTAKE_PATH, list(wordfreq_rows[0].keys()), wordfreq_rows)
    write_csv(RECOMMENDATIONS_PATH, list(recommendation_rows[0].keys()), recommendation_rows)

    summary = {
        "generated_at": date.today().isoformat(),
        "rows": len(word_rows),
        "unique_word_keys": len({row["word_key"] for row in word_rows}),
        "row_order_matches_canonical_words": True,
        "active_canonical_words_updated": False,
        "primary_frequency_source": "wordfreq",
        "fallback_frequency_source": "bnc",
        "wordfreq_intake_file": str(WORDFREQ_INTAKE_PATH.relative_to(Path.cwd())),
        "recommendations_file": str(RECOMMENDATIONS_PATH.relative_to(Path.cwd())),
        "frequency_source_used_counts": dict(primary_counts),
        "recommended_frequency_band_counts": dict(recommended_band_counts),
        "bnc_fallback_used_counts": dict(bnc_fallback_counts),
        "hard_boundaries": [
            "no canonical_words.csv band update",
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
    update_json(
        FREQUENCY_AOA_SUMMARY_PATH,
        {
            "primary_frequency_source": "wordfreq",
            "fallback_frequency_source": "bnc",
            "wordfreq_primary_update_summary": str(SUMMARY_PATH.relative_to(Path.cwd())),
            "wordfreq_intake_file": str(WORDFREQ_INTAKE_PATH.relative_to(Path.cwd())),
            "recommended_frequency_band_counts": dict(recommended_band_counts),
            "frequency_source_used_counts": dict(primary_counts),
            "active_canonical_words_updated": False,
        },
    )
    update_json(
        BUILD_SUMMARY_PATH,
        {
            "frequency_primary_source": "wordfreq",
            "frequency_fallback_source": "bnc",
            "wordfreq_frequency_intake_rows": len(wordfreq_rows),
            "canonical_words_frequency_aoa_recommendation_rows": len(recommendation_rows),
            "canonical_words_frequency_band_values_unchanged": True,
            "wordfreq_primary_recommended_frequency_band_counts": dict(recommended_band_counts),
        },
    )
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
