#!/usr/bin/env python3
"""ADLE Slice 3 (3B): regression truths for the composer registry importer.

Covers: sheet parity with the content workbook (8 families, 32 templates,
exact family-key set), guided-sequence key resolution (template keys plus the
two documented composition-time meta-keys only), runtime-metadata coverage
(every template declared exactly once; homophone-only contrast requirements;
sentence-context and free-writing caps where the blueprint pins them), and
fail-closed validation on corrupted fixtures (unknown family, unknown phase,
unknown sequence key, duplicate keys, wrong row counts).
"""

from __future__ import annotations

import copy
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORTER_PATH = ROOT / "scripts/adle-import-composer-registry.py"
WORKBOOK = ROOT / "docs/implementation/seed-data/ADLE_content_workbook_v1.xlsx"

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


def load_importer():
    spec = importlib.util.spec_from_file_location("adle_composer_registry_importer", IMPORTER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


importer = load_importer()

# --- Sheet parity on the real workbook --------------------------------------

parsed = importer.parse_workbook(WORKBOOK)
errors = importer.validate_registry(parsed)
check(errors == [], f"real workbook must validate cleanly, got {errors!r}")
check(len(parsed["families"]) == 8, f"expected 8 families, got {len(parsed['families'])}")
check(len(parsed["templates"]) == 32, f"expected 32 templates, got {len(parsed['templates'])}")
check(
    sorted(f["family_key"] for f in parsed["families"])
    == sorted(importer.EXPECTED_FAMILY_KEYS),
    "family keys must match the taxonomy skill_family_key set exactly",
)

template_keys = {t["template_key"] for t in parsed["templates"]}
check(
    template_keys == set(importer.TEMPLATE_RUNTIME_METADATA),
    "runtime metadata must cover the template sheet exactly",
)

# Every guided-sequence key resolves to a template or a documented meta-key.
for family in parsed["families"]:
    for key in family["guided_question_sequence"]:
        check(
            key in template_keys or key in importer.SEQUENCE_META_KEYS,
            f"family {family['family_key']} sequence key {key!r} does not resolve",
        )
    check(
        len(family["guided_question_sequence"]) >= 3,
        f"family {family['family_key']} guided sequence unexpectedly short",
    )

# --- Pinned runtime metadata truths ------------------------------------------

contrast_templates = {
    key for key, (_, _, contrast, _) in importer.TEMPLATE_RUNTIME_METADATA.items() if contrast
}
check(
    contrast_templates == {"HOM_MEANING_MATCH", "HOM_SENTENCE_CHOICE", "HOM_CORRECTION"},
    f"contrast-word requirements are homophone-family only, got {sorted(contrast_templates)}",
)
sentence_kind = importer.TEMPLATE_RUNTIME_METADATA["DICTATION_SENTENCE_CONTEXT"]
check(sentence_kind[1] is True, "DICTATION_SENTENCE_CONTEXT must require sentence context")
check(
    sentence_kind[3] == "dictation_sentence_context",
    "DICTATION_SENTENCE_CONTEXT evidence label pinned",
)
for key in ("MUST_USE_FREEWRITING", "REVIEW_MUST_USE_WRITING"):
    check(
        importer.TEMPLATE_RUNTIME_METADATA[key][0] == 3,
        f"{key} must require at least 3 words (blueprint must-use cap 3-5)",
    )
check(
    importer.TEMPLATE_RUNTIME_METADATA["DIAGNOSTIC_DICTATION_PROBE"][3] == "diagnostic_probe",
    "probe template carries the diagnostic_probe evidence label",
)

# --- Fail-closed sweeps on corrupted fixtures ---------------------------------

def corrupted(mutate) -> list[str]:
    clone = copy.deepcopy(parsed)
    mutate(clone)
    return importer.validate_registry(clone)


check(
    corrupted(lambda p: p["families"].pop()) != [],
    "dropping a family row must fail the batch (sheet parity)",
)
check(
    corrupted(lambda p: p["templates"].pop()) != [],
    "dropping a template row must fail the batch (sheet parity)",
)
check(
    any(
        "not in the taxonomy" in e
        for e in corrupted(lambda p: p["families"][0].update(family_key="D4_UNKNOWN"))
    ),
    "unknown family key must fail the batch report",
)
check(
    any(
        "unknown phase" in e
        for e in corrupted(lambda p: p["templates"][0].update(phase="Invented phase"))
    ),
    "unknown phase must fail the batch report",
)
check(
    any(
        "does not resolve" in e or "unknown key" in e
        for e in corrupted(
            lambda p: p["families"][0].update(guided_question_sequence=["NOT_A_TEMPLATE"])
        )
    ),
    "unresolvable guided-sequence key must fail the batch report",
)
check(
    any(
        "duplicate template_key" in e
        for e in corrupted(lambda p: p["templates"].__setitem__(1, copy.deepcopy(p["templates"][0])))
    ),
    "duplicate template keys must fail the batch report",
)

# A meta-key alone stays valid (the composer resolves it at composition time).
meta_only = corrupted(
    lambda p: p["families"][0].update(guided_question_sequence=["PG_SOUND_NOTICE", "DICTATION_OR_WRITING"])
)
check(meta_only == [], f"documented meta-keys must validate, got {meta_only!r}")

# --- Result -------------------------------------------------------------------

if failures:
    print("ADLE composer registry regression FAILED:", file=sys.stderr)
    for failure in failures:
        print(f"  {failure}", file=sys.stderr)
    sys.exit(1)

print("ADLE composer registry regression passed.")
