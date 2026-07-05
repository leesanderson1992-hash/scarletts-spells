#!/usr/bin/env python3
"""ADLE Slice 1 (1B): deterministic banding runner for the Teaching Dictionary.

Computes banding v1.1 (approved 2026-07-04) per word plus the per-micro-skill
per-level allocation table, and writes a JSON batch report in the
banding_preview_summary.json shape.

Dry-run is the default everywhere. Input modes:
  --csv-folder   band a candidate CSV export (same files the Phase 5F importer
                 reads); report-only, never touches a database
  --local-db-url band the active dictionary rows in local/dev Supabase;
                 --apply (plus the confirmation token) writes banding rows and
                 recomputes the allocation table in one guarded transaction

Policy invariants (adle-word-complexity-banding-and-formula-numbers-proposal.md
sections 1 and 2.1):
  - frequency_band / age_band are never read by this script's scoring path
  - words missing required structural metadata get no banding row (fail closed)
  - unknown irregularity notes band as class 1 and are review-listed
  - overrides are respected when computing allocation, never rewritten
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]

# ---------------------------------------------------------------------------
# Versioned formula constants — banding v1.1 (proposal sections 1.3 to 1.6).
# These are policy content: extend only with an approved proposal amendment.
# ---------------------------------------------------------------------------

BANDING_VERSION = "banding_v1.1_2026-07-04"
FORMULA_REFERENCE = "docs/implementation/adle-word-complexity-banding-and-formula-numbers-proposal.md"
LEVEL_UPPER_BOUNDS = (1, 5)  # L1 <= 1, L2 2-5, L3 >= 6
LEVEL_COUNT = len(LEVEL_UPPER_BOUNDS) + 1
ALLOCATION_FLOOR = 8

REQUIRED_METADATA_FIELDS = ("syllables", "morphemes", "has_schwa", "phoneme_hint")

IRREGULAR_CLASS2_NOTES = frozenset({
    "common high-frequency tricky word", "simple high-frequency tricky word",
    "longer high-frequency tricky word", "irregular function word",
    "function word homophone", "content word homophone",
    "contraction/possessive homophone",
    "silent b/t", "silent kn", "silent mb", "silent wr",
    "gh for f", "ould word", "wor for /wer/", "wa altered vowel",
    "remembered double letter word",
})

# Known class-1 (conditional/pattern) notes as of the 2026-06-29 candidate
# corpus. A non-empty note outside both tables still bands as class 1 but is
# emitted on the batch report's new_note_values review list (proposal 2.1).
KNOWN_CLASS1_NOTES = frozenset({
    "Greek ch for k", "final cial", "final cian", "final ff after short vowel",
    "final ll after short vowel", "final ow", "final sion",
    "final ss after short vowel", "final tial", "final tion", "final ture",
    "final unstressed a", "final unstressed ar", "final unstressed er",
    "final unstressed or", "final ve", "final zz after short vowel",
    "ing double final consonant", "ing drop e", "ing ie to y",
    "long ai with ai", "long ai with ea", "long oa with oa",
    "medial doubled consonant", "medial weak vowel", "natural/actual weak vowel",
    "negative prefix il", "negative prefix im", "partly_irregular",
    "past tense double final consonant", "past tense drop e",
    "past tense y to i", "ph for f", "plural es", "plural ies", "plural ves",
    "prefix dis", "prefix mis", "present tense es", "present tense y to ies",
    "preserve base after prefix", "preserve base before suffix",
    "soft c before e", "soft c before i", "soft g before i", "soft g before y",
    "split digraph a-e", "split digraph i-e", "split digraph o-e",
    "split digraph u-e", "suffix able/ible", "suffix al", "suffix ful",
    "suffix ity", "suffix ment", "suffix ness", "suffix ous",
})

IPA_DIPHTHONGS = ["aʊ", "əʊ", "eɪ", "aɪ", "ɔɪ", "ɪə", "eə", "ʊə"]
IPA_AFFRICATES = ["tʃ", "dʒ"]
IPA_LONG = ["iː", "uː", "ɑː", "ɔː", "ɜː"]
IPA_STRIP = "ˈˌ. ˑ‿"
MISMATCH_LETTER_PHONEME_GAP = 3

LOCAL_CONFIRMATION_TOKEN = "adle-banding-local-dev"
ADVISORY_LOCK_NAME = "adle_dictionary_banding_run"
EXPECTED_MIGRATION_VERSIONS = ("20260629120000", "20260705090000")
RUNNER_VERSION = "adle_banding_runner_v1"

WORD_BANDING_TABLE = "canonical_teaching_dictionary_word_banding"
ALLOCATION_TABLE = "canonical_teaching_dictionary_skill_level_allocation"
OVERRIDES_TABLE = "canonical_teaching_dictionary_banding_overrides"
VERSIONS_TABLE = "canonical_teaching_dictionary_banding_versions"
IMPORT_BATCH_TABLE = "canonical_teaching_dictionary_import_batches"


# ---------------------------------------------------------------------------
# Formula (pure; ports build_banding_preview.py exactly, minus its defaults —
# the runtime path fails closed instead of defaulting missing inputs)
# ---------------------------------------------------------------------------

def irregularity_class(note: str) -> int:
    note = (note or "").strip()
    if not note or note == "regular":
        return 0
    if note in IRREGULAR_CLASS2_NOTES:
        return 2
    return 1


def is_new_note_value(note: str) -> bool:
    note = (note or "").strip()
    if not note or note == "regular":
        return False
    return note not in IRREGULAR_CLASS2_NOTES and note not in KNOWN_CLASS1_NOTES


def count_ipa_phonemes(value: str) -> int:
    value = value.strip().strip("/")
    for ch in IPA_STRIP:
        value = value.replace(ch, "")
    count = 0
    index = 0
    multis = IPA_DIPHTHONGS + IPA_AFFRICATES + IPA_LONG
    while index < len(value):
        matched = False
        for multi in multis:
            if value.startswith(multi, index):
                count += 1
                index += len(multi)
                matched = True
                break
        if not matched:
            if not unicodedata.category(value[index]).startswith("M"):
                count += 1
            index += 1
    return count


def count_phonemes(phoneme_hint: str) -> int | None:
    phoneme_hint = (phoneme_hint or "").strip()
    if not phoneme_hint:
        return None
    first = phoneme_hint.split(" / ")[0].strip()
    if first.startswith("/"):
        return count_ipa_phonemes(first)
    return len(first.split())


def morphology_depth(morphemes: str) -> int:
    if ":" not in morphemes:
        return 1
    body = morphemes.split(":", 1)[1]
    if not body.strip():
        return 1
    return body.count("+") + 1


def syllable_points(syllables: int) -> int:
    return {1: 0, 2: 1, 3: 2}.get(syllables, 3)


def length_points(letter_count: int) -> int:
    if letter_count <= 4:
        return 0
    if letter_count <= 6:
        return 1
    if letter_count <= 8:
        return 2
    return 3


def irregularity_points(cls: int) -> int:
    return {0: 0, 1: 2, 2: 4}[cls]


def morphology_points(depth: int) -> int:
    return {1: 0, 2: 1}.get(depth, 2)


def letter_count(normalised_word: str) -> int:
    return sum(1 for ch in normalised_word if "a" <= ch <= "z")


def level_from_score(score: int) -> int:
    for index, bound in enumerate(LEVEL_UPPER_BOUNDS):
        if score <= bound:
            return index + 1
    return LEVEL_COUNT


def band_word(word_key: str, normalised_word: str, metadata: dict[str, Any]) -> dict[str, Any]:
    """Band one word. Returns {"banded": row} or {"skipped": reason-detail}.

    metadata keys: syllables, morphemes, has_schwa, phoneme_hint,
    irregularity_notes — as text/bool straight from CSV or DB. The word's
    frequency_band/age_band are deliberately not accepted here (obscure-word
    firewall: bands gate eligibility, never the Level).
    """
    missing = []
    for field in REQUIRED_METADATA_FIELDS:
        value = metadata.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing.append(field)
    syllables_raw = metadata.get("syllables")
    syllables = None
    if syllables_raw is not None and str(syllables_raw).strip():
        try:
            syllables = int(float(str(syllables_raw).strip()))
        except ValueError:
            missing.append("syllables")
    if missing:
        return {"skipped": {"word_key": word_key, "missing_fields": sorted(set(missing))}}

    has_schwa_raw = metadata.get("has_schwa")
    if isinstance(has_schwa_raw, bool):
        has_schwa = has_schwa_raw
    else:
        cleaned = str(has_schwa_raw).strip().upper()
        if cleaned in ("TRUE", "T"):
            has_schwa = True
        elif cleaned in ("FALSE", "F"):
            has_schwa = False
        else:
            return {"skipped": {"word_key": word_key, "missing_fields": ["has_schwa"]}}

    note = (metadata.get("irregularity_notes") or "").strip()
    cls = irregularity_class(note)
    letters = letter_count(normalised_word)
    phonemes = count_phonemes(metadata.get("phoneme_hint") or "")
    mismatch = phonemes is not None and (letters - phonemes) >= MISMATCH_LETTER_PHONEME_GAP
    depth = morphology_depth(metadata.get("morphemes") or "")

    row = {
        "word_key": word_key,
        "normalised_word": normalised_word,
        "syllables": syllables,
        "letter_count": letters,
        "phoneme_count": phonemes,
        "syllable_points": syllable_points(syllables),
        "length_points": length_points(letters),
        "irregularity_class": cls,
        "irregularity_points": irregularity_points(cls),
        "morphology_depth": depth,
        "morphology_points": morphology_points(depth),
        "has_schwa": has_schwa,
        "mismatch_flag": mismatch,
        "irregularity_note_source": note,
        "banding_version": BANDING_VERSION,
    }
    row["structural_score"] = (
        row["syllable_points"] + row["length_points"] + row["irregularity_points"]
        + row["morphology_points"] + (1 if has_schwa else 0) + (1 if mismatch else 0)
    )
    row["complexity_level"] = level_from_score(row["structural_score"])
    return {"banded": row, "new_note_value": note if is_new_note_value(note) else None}


def effective_level(banded_level: int | None, override_level: int | None) -> int | None:
    """Active override wins; an override outside the version's range fails
    closed to the computed level. None means the word is unbanded."""
    if override_level is not None and 1 <= override_level <= LEVEL_COUNT:
        return override_level
    return banded_level


# ---------------------------------------------------------------------------
# Batch computation and report
# ---------------------------------------------------------------------------

def run_banding(
    words: list[dict[str, Any]],
    metadata_by_word_key: dict[str, dict[str, Any]],
    support_rows: list[dict[str, Any]],
    overrides_by_word_key: dict[str, int],
) -> dict[str, Any]:
    banded: dict[str, dict[str, Any]] = {}
    skipped: list[dict[str, Any]] = []
    new_notes: Counter[str] = Counter()

    for word in words:
        word_key = word["word_key"]
        metadata = metadata_by_word_key.get(word_key)
        if metadata is None:
            skipped.append({"word_key": word_key, "missing_fields": ["word_metadata_row"]})
            continue
        result = band_word(word_key, word["normalised_word"], metadata)
        if "skipped" in result:
            skipped.append(result["skipped"])
            continue
        banded[word_key] = result["banded"]
        if result["new_note_value"]:
            new_notes[result["new_note_value"]] += 1

    allocation: dict[str, Counter[int]] = defaultdict(Counter)
    for support in support_rows:
        if support["support_role"] == "contrast":
            continue
        row = banded.get(support["word_key"])
        if row is None:
            continue
        level = effective_level(row["complexity_level"], overrides_by_word_key.get(support["word_key"]))
        if level is not None:
            allocation[support["micro_skill_key"]][level] += 1

    cells = [
        {"micro_skill_key": skill, "complexity_level": level, "allocation": count}
        for skill in sorted(allocation)
        for level, count in sorted(allocation[skill].items())
        if count > 0
    ]
    words_per_skill = {skill: sum(levels.values()) for skill, levels in allocation.items()}
    sorted_word_counts = sorted(words_per_skill.values())

    report = {
        "banding_version": BANDING_VERSION,
        "runner_version": RUNNER_VERSION,
        "level_count": LEVEL_COUNT,
        "level_upper_bounds": list(LEVEL_UPPER_BOUNDS),
        "word_count": len(banded),
        "level_distribution": {str(k): v for k, v in sorted(Counter(r["complexity_level"] for r in banded.values()).items())},
        "score_distribution": {str(k): v for k, v in sorted(Counter(r["structural_score"] for r in banded.values()).items())},
        "skills_with_mapped_words": len(allocation),
        "populated_skill_level_cells": len(cells),
        "cells_under_floor_8": sum(1 for cell in cells if cell["allocation"] < ALLOCATION_FLOOR),
        "skills_under_8_total_words": sum(1 for v in words_per_skill.values() if v < ALLOCATION_FLOOR),
        "skills_under_2_total_words": sum(1 for v in words_per_skill.values() if v < 2),
        "median_words_per_skill": sorted_word_counts[len(sorted_word_counts) // 2] if sorted_word_counts else 0,
        "blank_irregularity_notes": sum(1 for r in banded.values() if not r["irregularity_note_source"]),
        "mismatch_flag_count": sum(1 for r in banded.values() if r["mismatch_flag"]),
        "skipped_word_count": len(skipped),
        "skipped_words": sorted(skipped, key=lambda s: s["word_key"]),
        "new_note_values": [
            {"irregularity_note": note, "word_count": count}
            for note, count in sorted(new_notes.items())
        ],
        "override_count_applied_to_allocation": sum(
            1 for word_key in overrides_by_word_key if word_key in banded
        ),
    }
    return {"banded": banded, "allocation_cells": cells, "report": report}


def parity_check(report: dict[str, Any], oracle_path: Path) -> list[str]:
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    failures = []
    checks = [
        ("word_count", report["word_count"], oracle["word_count"]),
        ("level_distribution", report["level_distribution"], {str(k): v for k, v in oracle["level_distribution"].items()}),
        ("score_distribution", report["score_distribution"], {str(k): v for k, v in oracle["score_distribution"].items()}),
        ("populated_skill_level_cells", report["populated_skill_level_cells"], oracle["populated_skill_level_cells"]),
        ("cells_under_floor_8", report["cells_under_floor_8"], oracle["cells_under_floor_8"]),
        ("skills_with_mapped_words", report["skills_with_mapped_words"], oracle["skills_with_mapped_words"]),
        ("blank_irregularity_notes", report["blank_irregularity_notes"], oracle["blank_irregularity_notes"]),
        ("mismatch_flag_count", report["mismatch_flag_count"], oracle["mismatch_flag_count"]),
    ]
    for name, actual, expected in checks:
        if actual != expected:
            failures.append(f"{name}: runner={actual!r} oracle={expected!r}")
    return failures


# ---------------------------------------------------------------------------
# CSV input mode (candidate export folders; report-only)
# ---------------------------------------------------------------------------

def load_csv_inputs(folder: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    def read(name: str) -> list[dict[str, str]]:
        path = folder / name
        if not path.exists():
            raise FileNotFoundError(f"Missing required CSV: {path}")
        with path.open(newline="", encoding="utf-8") as handle:
            return list(csv.DictReader(handle))

    words = [
        {"word_key": row["word_key"].strip(), "normalised_word": row["normalised_word"].strip()}
        for row in read("canonical_words.csv")
        if (row.get("row_status") or "active").strip() in ("", "active")
    ]
    metadata = {
        row["word_key"].strip(): {
            "syllables": row.get("syllables", ""),
            "morphemes": row.get("morphemes", ""),
            "has_schwa": row.get("has_schwa", ""),
            "phoneme_hint": row.get("phoneme_hint", ""),
            "irregularity_notes": row.get("irregularity_notes", ""),
        }
        for row in read("canonical_word_metadata.csv")
    }
    support = [
        {"word_key": row["word_key"].strip(), "micro_skill_key": row["micro_skill_key"].strip(), "support_role": row["support_role"].strip()}
        for row in read("micro_skill_word_support.csv")
        if (row.get("row_status") or "active").strip() in ("", "active")
    ]
    return words, metadata, support


# ---------------------------------------------------------------------------
# Local DB mode (guards match scripts/import-teaching-dictionary-csv.py)
# ---------------------------------------------------------------------------

def require_local_db_url(db_url: str) -> None:
    parsed = urlparse(db_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("Local DB URL must use postgres:// or postgresql://.")
    if parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("Refusing non-local database host. Expected localhost or 127.0.0.1.")
    if parsed.port != 54322:
        raise ValueError("Refusing non-local Supabase port. Expected local Postgres port 54322.")
    if (parsed.path or "").lstrip("/") != "postgres":
        raise ValueError("Refusing non-local Supabase database. Expected database name postgres.")


def quote_sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def psql_command_base(db_url: str, psql_command: str, psql_mode: str, docker_container: str | None) -> list[str]:
    if psql_mode == "host":
        return [psql_command, db_url, "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "-v", "ON_ERROR_STOP=1"]
    if psql_mode == "docker":
        if not docker_container:
            raise ValueError("--docker-container is required when --psql-mode docker is used.")
        return [
            "docker", "exec", "-i", docker_container,
            "psql", "-U", "postgres", "-d", "postgres",
            "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "-v", "ON_ERROR_STOP=1",
        ]
    raise ValueError(f"Unsupported psql mode: {psql_mode!r}.")


def run_psql_json(base: list[str], sql: str) -> Any:
    wrapped = (
        "select coalesce(jsonb_agg(row_to_json(result_rows)), '[]'::jsonb) "
        f"from ({sql}) result_rows"
    )
    result = subprocess.run([*base, "-c", wrapped], capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise ValueError(detail or f"psql exited with status {result.returncode}")
    return json.loads(result.stdout.strip() or "[]")


def run_psql_script_text(base: list[str], sql: str) -> str:
    result = subprocess.run(base, input=sql, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise ValueError(detail or f"psql exited with status {result.returncode}")
    return result.stdout.strip()


def db_preflight(base: list[str]) -> None:
    versions = run_psql_json(
        base,
        "select version from supabase_migrations.schema_migrations where version = any (array["
        + ", ".join(quote_sql_literal(v) for v in EXPECTED_MIGRATION_VERSIONS)
        + "])",
    )
    present = {row["version"] for row in versions}
    missing = sorted(set(EXPECTED_MIGRATION_VERSIONS) - present)
    if missing:
        raise ValueError(f"Migration ledger is missing required versions: {missing}.")
    active_versions = run_psql_json(
        base,
        f"select banding_version, level_count from public.{VERSIONS_TABLE} where is_active = true",
    )
    if len(active_versions) != 1 or active_versions[0]["banding_version"] != BANDING_VERSION:
        raise ValueError(
            f"Active banding version in {VERSIONS_TABLE} must be {BANDING_VERSION!r}; found {active_versions!r}."
        )
    if active_versions[0]["level_count"] != LEVEL_COUNT:
        raise ValueError("Active banding version level_count does not match the runner's formula constants.")


def load_db_inputs(base: list[str]) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list[dict[str, Any]], dict[str, int], dict[str, str]]:
    words = run_psql_json(
        base,
        "select w.id, w.word_key, w.normalised_word from public.canonical_teaching_dictionary_words w "
        "where w.row_status = 'active' order by w.word_key",
    )
    metadata_rows = run_psql_json(
        base,
        "select w.word_key, m.syllables, m.phoneme_hint, m.has_schwa, m.morphemes, m.irregularity_notes "
        "from public.canonical_teaching_dictionary_word_metadata m "
        "join public.canonical_teaching_dictionary_words w on w.id = m.canonical_word_id "
        "where m.row_status = 'active' and w.row_status = 'active'",
    )
    support = run_psql_json(
        base,
        "select w.word_key, s.micro_skill_key, s.support_role "
        "from public.canonical_teaching_dictionary_word_support s "
        "join public.canonical_teaching_dictionary_words w on w.id = s.canonical_word_id "
        "where s.row_status = 'active' and w.row_status = 'active'",
    )
    overrides = run_psql_json(
        base,
        "select w.word_key, o.override_level "
        f"from public.{OVERRIDES_TABLE} o "
        "join public.canonical_teaching_dictionary_words w on w.id = o.canonical_word_id "
        "where o.row_status = 'active' and w.row_status = 'active'",
    )
    metadata = {
        row["word_key"]: {
            "syllables": row["syllables"],
            "phoneme_hint": row["phoneme_hint"],
            "has_schwa": row["has_schwa"],
            "morphemes": row["morphemes"],
            "irregularity_notes": row["irregularity_notes"],
        }
        for row in metadata_rows
    }
    override_levels = {row["word_key"]: int(row["override_level"]) for row in overrides}
    word_ids = {row["word_key"]: row["id"] for row in words}
    word_list = [{"word_key": row["word_key"], "normalised_word": row["normalised_word"]} for row in words]
    return word_list, metadata, support, override_levels, word_ids


def current_allocation(base: list[str]) -> dict[tuple[str, int], int]:
    rows = run_psql_json(
        base,
        f"select micro_skill_key, complexity_level, allocation from public.{ALLOCATION_TABLE} "
        f"where row_status = 'active' and banding_version = {quote_sql_literal(BANDING_VERSION)}",
    )
    return {(row["micro_skill_key"], int(row["complexity_level"])): int(row["allocation"]) for row in rows}


def allocation_deltas(before: dict[tuple[str, int], int], cells: list[dict[str, Any]]) -> list[dict[str, Any]]:
    after = {(cell["micro_skill_key"], cell["complexity_level"]): cell["allocation"] for cell in cells}
    deltas = []
    for key in sorted(set(before) | set(after)):
        old = before.get(key, 0)
        new = after.get(key, 0)
        if old != new:
            deltas.append({
                "micro_skill_key": key[0],
                "complexity_level": key[1],
                "allocation_before": old,
                "allocation_after": new,
            })
    return deltas


def apply_transaction_sql(
    banded: dict[str, dict[str, Any]],
    cells: list[dict[str, Any]],
    word_ids: dict[str, str],
    report: dict[str, Any],
) -> str:
    def sql_bool(value: bool) -> str:
        return "true" if value else "false"

    banding_values = []
    for word_key in sorted(banded):
        row = banded[word_key]
        word_id = word_ids[word_key]
        banding_values.append(
            "("
            + ", ".join([
                quote_sql_literal(word_id),
                quote_sql_literal(BANDING_VERSION),
                "(select id from _adle_banding_batch)",
                str(row["syllable_points"]),
                str(row["length_points"]),
                str(row["irregularity_class"]),
                str(row["irregularity_points"]),
                str(row["morphology_depth"]),
                str(row["morphology_points"]),
                sql_bool(row["has_schwa"]),
                sql_bool(row["mismatch_flag"]),
                quote_sql_literal(row["irregularity_note_source"]) if row["irregularity_note_source"] else "null",
                str(row["structural_score"]),
                str(row["complexity_level"]),
            ])
            + ")"
        )
    allocation_values = [
        "("
        + ", ".join([
            quote_sql_literal(cell["micro_skill_key"]),
            str(cell["complexity_level"]),
            str(cell["allocation"]),
            quote_sql_literal(BANDING_VERSION),
            "(select id from _adle_banding_batch)",
        ])
        + ")"
        for cell in cells
    ]

    summary_json = quote_sql_literal(json.dumps({
        "runner_version": RUNNER_VERSION,
        "banding_version": BANDING_VERSION,
        "word_count": report["word_count"],
        "skipped_word_count": report["skipped_word_count"],
        "level_distribution": report["level_distribution"],
        "populated_skill_level_cells": report["populated_skill_level_cells"],
        "new_note_values": report["new_note_values"],
    }, sort_keys=True, separators=(",", ":")))

    return f"""
