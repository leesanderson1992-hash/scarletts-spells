#!/usr/bin/env python3
"""Build a reviewed, non-importing staging fixture for the base-word pilot.

The fixture is deliberately small and reproducible.  It is derived only from
the approved teaching-dictionary candidate set and is *not* a hosted-database
importer.  A separately reviewed staging import path must consume it.
"""

from __future__ import annotations

import csv
import hashlib
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv"
OUTPUT = ROOT / "docs/implementation/seed-data/staging-fixtures/adle-base-word-family-pilot-v1"
MICRO_SKILLS = ROOT / "docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json"

MICRO_SKILL_KEY = "D4_MOR_BASE_WORDS_PRESERVE_BASE"
FAMILY_KEYS = {"play_base_family", "govern_base_family"}
FAMILY_WORD_KEYS = {
    "play_en_gb",
    "replay_en_gb",
    "replayed_en_gb",
    "playing_en_gb",
    "plays_en_gb",
    "govern_en_gb",
    "governor_en_gb",
    "government_en_gb",
}
PREVIEW_DEPENDENCY_WORD_KEYS = {"careless_en_gb"}
WORD_KEYS = FAMILY_WORD_KEYS | PREVIEW_DEPENDENCY_WORD_KEYS
CONTENT_KEY = (MICRO_SKILL_KEY, "human_reviewed_v1")
CSV_FILES = (
    "canonical_words.csv",
    "canonical_word_metadata.csv",
    "micro_skill_word_support.csv",
    "teaching_content_versions.csv",
    "teaching_content_field_reviews.csv",
    "teaching_content_sources.csv",
    "base_word_families.csv",
    "base_word_family_members.csv",
)


def read_csv(name: str) -> tuple[list[str], list[dict[str, str]]]:
    with (SOURCE / name).open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return reader.fieldnames or [], list(reader)


def write_csv(destination: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with destination.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def approved(row: dict[str, str]) -> bool:
    return row.get("review_status") == "approved_for_first_exposure"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    selected: dict[str, tuple[list[str], list[dict[str, str]]]] = {}
    for name in CSV_FILES:
        headers, rows = read_csv(name)
        if name in {"canonical_words.csv", "canonical_word_metadata.csv"}:
            rows = [row for row in rows if row["word_key"] in WORD_KEYS]
        elif name == "micro_skill_word_support.csv":
            rows = [
                row for row in rows
                if row["word_key"] in WORD_KEYS and row["micro_skill_key"] == MICRO_SKILL_KEY
            ]
        elif name == "teaching_content_versions.csv":
            rows = [
                row for row in rows
                if (row["micro_skill_key"], row["content_version"]) == CONTENT_KEY
            ]
        elif name == "teaching_content_field_reviews.csv":
            rows = [
                row for row in rows
                if (row["micro_skill_key"], row["content_version"]) == CONTENT_KEY
            ]
        elif name == "base_word_families.csv":
            rows = [row for row in rows if row["base_family_key"] in FAMILY_KEYS]
        elif name == "base_word_family_members.csv":
            rows = [
                row for row in rows
                if row["base_family_key"] in FAMILY_KEYS and row["word_key"] in FAMILY_WORD_KEYS
            ]
        # All source records are retained: their rows are provenance only and
        # the import planner intentionally does not resolve a CSV row to one.
        selected[name] = (headers, rows)

    words = selected["canonical_words.csv"][1]
    metadata = selected["canonical_word_metadata.csv"][1]
    families = selected["base_word_families.csv"][1]
    members = selected["base_word_family_members.csv"][1]
    content = selected["teaching_content_versions.csv"][1]

    if {row["word_key"] for row in words} != WORD_KEYS or len(metadata) != len(WORD_KEYS):
        raise SystemExit("The reviewed fixture requires canonical words and metadata for its family and preview dependencies.")
    if {row["base_family_key"] for row in families} != FAMILY_KEYS or len(members) != 8:
        raise SystemExit("The reviewed fixture requires the complete five-word play and three-word govern families.")
    if len(content) != 1:
        raise SystemExit("The reviewed fixture requires exactly one active preserve-base teaching-content version.")
    for rows in (words, metadata, families, members):
        if not all(approved(row) for row in rows):
            raise SystemExit("Fixture selection contains content that is not approved for first exposure.")
    if not all(row["assignment_eligible"] == "TRUE" for row in members):
        raise SystemExit("Every selected family member must have reviewed dictation support.")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    for name, (headers, rows) in selected.items():
        write_csv(OUTPUT / name, headers, rows)

    (OUTPUT / "README.md").write_text(
        """# ADLE base-word-family pilot — staging fixture

Generated from the approved teaching-dictionary candidate CSVs. It contains
the five-word `play` family, the three-word `govern` family, the reviewed
preserve-base teaching record, and its `careless` preview-word dependency.

This is **not an importer** and must not be pasted into a hosted SQL editor.
The existing teaching-dictionary importer permits local targets only. A future
staging-only importer must record a distinct import batch, verify counts and
delete only that batch during disposable-proof cleanup.
""",
        encoding="utf-8",
    )

    micro_skill_rows = json.loads(MICRO_SKILLS.read_text(encoding="utf-8"))
    prerequisite = next((row for row in micro_skill_rows if row["micro_skill_key"] == MICRO_SKILL_KEY), None)
    if prerequisite is None:
        raise SystemExit(f"Missing authoritative micro-skill prerequisite: {MICRO_SKILL_KEY}")
    (OUTPUT / "micro_skill_catalog_prerequisite.json").write_text(
        json.dumps(prerequisite, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    manifest = {
        "fixture_key": "adle_base_word_family_pilot_v1",
        "purpose": "disposable staging proof only",
        "import_policy": "not directly importable; requires a separately reviewed staging-only importer",
        "micro_skill_key": MICRO_SKILL_KEY,
        "families": sorted(FAMILY_KEYS),
        "word_keys": sorted(WORD_KEYS),
        "counts": {name: len(rows) for name, (_, rows) in selected.items()},
        "source_csv_folder": str(SOURCE.relative_to(ROOT)),
        "source_csv_sha256": {name: sha256(SOURCE / name) for name in CSV_FILES},
        "cleanup_contract": "Delete only rows associated with the recorded staging import batch after proof verification; never delete shared curriculum rows.",
    }
    (OUTPUT / "fixture-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
