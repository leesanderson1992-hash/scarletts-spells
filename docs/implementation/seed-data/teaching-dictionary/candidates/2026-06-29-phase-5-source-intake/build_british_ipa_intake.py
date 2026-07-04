#!/usr/bin/env python3
"""Build British IPA pronunciation metadata intake artifacts.

This is candidate evidence only. It does not mutate active canonical metadata.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path


BASE = Path(__file__).resolve().parent
CSV_DIR = BASE / "csv"
LEXICON_DIR = Path(".tmp/lexicon")
IPA_PATH = LEXICON_DIR / "ipa-dict-en_UK.txt"

IPA_SOURCE_KEY = "open_dict_data_ipa_dict_en_uk_2026_07_01"
IPA_SOURCE_NAME = "open-dict-data ipa-dict en_UK"
IPA_SOURCE_URL = "https://github.com/open-dict-data/ipa-dict/blob/master/data/en_UK.txt"
IPA_SOURCE_LICENCE = "MIT repository; English UK data credited to ipacards under GPL 3.0"
IPA_SOURCE_NOTE = (
    "British English Received Pronunciation IPA candidate metadata. Project "
    "legal/importability review passed for this candidate metadata use."
)

VOWELS = set("aeiouɑɒæɐəɜɞʌɔɪʊɛɚɝɨʉɯɵøœɘɤɶ")
IPA_CLEAN_RE = re.compile(r"[\/\[\]\(\)]")


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def normalise_lookup(value: str) -> str:
    return value.strip().lower().replace(" ", "-")


def parse_ipa_dict(path: Path) -> dict[str, list[str]]:
    entries: dict[str, list[str]] = defaultdict(list)
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or "\t" not in line:
                continue
            word, ipa = line.split("\t", 1)
            word = normalise_lookup(word)
            ipa = ipa.strip()
            if ipa and ipa not in entries[word]:
                entries[word].append(ipa)
    return dict(entries)


def strip_ipa(ipa: str) -> str:
    return IPA_CLEAN_RE.sub("", ipa).replace("ː", "").replace("ˑ", "")


def vowel_groups(ipa: str) -> list[tuple[int, int, str]]:
    clean = strip_ipa(ipa)
    groups: list[tuple[int, int, str]] = []
    start = None
    chars: list[str] = []
    for idx, ch in enumerate(clean):
        if ch in VOWELS:
            if start is None:
                start = idx
                chars = [ch]
            else:
                chars.append(ch)
        else:
            if start is not None:
                groups.append((start, idx - 1, "".join(chars)))
                start = None
                chars = []
    if start is not None:
        groups.append((start, len(clean) - 1, "".join(chars)))
    return groups


def ipa_syllables(ipa: str) -> int:
    return max(1, len(vowel_groups(ipa))) if ipa else 0


def marker_to_syllable_index(ipa: str, marker: str) -> int:
    clean = strip_ipa(ipa)
    marker_idx = clean.find(marker)
    if marker_idx < 0:
        return 0
    for syllable_idx, (start, _end, _text) in enumerate(vowel_groups(ipa), start=1):
        if start > marker_idx:
            return syllable_idx
    return 0


def ipa_primary_stress(ipa: str) -> int:
    return marker_to_syllable_index(ipa, "ˈ")


def ipa_stress_pattern(ipa: str) -> str:
    syllables = ipa_syllables(ipa)
    if not ipa:
        return ""
    primary = ipa_primary_stress(ipa)
    secondary = marker_to_syllable_index(ipa, "ˌ")
    if syllables == 1:
        return "primary" if primary else "single_syllable_unmarked"
    parts = []
    for idx in range(1, syllables + 1):
        if idx == primary:
            parts.append("primary")
        elif idx == secondary:
            parts.append("secondary")
        else:
            parts.append("unstressed")
    return "-".join(parts)


def ipa_has_schwa(ipa: str) -> bool:
    # The en_UK source uses /ɐ/ for many weak British vowels. Treat it as
    # schwa-like evidence for this review artifact, but keep the raw symbols.
    return "ə" in ipa or "ɐ" in ipa


def ipa_schwa_symbols(ipa: str) -> str:
    symbols = []
    if "ə" in ipa:
        symbols.append("ə")
    if "ɐ" in ipa:
        symbols.append("ɐ")
    return " ".join(symbols)


CMU_PHONE_RE = re.compile(r"[A-Z]+([012])")


def cmu_primary_stress(phoneme_hint: str) -> int:
    idx = 0
    for token in phoneme_hint.split():
        match = CMU_PHONE_RE.match(token)
        if not match:
            continue
        idx += 1
        if match.group(1) == "1":
            return idx
    return 0


def bool_string(value: bool) -> str:
    return "TRUE" if value else "FALSE"


def agreement(left: str, right: str, na_label: str = "unknown") -> str:
    if left == "" or right == "":
        return na_label
    return "agree" if left == right else "disagree"


def build_blocking_index(priority_rows: list[dict[str, str]]) -> set[str]:
    return {row["word_key"] for row in priority_rows}


def source_register_row() -> dict[str, str]:
    return {
        "source_key": IPA_SOURCE_KEY,
        "source_category": "open_licensed",
        "source_name": IPA_SOURCE_NAME,
        "source_url": IPA_SOURCE_URL,
        "source_licence": IPA_SOURCE_LICENCE,
        "source_use_note": IPA_SOURCE_NOTE,
        "importability_status": "importable",
        "legal_review_status": "passed",
    }


def update_source_register() -> None:
    path = CSV_DIR / "teaching_content_sources.csv"
    rows = read_csv(path)
    fieldnames = list(rows[0].keys()) if rows else list(source_register_row().keys())
    rows = [row for row in rows if row.get("source_key") != IPA_SOURCE_KEY]
    rows.append(source_register_row())
    write_csv(path, fieldnames, rows)


def main() -> None:
    canonical_words = read_csv(CSV_DIR / "canonical_words.csv")
    cmu_rows = read_csv(BASE / "lexicon_metadata_intake_all_canonical_words.csv")
    cmu_by_key = {row["word_key"]: row for row in cmu_rows}
    priority_cmu = read_csv(BASE / "lexicon_metadata_intake_priority_40_blockers.csv")
    priority_keys = build_blocking_index(priority_cmu)
    ipa_entries = parse_ipa_dict(IPA_PATH)

    rows: list[dict[str, str]] = []
    for word in canonical_words:
        word_key = word["word_key"]
        lookup = normalise_lookup(word["normalised_word"])
        variants = ipa_entries.get(lookup, [])
        cmu = cmu_by_key.get(word_key, {})
        first_ipa = variants[0] if variants else ""

        ipa_match_status = "matched" if variants else "unmatched"
        if len(variants) > 1:
            ipa_match_status = "matched_multiple_variants"

        ipa_syl = str(ipa_syllables(first_ipa)) if first_ipa else ""
        ipa_schwa = bool_string(ipa_has_schwa(first_ipa)) if first_ipa else ""
        ipa_stress = ipa_stress_pattern(first_ipa)
        ipa_primary = str(ipa_primary_stress(first_ipa)) if first_ipa else ""

        cmu_match = cmu.get("lexicon_match_status", "")
        cmu_syl = cmu.get("syllables", "")
        cmu_schwa = cmu.get("has_schwa", "")
        cmu_stress = cmu.get("stress_pattern", "")
        cmu_primary = str(cmu_primary_stress(cmu.get("phoneme_hint", ""))) if cmu.get("phoneme_hint") else ""

        syllable_agreement = agreement(ipa_syl, cmu_syl)
        schwa_agreement = agreement(ipa_schwa, cmu_schwa)

        if ipa_syl == "1" and cmu_syl == "1":
            primary_agreement = "not_applicable_single_syllable"
        else:
            primary_agreement = agreement(ipa_primary, cmu_primary)

        reasons = []
        if not variants:
            approval_safety = "not_covered_by_british_ipa_source"
            reasons.append("No British IPA match.")
        elif len(variants) > 1:
            approval_safety = "needs_human_review_variant"
            reasons.append("British IPA source has multiple variants.")
        elif cmu_match != "matched":
            approval_safety = "needs_human_review_cmudict_missing"
            reasons.append("CMUdict comparison row is not a clean match.")
        elif syllable_agreement != "agree":
            approval_safety = "needs_human_review_disagreement"
            reasons.append("Syllable count differs between British IPA and CMUdict.")
        elif schwa_agreement != "agree":
            approval_safety = "needs_human_review_disagreement"
            reasons.append("Schwa/weak-vowel flag differs between British IPA and CMUdict.")
        elif primary_agreement not in {"agree", "not_applicable_single_syllable"}:
            approval_safety = "needs_human_review_disagreement"
            reasons.append("Primary stress position differs between British IPA and CMUdict.")
        else:
            approval_safety = "safe_to_approve_candidate"
            reasons.append("British IPA and CMUdict agree on syllables, weak-vowel flag, and primary stress where applicable.")

        if approval_safety == "safe_to_approve_candidate":
            confidence = "medium"
        elif variants:
            confidence = "low"
        else:
            confidence = ""

        row = {
            "word_key": word_key,
            "normalised_word": word["normalised_word"],
            "display_word": word["display_word"],
            "dialect_code": word["dialect_code"],
            "blocks_current_first_exposure": bool_string(word_key in priority_keys),
            "blocking_micro_skill_keys": cmu.get("blocking_micro_skill_keys", ""),
            "ipa_lookup_key": lookup,
            "ipa_match_status": ipa_match_status,
            "ipa_variant_count": str(len(variants)),
            "ipa_uk": " | ".join(variants),
            "ipa_selected_for_comparison": first_ipa,
            "ipa_syllables": ipa_syl,
            "ipa_has_schwa": ipa_schwa,
            "ipa_schwa_symbols": ipa_schwa_symbols(first_ipa),
            "ipa_stress_pattern": ipa_stress,
            "ipa_primary_stress_syllable": ipa_primary,
            "cmudict_match_status": cmu_match,
            "cmudict_variant_count": cmu.get("lexicon_variant_count", ""),
            "cmudict_syllables": cmu_syl,
            "cmudict_phoneme_hint": cmu.get("phoneme_hint", ""),
            "cmudict_has_schwa": cmu_schwa,
            "cmudict_stress_pattern": cmu_stress,
            "cmudict_primary_stress_syllable": cmu_primary,
            "syllable_agreement": syllable_agreement,
            "schwa_agreement": schwa_agreement,
            "primary_stress_agreement": primary_agreement,
            "comparison_summary": "; ".join(reasons),
            "approval_safety": approval_safety,
            "approval_safety_reason": "; ".join(reasons),
            "source_category": "open_licensed",
            "source_name": IPA_SOURCE_NAME,
            "source_url": IPA_SOURCE_URL,
            "source_licence": IPA_SOURCE_LICENCE,
            "source_use_note": IPA_SOURCE_NOTE,
            "confidence": confidence,
            "review_status": "in_review" if variants else "draft",
            "review_notes": (
                "Candidate British IPA evidence compared with CMUdict. British IPA is the "
                "approved primary pronunciation source for canonical metadata population."
            ),
        }
        rows.append(row)

    fieldnames = [
        "word_key",
        "normalised_word",
        "display_word",
        "dialect_code",
        "blocks_current_first_exposure",
        "blocking_micro_skill_keys",
        "ipa_lookup_key",
        "ipa_match_status",
        "ipa_variant_count",
        "ipa_uk",
        "ipa_selected_for_comparison",
        "ipa_syllables",
        "ipa_has_schwa",
        "ipa_schwa_symbols",
        "ipa_stress_pattern",
        "ipa_primary_stress_syllable",
        "cmudict_match_status",
        "cmudict_variant_count",
        "cmudict_syllables",
        "cmudict_phoneme_hint",
        "cmudict_has_schwa",
        "cmudict_stress_pattern",
        "cmudict_primary_stress_syllable",
        "syllable_agreement",
        "schwa_agreement",
        "primary_stress_agreement",
        "comparison_summary",
        "approval_safety",
        "approval_safety_reason",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "confidence",
        "review_status",
        "review_notes",
    ]

    all_path = BASE / "british_ipa_metadata_intake_all_canonical_words.csv"
    priority_path = BASE / "british_ipa_metadata_intake_priority_40_blockers.csv"
    comparison_path = BASE / "british_ipa_cmudict_comparison_all_canonical_words.csv"
    safe_path = BASE / "british_ipa_safe_to_approve_candidates.csv"
    priority_safe_path = BASE / "british_ipa_priority_safe_to_approve_candidates.csv"
    priority_rows = [row for row in rows if row["blocks_current_first_exposure"] == "TRUE"]
    safe_rows = [row for row in rows if row["approval_safety"] == "safe_to_approve_candidate"]
    priority_safe_rows = [
        row
        for row in priority_rows
        if row["approval_safety"] == "safe_to_approve_candidate"
    ]

    write_csv(all_path, fieldnames, rows)
    write_csv(priority_path, fieldnames, priority_rows)
    write_csv(comparison_path, fieldnames, rows)
    write_csv(safe_path, fieldnames, safe_rows)
    write_csv(priority_safe_path, fieldnames, priority_safe_rows)
    update_source_register()

    summary = {
        "generated_at": date.today().isoformat(),
        "artifacts": {
            "all_canonical_words": str(all_path.relative_to(Path.cwd())),
            "priority_40_blockers": str(priority_path.relative_to(Path.cwd())),
            "comparison_all_canonical_words": str(comparison_path.relative_to(Path.cwd())),
            "safe_to_approve_candidates": str(safe_path.relative_to(Path.cwd())),
            "priority_safe_to_approve_candidates": str(priority_safe_path.relative_to(Path.cwd())),
        },
        "source": source_register_row(),
        "rows": len(rows),
        "priority_rows": len(priority_rows),
        "ipa_match_status_counts": Counter(row["ipa_match_status"] for row in rows),
        "approval_safety_counts": Counter(row["approval_safety"] for row in rows),
        "priority_approval_safety_counts": Counter(row["approval_safety"] for row in priority_rows),
        "syllable_agreement_counts": Counter(row["syllable_agreement"] for row in rows),
        "schwa_agreement_counts": Counter(row["schwa_agreement"] for row in rows),
        "primary_stress_agreement_counts": Counter(row["primary_stress_agreement"] for row in rows),
        "not_merged_into_canonical_word_metadata": True,
        "reason_not_merged": (
            "British IPA evidence has passed project legal/importability review. "
            "The separate canonical pronunciation population pass applies the approved "
            "British-IPA-first, CMUdict-fallback source priority."
        ),
        "hard_boundaries": [
            "no Supabase import",
            "no database mutation",
            "no migrations",
            "no runtime hooks",
            "no resolver changes",
            "no assignment changes",
            "no evidence/proficiency changes",
            "no Word Treasure changes",
        ],
    }
    summary_path = BASE / "british_ipa_metadata_intake_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