begin;

select pg_advisory_xact_lock(hashtext({quote_sql_literal(ADVISORY_LOCK_NAME)}));

create temporary table _adle_banding_batch (id uuid not null) on commit preserve rows;

with inserted as (
  insert into public.{IMPORT_BATCH_TABLE} (
    source_folder_path, validator_version, validation_summary, row_counts,
    readiness_summary, import_mode, batch_status, source_metadata,
    imported_by, imported_at
  )
  values (
    {quote_sql_literal("adle-banding-run:" + BANDING_VERSION)},
    {quote_sql_literal(RUNNER_VERSION)},
    {summary_json}::jsonb,
    {quote_sql_literal(json.dumps({WORD_BANDING_TABLE: len(banding_values), ALLOCATION_TABLE: len(allocation_values)}, sort_keys=True))}::jsonb,
    '{{}}'::jsonb,
    'local_dev_import',
    'applied',
    {quote_sql_literal(json.dumps({"run_kind": "adle_banding_run", "formula_reference": FORMULA_REFERENCE}, sort_keys=True))}::jsonb,
    'adle_banding_runner',
    timezone('utc', now())
  )
  returning id
)
insert into _adle_banding_batch(id) select id from inserted;

-- Re-banding supersedes the version's previous active rows and inserts fresh
-- ones; overrides are never touched by this transaction.
update public.{WORD_BANDING_TABLE}
   set row_status = 'superseded', updated_at = timezone('utc', now())
 where banding_version = {quote_sql_literal(BANDING_VERSION)}
   and row_status = 'active';

