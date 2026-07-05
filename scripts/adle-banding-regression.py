#!/usr/bin/env python3
"""ADLE Slice 1 (1D): regression truths for the banding v1.1 runner.

Covers: formula unit truths (monotonicity, Level-1 guarantee, note-to-class
mapping, mismatch proxy, threshold edges), fail-closed skips, unknown-note
listing, override precedence, allocation recompute correctness on fixtures,
and exact parity with the owner-approved 2026-07-04 preview when banding the
2026-06-29 candidate batch.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER_PATH = ROOT / "scripts/adle-band-teaching-dictionary.py"
CANDIDATE_CSV_FOLDER = (
    ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv"
)
PREVIEW_ORACLE = (
    ROOT
    / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-04-complexity-banding-preview/banding_preview_summary.json"
)

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


def load_runner():
    spec = importlib.util.spec_from_file_location("adle_banding_runner", RUNNER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


runner = load_runner()

BASE_METADATA = {
    "syllables": "1",
    "morphemes": "root:cat",
    "has_schwa": "FALSE",
    "phoneme_hint": "/kæt/",
    "irregularity_notes": "",
}


def band(word: str, **overrides) -> dict:
    metadata = {**BASE_METADATA, **overrides}
    result = runner.band_word(f"{word}_key", word, metadata)
    check("banded" in result, f"expected {word!r} to band, got {result!r}")
    return result.get("banded", {})


# --- Level-1 guarantee: 1 syllable, <=4 letters, regular, schwa-free,
# single morpheme, no mismatch -> score 0 -> Level 1 -------------------------
cat = band("cat")
check(cat.get("structural_score") == 0, f"Level-1 guarantee: cat score {cat.get('structural_score')} != 0")
check(cat.get("complexity_level") == 1, "Level-1 guarantee: cat is not Level 1")

# --- Monotonicity: adding any single feature never lowers score or level ----
feature_variants = {
    "syllables": {"syllables": "3"},
    "irregularity": {"irregularity_notes": "irregular function word"},
    "morphology": {"morphemes": "root:cat+plural:s"},
    "schwa": {"has_schwa": "TRUE"},
}
for name, variant in feature_variants.items():
    varied = band("cat", **variant)
    check(
        varied["structural_score"] >= cat["structural_score"],
        f"monotonicity: adding {name} lowered the score",
    )
    check(
        varied["complexity_level"] >= cat["complexity_level"],
        f"monotonicity: adding {name} lowered the level",
    )
longer = band("catamaran")
check(longer["structural_score"] >= cat["structural_score"], "monotonicity: longer word lowered the score")

# --- Note-to-class mapping ---------------------------------------------------
check(runner.irregularity_class("") == 0, "blank note must be class 0 (regular)")
check(runner.irregularity_class("regular") == 0, "'regular' must be class 0")
check(runner.irregularity_class("silent kn") == 2, "'silent kn' must be class 2")
check(runner.irregularity_class("gh for f") == 2, "'gh for f' must be class 2")
check(runner.irregularity_class("final tion") == 1, "'final tion' must be class 1")
check(runner.irregularity_class("split digraph a-e") == 1, "'split digraph a-e' must be class 1")
check(runner.irregularity_class("entirely new note value") == 1, "unknown note must fail soft to class 1")
check(runner.irregularity_points(0) == 0 and runner.irregularity_points(1) == 2 and runner.irregularity_points(2) == 4,
      "irregularity points must be 0/2/4")

# --- Unknown-note review list -------------------------------------------------
check(runner.is_new_note_value("entirely new note value"), "unknown note must be review-listed")
check(not runner.is_new_note_value("final tion"), "known class-1 note must not be review-listed")
check(not runner.is_new_note_value("silent kn"), "known class-2 note must not be review-listed")
check(not runner.is_new_note_value("regular"), "'regular' must not be review-listed")
unknown = runner.band_word("odd_key", "odd", {**BASE_METADATA, "irregularity_notes": "entirely new note value"})
check(unknown["new_note_value"] == "entirely new note value", "band_word must surface the new note value")
check(unknown["banded"]["irregularity_class"] == 1, "new note must band as class 1, not fail the run")

# --- Mismatch proxy on known words --------------------------------------------
eight = band("eight", syllables="1", phoneme_hint="/eɪt/", morphemes="root:eight")
check(eight["mismatch_flag"] is True, "mismatch proxy: 'eight' (5 letters, 2 phonemes) must flag")
check(cat["mismatch_flag"] is False, "mismatch proxy: 'cat' must not flag")
check(runner.count_phonemes("/eɪt/") == 2, "IPA phoneme count for /eɪt/ must be 2")
check(runner.count_phonemes("K AE T") == 3, "ARPAbet phoneme count for 'K AE T' must be 3")

# --- Threshold edges: L1 <= 1, L2 2-5, L3 >= 6 --------------------------------
for score, expected_level in [(0, 1), (1, 1), (2, 2), (5, 2), (6, 3), (14, 3)]:
    check(
        runner.level_from_score(score) == expected_level,
        f"threshold edge: score {score} must be Level {expected_level}",
    )

# --- Fail-closed skips ----------------------------------------------------------
for missing_field in ("syllables", "morphemes", "has_schwa", "phoneme_hint"):
    result = runner.band_word("x_key", "x", {**BASE_METADATA, missing_field: ""})
    check(
        "skipped" in result and missing_field in result["skipped"]["missing_fields"],
        f"fail closed: missing {missing_field} must skip and be reported",
    )
blank_note = runner.band_word("y_key", "y", BASE_METADATA)
check("banded" in blank_note, "blank irregularity_notes is allowed (= regular), must not skip")

# --- Override precedence --------------------------------------------------------
check(runner.effective_level(1, 3) == 3, "active override must win over computed level")
check(runner.effective_level(2, None) == 2, "no override falls back to computed level")
check(runner.effective_level(2, 99) == 2, "override outside the version range must fail closed to computed")
check(runner.effective_level(None, None) is None, "unbanded word with no override has no effective level")
check(runner.effective_level(None, 2) == 2, "override may band an otherwise unbanded word")

# --- Allocation recompute on fixtures (contrast excluded, overrides applied) ----
fixture_words = [
    {"word_key": "cat_k", "normalised_word": "cat"},
    {"word_key": "because_k", "normalised_word": "because"},
    {"word_key": "broken_k", "normalised_word": "broken"},
]
fixture_meta = {
    "cat_k": dict(BASE_METADATA),
    "because_k": {
        "syllables": "2",
        "morphemes": "root:because",
        "has_schwa": "TRUE",
        "phoneme_hint": "/bɪˈkɒz/",
        "irregularity_notes": "common high-frequency tricky word",
    },
    "broken_k": {**BASE_METADATA, "syllables": ""},  # fails closed
}
fixture_support = [
    {"word_key": "cat_k", "micro_skill_key": "skill_a", "support_role": "support_example"},
    {"word_key": "because_k", "micro_skill_key": "skill_a", "support_role": "review_example"},
    {"word_key": "because_k", "micro_skill_key": "skill_b", "support_role": "contrast"},
    {"word_key": "broken_k", "micro_skill_key": "skill_a", "support_role": "support_example"},
]
outcome = runner.run_banding(fixture_words, fixture_meta, fixture_support, {"cat_k": 2})
report = outcome["report"]
cells = {(c["micro_skill_key"], c["complexity_level"]): c["allocation"] for c in outcome["allocation_cells"]}
check(report["word_count"] == 2, "fixture: exactly 2 words band (broken_k fails closed)")
check(report["skipped_word_count"] == 1, "fixture: 1 skipped word reported")
check(report["skipped_words"][0]["word_key"] == "broken_k", "fixture: skipped word is broken_k")
check(("skill_b", 3) not in cells and not any(k[0] == "skill_b" for k in cells),
      "fixture: contrast-role links must not appear in the allocation")
check(cells.get(("skill_a", 2)) == 1, "fixture: cat's override (L1->L2) must move its allocation cell")
check(cells.get(("skill_a", 3)) == 1, "fixture: because (score 8) allocates at L3")
check(("skill_a", 1) not in cells, "fixture: no residual L1 cell once the override applies")
check(report["override_count_applied_to_allocation"] == 1, "fixture: override count reported")

# --- Parity: banding the candidate batch reproduces the approved preview --------
words, metadata, support = runner.load_csv_inputs(CANDIDATE_CSV_FOLDER)
parity_outcome = runner.run_banding(words, metadata, support, overrides_by_word_key={})
parity_failures = runner.parity_check(parity_outcome["report"], PREVIEW_ORACLE)
for failure in parity_failures:
    failures.append(f"parity: {failure}")
parity_report = parity_outcome["report"]
check(parity_report["word_count"] == 874, "parity: 874 words banded")
check(parity_report["level_distribution"] == {"1": 424, "2": 342, "3": 108}, "parity: level distribution 424/342/108")
check(parity_report["populated_skill_level_cells"] == 372, "parity: 372 populated skill/level cells")
check(parity_report["cells_under_floor_8"] == 365, "parity: 365 cells under floor 8")
check(parity_report["skipped_word_count"] == 0, "parity: candidate batch has no fail-closed skips")
check(parity_report["new_note_values"] == [], "parity: candidate batch has no unknown note values")

if failures:
    print("ADLE banding regression FAILED:")
    for failure in failures:
        print(f"  - {failure}")
    sys.exit(1)

print("ADLE banding regression passed")
print(json.dumps({
    "parity_word_count": parity_report["word_count"],
    "parity_level_distribution": parity_report["level_distribution"],
    "parity_cells": parity_report["populated_skill_level_cells"],
    "parity_under_floor": parity_report["cells_under_floor_8"],
}))