insert into public.{WORD_BANDING_TABLE} (
  canonical_word_id, banding_version, import_batch_id,
  syllable_points, length_points, irregularity_class, irregularity_points,
  morphology_depth, morphology_points, has_schwa, mismatch_flag,
  irregularity_note_source, structural_score, complexity_level
)
values
{",".join(banding_values)};

update public.{ALLOCATION_TABLE}
   set row_status = 'superseded', updated_at = timezone('utc', now())
 where banding_version = {quote_sql_literal(BANDING_VERSION)}
   and row_status = 'active';

insert into public.{ALLOCATION_TABLE} (
  micro_skill_key, complexity_level, allocation, banding_version, import_batch_id
)
values
{",".join(allocation_values)};

do $$
declare
  banding_count integer;
  allocation_count integer;
begin
  select count(*) into banding_count from public.{WORD_BANDING_TABLE}
   where import_batch_id = (select id from _adle_banding_batch);
  if banding_count <> {len(banding_values)} then
    raise exception 'adle banding row-count verification failed';
  end if;
  select count(*) into allocation_count from public.{ALLOCATION_TABLE}
   where import_batch_id = (select id from _adle_banding_batch);
  if allocation_count <> {len(allocation_values)} then
    raise exception 'adle allocation row-count verification failed';
  end if;
end $$;

commit;

select jsonb_build_object(
  'actual_banding_run', true,
  'banding_batch_id', (select id::text from _adle_banding_batch),
  'banding_rows_inserted', {len(banding_values)},
  'allocation_rows_inserted', {len(allocation_values)},
  'status', 'local_banding_committed'
)::text;
""".strip()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Band the Teaching Dictionary with banding v1.1 (dry-run by default).")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--csv-folder", help="Candidate CSV export folder (report-only mode).")
    source.add_argument("--local-db-url", help="Local Supabase Postgres URL (guarded).")
    parser.add_argument("--report", help="JSON batch report output path.")
    parser.add_argument("--parity-oracle", help="Approved preview summary JSON to compare against; non-zero exit on drift.")
    parser.add_argument("--apply", action="store_true", help="Write banding + allocation rows (local DB mode only).")
    parser.add_argument(
        "--confirm-local-dev-banding",
        help=f"Required with --apply. Must equal {LOCAL_CONFIRMATION_TOKEN!r}.",
    )
    parser.add_argument("--psql-command", default="psql", help="psql executable for host mode.")
    parser.add_argument("--psql-mode", choices=("host", "docker"), default="host")
    parser.add_argument("--docker-container", help="Local Supabase DB container for docker psql mode.")
    args = parser.parse_args()

    if args.csv_folder:
        if args.apply:
            print("Refusing --apply in CSV mode: CSV runs are report-only. Use --local-db-url for a guarded apply.", file=sys.stderr)
            return 2
        folder = Path(args.csv_folder).expanduser().resolve()
        if not folder.is_dir():
            print(f"CSV folder not found: {folder}", file=sys.stderr)
            return 2
        words, metadata, support = load_csv_inputs(folder)
        outcome = run_banding(words, metadata, support, overrides_by_word_key={})
        outcome["report"]["mode"] = "csv_dry_run"
        outcome["report"]["input"] = str(folder)
    else:
        require_local_db_url(args.local_db_url)
        base = psql_command_base(args.local_db_url, args.psql_command, args.psql_mode, args.docker_container)
        db_preflight(base)
        words, metadata, support, override_levels, word_ids = load_db_inputs(base)
        outcome = run_banding(words, metadata, support, override_levels)
        outcome["report"]["mode"] = "local_db_dry_run"
        outcome["report"]["input"] = "local supabase (active dictionary rows)"
        outcome["report"]["allocation_deltas"] = allocation_deltas(current_allocation(base), outcome["allocation_cells"])

        if args.apply:
            if args.confirm_local_dev_banding != LOCAL_CONFIRMATION_TOKEN:
                print(
                    f"Refusing local banding apply without --confirm-local-dev-banding {LOCAL_CONFIRMATION_TOKEN!r}.",
                    file=sys.stderr,
                )
                return 2
            if not outcome["banded"]:
                print("Refusing to apply an empty banding run.", file=sys.stderr)
                return 2
            sql = apply_transaction_sql(outcome["banded"], outcome["allocation_cells"], word_ids, outcome["report"])
            output = run_psql_script_text(base, sql)
            apply_report = json.loads(output.splitlines()[-1] if output else "{}")
            outcome["report"]["mode"] = "local_db_apply"
            outcome["report"]["apply_result"] = apply_report

    report = outcome["report"]

    parity_failures: list[str] = []
    if args.parity_oracle:
        parity_failures = parity_check(report, Path(args.parity_oracle).expanduser().resolve())
        report["parity_oracle"] = args.parity_oracle
        report["parity_failures"] = parity_failures

    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"ADLE banding run ({report['mode']}) — {BANDING_VERSION}")
    print(f"Banded: {report['word_count']}  Skipped (fail closed): {report['skipped_word_count']}")
    print(f"Level distribution: {report['level_distribution']}")
    print(f"Allocation cells: {report['populated_skill_level_cells']}  under floor {ALLOCATION_FLOOR}: {report['cells_under_floor_8']}")
    if report["new_note_values"]:
        print(f"NEW irregularity note values needing review: {[n['irregularity_note'] for n in report['new_note_values']]}")
    if parity_failures:
        print("PARITY FAILURES vs approved preview:", file=sys.stderr)
        for failure in parity_failures:
            print(f"  {failure}", file=sys.stderr)
        return 1
    if args.parity_oracle:
        print("Parity with approved preview oracle: exact match")
    return 0


if __name__ == "__main__":
    sys.exit(main())
