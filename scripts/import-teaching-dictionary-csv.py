#!/usr/bin/env python3
"""Local/dev-only import planner for Phase 5 teaching dictionary CSV exports.

Dry-run is the default and does not connect to Supabase. The local apply paths
are explicitly guarded, refuse hosted targets, and are intended only for local
development after the Phase 5E migration has been applied locally.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import subprocess
import sys
import uuid
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = ROOT / "scripts/validate-teaching-dictionary-csv.py"
EXPECTED_MIGRATION_VERSION = "20260720100000"
LOCAL_CONFIRMATION_TOKEN = "canonical-teaching-dictionary-local-dev"
ADVISORY_LOCK_NAME = "canonical_teaching_dictionary_import"
VALIDATOR_VERSION = "version_3_phase_5c_teaching_dictionary_csv_v4"
UUID_NAMESPACE = uuid.UUID("12345678-1234-5678-1234-567812345678")

IMPORT_BATCH_TABLE = "canonical_teaching_dictionary_import_batches"
CONTENT_TABLES_IN_IMPORT_ORDER = [
    "canonical_teaching_dictionary_sources",
    "canonical_teaching_dictionary_words",
    "canonical_teaching_dictionary_word_metadata",
    "canonical_teaching_dictionary_word_support",
    "canonical_teaching_dictionary_dictation_sentences",
    "canonical_teaching_dictionary_base_word_families",
    "canonical_teaching_dictionary_base_word_family_members",
    "canonical_teaching_dictionary_content_versions",
    "canonical_teaching_dictionary_field_reviews",
    "canonical_teaching_dictionary_readiness_reports",
]
ALL_STORAGE_TABLES = [IMPORT_BATCH_TABLE, *CONTENT_TABLES_IN_IMPORT_ORDER]

CSV_FILES = [
    "canonical_words.csv",
    "canonical_word_metadata.csv",
    "micro_skill_word_support.csv",
    "teaching_content_versions.csv",
    "teaching_content_field_reviews.csv",
    "teaching_content_sources.csv",
    "base_word_families.csv",
    "base_word_family_members.csv",
    "dictation_sentences.csv",
]

PROTECTED_TABLES = [
    "micro_skill_catalog",
    "learning_items",
    "learning_item_evidence",
    "assignment_items",
    "spelling_canonical_mappings",
    "spelling_canonical_mapping_events",
    "spelling_canonical_mapping_recommendations",
    "spelling_catalog_review_cases",
    "child_word_treasures",
    "child_word_treasure_events",
]

CONTENT_TABLE_COLUMNS = {
    "canonical_teaching_dictionary_sources": [
        "id",
        "import_batch_id",
        "row_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "source_key",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "importability_status",
        "legal_review_status",
    ],
    "canonical_teaching_dictionary_words": [
        "id",
        "import_batch_id",
        "source_id",
        "row_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "word_key",
        "normalised_word",
        "display_word",
        "dialect_code",
        "frequency_band",
        "age_band",
        "complexity_band",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "confidence",
        "review_status",
    ],
    "canonical_teaching_dictionary_word_metadata": [
        "id",
        "import_batch_id",
        "canonical_word_id",
        "source_id",
        "row_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "syllables",
        "phoneme_hint",
        "grapheme_notes",
        "stress_pattern",
        "has_schwa",
        "morphemes",
        "morphology_notes",
        "irregularity_notes",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "confidence",
        "review_status",
    ],
    "canonical_teaching_dictionary_word_support": [
        "id",
        "import_batch_id",
        "canonical_word_id",
        "source_id",
        "row_status",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "micro_skill_key",
        "support_role",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "confidence",
        "review_status",
        "review_notes",
    ],
    "canonical_teaching_dictionary_dictation_sentences": [
        "id", "import_batch_id", "canonical_word_id", "row_status", "source_sheet",
        "source_row_number", "source_row_hash", "source_metadata", "dictation_sentence",
        "dictation_target_token_index", "audio_text", "source_category", "source_name",
        "source_url", "source_licence", "source_use_note", "confidence", "review_status",
        "reviewed_by", "reviewed_at",
    ],
    "canonical_teaching_dictionary_base_word_families": [
        "id", "import_batch_id", "base_family_key", "micro_skill_key", "base_word_id", "base_meaning", "etymology_route",
        "row_status", "source_sheet", "source_row_number", "source_row_hash", "source_metadata",
        "source_category", "source_name", "source_url", "source_licence", "source_use_note",
        "confidence", "review_status", "reviewed_by", "reviewed_at",
    ],
    "canonical_teaching_dictionary_base_word_family_members": [
        "id", "import_batch_id", "base_word_family_id", "canonical_word_id", "member_role", "word_sum",
        "morphology_parts", "morphology_joins", "transformation_notes", "dictation_sentence_id", "dictation_sentence",
        "dictation_target_token_index", "audio_text", "assignment_eligible", "row_status", "source_sheet",
        "source_row_number", "source_row_hash", "source_metadata", "source_category", "source_name",
        "source_url", "source_licence", "source_use_note", "confidence", "review_status", "reviewed_by", "reviewed_at",
    ],
    "canonical_teaching_dictionary_content_versions": [
        "id",
        "import_batch_id",
        "source_id",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "micro_skill_key",
        "content_version",
        "version_status",
        "is_active",
        "teaching_objective",
        "child_friendly_explanation",
        "rule_explanation",
        "memory_tip",
        "common_misconceptions",
        "first_exposure_progression",
        "guided_practice_progression",
        "review_proofreading_progression",
        "example_selection_guidance",
        "contrast_policy_guidance",
        "sample_preview_word_key",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "confidence",
        "supersedes_content_version",
        "final_readiness_review_status",
        "final_readiness_reviewed_by",
        "final_readiness_reviewed_at",
        "created_by",
    ],
    "canonical_teaching_dictionary_field_reviews": [
        "id",
        "import_batch_id",
        "teaching_content_version_id",
        "source_sheet",
        "source_row_number",
        "source_row_hash",
        "source_metadata",
        "field_key",
        "review_gate",
        "review_status",
        "reviewed_by",
        "reviewed_at",
        "review_notes",
    ],
    "canonical_teaching_dictionary_readiness_reports": [
        "id",
        "import_batch_id",
        "teaching_content_version_id",
        "validator_version",
        "readiness_state",
        "first_exposure_allowed",
        "guided_review_allowed",
        "blockers",
        "warnings",
        "p0_field_statuses",
        "p1_field_statuses",
        "p2_field_statuses",
        "source_summary",
        "licence_summary",
        "review_summary",
        "activity_progression_summary",
        "report_metadata",
        "generated_at",
    ],
}

JSONB_COLUMNS = {
    "source_metadata",
    "first_exposure_progression",
    "guided_practice_progression",
    "review_proofreading_progression",
    "blockers",
    "warnings",
    "p0_field_statuses",
    "p1_field_statuses",
    "p2_field_statuses",
    "source_summary",
    "licence_summary",
    "review_summary",
    "activity_progression_summary",
    "report_metadata",
    "morphology_parts",
    "morphology_joins",
}
BOOLEAN_COLUMNS = {"is_active", "first_exposure_allowed", "guided_review_allowed", "has_schwa", "assignment_eligible"}
INTEGER_COLUMNS = {"source_row_number", "dictation_target_token_index"}
NUMERIC_COLUMNS: set[str] = set()

UNIQUE_KEY_FIELDS = {
    "canonical_teaching_dictionary_sources": ["source_key"],
    "canonical_teaching_dictionary_words": ["word_key"],
    "canonical_teaching_dictionary_word_metadata": ["canonical_word_id"],
    "canonical_teaching_dictionary_word_support": ["canonical_word_id", "micro_skill_key", "support_role"],
    "canonical_teaching_dictionary_dictation_sentences": ["canonical_word_id"],
    "canonical_teaching_dictionary_base_word_families": ["base_family_key"],
    "canonical_teaching_dictionary_base_word_family_members": ["base_word_family_id", "canonical_word_id"],
    "canonical_teaching_dictionary_content_versions": ["micro_skill_key", "content_version"],
    "canonical_teaching_dictionary_field_reviews": ["teaching_content_version_id", "field_key", "review_gate"],
    "canonical_teaching_dictionary_readiness_reports": ["teaching_content_version_id"],
}

DB_CONFLICT_SQL = {
    "canonical_teaching_dictionary_sources": {
        "fields": ["source_key"],
        "where": "row_status = 'active'",
    },
    "canonical_teaching_dictionary_words": {
        "fields": ["word_key"],
        "where": "row_status = 'active'",
    },
    "canonical_teaching_dictionary_base_word_families": {
        "fields": ["base_family_key"],
        "where": "row_status = 'active'",
    },
    "canonical_teaching_dictionary_base_word_family_members": {
        "fields": ["base_word_family_id", "canonical_word_id"],
        "where": "row_status = 'active'",
    },
    "canonical_teaching_dictionary_content_versions": {
        "fields": ["micro_skill_key", "content_version"],
        "where": "true",
    },
}


class LocalPreflightError(ValueError):
    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.details = details or {}


def load_validator():
    spec = importlib.util.spec_from_file_location("teaching_dictionary_validator", VALIDATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load validator from {VALIDATOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def source_commit() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip() or None
    except (OSError, subprocess.CalledProcessError):
        return None


def quote_sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def quote_sql_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def sql_value(value: Any, jsonb: bool = False) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list)):
        literal = quote_sql_literal(json.dumps(value, sort_keys=True, separators=(",", ":")))
        return f"{literal}::jsonb" if jsonb else literal
    literal = quote_sql_literal(str(value))
    return f"{literal}::jsonb" if jsonb else literal


def clean(value: Any) -> str:
    return str(value or "").strip()


def parse_bool(value: str) -> bool | None:
    cleaned = clean(value).upper()
    if cleaned == "TRUE":
        return True
    if cleaned == "FALSE":
        return False
    if cleaned == "":
        return None
    raise ValueError(f"Expected TRUE/FALSE, got {value!r}.")


def parse_int(value: str) -> int | None:
    return None if clean(value) == "" else int(float(clean(value)))


def parse_float(value: str) -> float | None:
    return None if clean(value) == "" else float(clean(value))


def split_pipe(value: str) -> list[str]:
    return [part.strip() for part in clean(value).split("|") if part.strip()]


def folder_sha256(folder: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(folder.glob("*.csv")):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def stable_uuid(kind: str, key: str) -> str:
    return str(uuid.uuid5(UUID_NAMESPACE, f"{kind}:{key}"))


def stable_row_hash(file_name: str, row: dict[str, str]) -> str:
    content = {
        key: value
        for key, value in sorted(row.items())
        if key != "__row" and value not in ("", None)
    }
    payload = json.dumps({"file": file_name, "content": content}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def row_number(row: dict[str, str]) -> int:
    return int(row.get("__row") or 0)


def source_metadata(file_name: str, row: dict[str, str]) -> dict[str, Any]:
    return {
        "csv_file": file_name,
        "source_row_number": row_number(row),
        "row_source": {
            key: row.get(key)
            for key in ["source_category", "source_name", "source_url", "source_licence", "source_use_note"]
            if row.get(key)
        },
    }


def coerce_column(column: str, value: Any) -> Any:
    if column in JSONB_COLUMNS:
        return value
    if value == "":
        return None
    if column in BOOLEAN_COLUMNS:
        return parse_bool(str(value))
    if column in INTEGER_COLUMNS:
        return parse_int(str(value))
    if column in NUMERIC_COLUMNS:
        return parse_float(str(value))
    return value


def read_csv_folder_raw(validator: Any, folder: Path) -> dict[str, list[dict[str, str]]]:
    data, issues = validator.load_csv_folder(folder)
    header_errors = [issue for issue in issues if issue.severity == "error"]
    if header_errors:
        return data
    return data


def row_base(file_name: str, row: dict[str, str]) -> dict[str, Any]:
    return {
        "source_sheet": file_name,
        "source_row_number": row_number(row),
        "source_row_hash": stable_row_hash(file_name, row),
        "source_metadata": source_metadata(file_name, row),
    }


def build_planned_rows(folder: Path, validation_report: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    validator = load_validator()
    data = read_csv_folder_raw(validator, folder)
    planned: dict[str, list[dict[str, Any]]] = {table: [] for table in CONTENT_TABLES_IN_IMPORT_ORDER}

    source_ids: dict[str, str] = {}
    for row in data.get("teaching_content_sources.csv", []):
        source_key = clean(row["source_key"])
        row_id = stable_uuid("source", source_key)
        source_ids[source_key] = row_id
        planned["canonical_teaching_dictionary_sources"].append(
            {
                "id": row_id,
                "row_status": "active",
                **row_base("teaching_content_sources.csv", row),
                "source_key": source_key,
                "source_category": row["source_category"],
                "source_name": row["source_name"],
                "source_url": row["source_url"],
                "source_licence": row["source_licence"],
                "source_use_note": row["source_use_note"],
                "importability_status": row["importability_status"],
                "legal_review_status": row["legal_review_status"],
            }
        )

    word_ids: dict[str, str] = {}
    for row in data.get("canonical_words.csv", []):
        word_key = clean(row["word_key"])
        row_id = stable_uuid("word", word_key)
        word_ids[word_key] = row_id
        planned["canonical_teaching_dictionary_words"].append(
            {
                "id": row_id,
                "source_id": None,
                "row_status": row["row_status"],
                **row_base("canonical_words.csv", row),
                "word_key": word_key,
                "normalised_word": row["normalised_word"],
                "display_word": row["display_word"],
                "dialect_code": row["dialect_code"],
                "frequency_band": row["frequency_band"],
                "age_band": row["age_band"],
                "complexity_band": row["complexity_band"],
                "source_category": row["source_category"],
                "source_name": row["source_name"],
                "source_url": row["source_url"],
                "source_licence": row["source_licence"],
                "source_use_note": row["source_use_note"],
                "confidence": row["confidence"],
                "review_status": row["review_status"],
            }
        )

    for row in data.get("canonical_word_metadata.csv", []):
        word_key = clean(row["word_key"])
        planned["canonical_teaching_dictionary_word_metadata"].append(
            {
                "id": stable_uuid("word_metadata", word_key),
                "canonical_word_id": word_ids.get(word_key),
                "source_id": None,
                "row_status": "active",
                **row_base("canonical_word_metadata.csv", row),
                "syllables": row["syllables"],
                "phoneme_hint": row["phoneme_hint"],
                "grapheme_notes": row["grapheme_notes"],
                "stress_pattern": row["stress_pattern"],
                "has_schwa": row["has_schwa"],
                "morphemes": row["morphemes"],
                "morphology_notes": row["morphology_notes"],
                "irregularity_notes": row["irregularity_notes"],
                "source_category": row["source_category"],
                "source_name": row["source_name"],
                "source_url": row["source_url"],
                "source_licence": row["source_licence"],
                "source_use_note": row["source_use_note"],
                "confidence": row["confidence"],
                "review_status": row["review_status"],
            }
        )

    for row in data.get("dictation_sentences.csv", []):
        word_key = clean(row["word_key"])
        planned["canonical_teaching_dictionary_dictation_sentences"].append(
            {
                "id": stable_uuid("dictation_sentence", word_key),
                "canonical_word_id": word_ids.get(word_key),
                "row_status": "active",
                **row_base("dictation_sentences.csv", row),
                "dictation_sentence": row["dictation_sentence"],
                "dictation_target_token_index": row["dictation_target_token_index"],
                "audio_text": row["audio_text"],
                "source_category": row["source_category"],
                "source_name": row["source_name"],
                "source_url": row["source_url"],
                "source_licence": row["source_licence"],
                "source_use_note": row["source_use_note"],
                "confidence": row["confidence"],
                "review_status": row["review_status"],
                "reviewed_by": row["reviewed_by"],
                "reviewed_at": row["reviewed_at"],
            }
        )

    for row in data.get("micro_skill_word_support.csv", []):
        word_key = clean(row["word_key"])
        key = "|".join([word_key, clean(row["micro_skill_key"]), clean(row["support_role"])])
        planned["canonical_teaching_dictionary_word_support"].append(
            {
                "id": stable_uuid("word_support", key),
                "canonical_word_id": word_ids.get(word_key),
                "source_id": None,
                "row_status": "active",
                **row_base("micro_skill_word_support.csv", row),
                "micro_skill_key": row["micro_skill_key"],
                "support_role": row["support_role"],
                "source_category": row["source_category"],
                "source_name": row["source_name"],
                "source_url": row["source_url"],
                "source_licence": row["source_licence"],
                "source_use_note": row["source_use_note"],
                "confidence": row["confidence"],
                "review_status": row["review_status"],
                "review_notes": row["review_notes"],
            }
        )

    dictation_sentence_ids = {
        clean(row["word_key"]): stable_uuid("dictation_sentence", clean(row["word_key"]))
        for row in data.get("dictation_sentences.csv", [])
    }
    family_ids: dict[str, str] = {}
    for row in data.get("base_word_families.csv", []):
        family_key = clean(row["base_family_key"])
        row_id = stable_uuid("base_word_family", family_key)
        family_ids[family_key] = row_id
        planned["canonical_teaching_dictionary_base_word_families"].append(
            {
                "id": row_id,
                "base_family_key": family_key,
                "micro_skill_key": row["micro_skill_key"],
                "base_word_id": word_ids.get(clean(row["base_word_key"])),
                "base_meaning": row["base_meaning"],
                "etymology_route": json.loads(row["etymology_route"]),
                "row_status": "active",
                **row_base("base_word_families.csv", row),
                "source_category": row["source_category"],
                "source_name": row["source_name"],
                "source_url": row["source_url"],
                "source_licence": row["source_licence"],
                "source_use_note": row["source_use_note"],
                "confidence": row["confidence"],
                "review_status": row["review_status"],
                "reviewed_by": row["reviewed_by"],
                "reviewed_at": row["reviewed_at"],
            }
        )

    for row in data.get("base_word_family_members.csv", []):
        family_key = clean(row["base_family_key"])
        word_key = clean(row["word_key"])
        key = "|".join([family_key, word_key])
        planned["canonical_teaching_dictionary_base_word_family_members"].append(
            {
                "id": stable_uuid("base_word_family_member", key),
                "base_word_family_id": family_ids.get(family_key),
                "canonical_word_id": word_ids.get(word_key),
                "member_role": row["member_role"],
                "child_friendly_meaning": row["child_friendly_meaning"],
                "word_sum": row["word_sum"],
                "morphology_parts": json.loads(row["morphology_parts"]),
                "morphology_joins": json.loads(row["morphology_joins"]),
                "transformation_notes": row["transformation_notes"],
                "dictation_sentence_id": dictation_sentence_ids.get(word_key),
                "dictation_sentence": row["dictation_sentence"],
                "dictation_target_token_index": row["dictation_target_token_index"],
                "audio_text": row["audio_text"],
                "assignment_eligible": row["assignment_eligible"],
                "row_status": "active",
                **row_base("base_word_family_members.csv", row),
                "source_category": row["source_category"],
                "source_name": row["source_name"],
                "source_url": row["source_url"],
                "source_licence": row["source_licence"],
                "source_use_note": row["source_use_note"],
                "confidence": row["confidence"],
                "review_status": row["review_status"],
                "reviewed_by": row["reviewed_by"],
                "reviewed_at": row["reviewed_at"],
            }
        )

    content_ids: dict[tuple[str, str], str] = {}
    content_rows_by_key: dict[tuple[str, str], dict[str, str]] = {}
    for row in data.get("teaching_content_versions.csv", []):
        key = (clean(row["micro_skill_key"]), clean(row["content_version"]))
        row_id = stable_uuid("content_version", "|".join(key))
        content_ids[key] = row_id
        content_rows_by_key[key] = row
        planned["canonical_teaching_dictionary_content_versions"].append(
            {
                "id": row_id,
                "source_id": None,
                **row_base("teaching_content_versions.csv", row),
                "micro_skill_key": row["micro_skill_key"],
                "content_version": row["content_version"],
                "version_status": row["version_status"],
                "is_active": row["is_active"],
                "teaching_objective": row["teaching_objective"],
                "child_friendly_explanation": row["child_friendly_explanation"],
                "rule_explanation": row["rule_explanation"],
                "memory_tip": row["memory_tip"],
                "common_misconceptions": row["common_misconceptions"],
                "first_exposure_progression": split_pipe(row["first_exposure_progression"]),
                "guided_practice_progression": split_pipe(row["guided_practice_progression"]),
                "review_proofreading_progression": split_pipe(row["review_proofreading_progression"]),
                "example_selection_guidance": row["example_selection_guidance"],
                "contrast_policy_guidance": row["contrast_policy_guidance"],
                "sample_preview_word_key": row["sample_preview_word_key"],
                "source_category": row["source_category"],
                "source_name": row["source_name"],
                "source_url": row["source_url"],
                "source_licence": row["source_licence"],
                "source_use_note": row["source_use_note"],
                "confidence": row["confidence"],
                "supersedes_content_version": row["supersedes_content_version"],
                "final_readiness_review_status": row["final_readiness_review_status"],
                "final_readiness_reviewed_by": row["final_readiness_reviewed_by"],
                "final_readiness_reviewed_at": row["final_readiness_reviewed_at"],
                "created_by": "phase_5f_import_planner",
            }
        )

    field_review_ordinals: Counter[tuple[str, str]] = Counter()
    for row in data.get("teaching_content_field_reviews.csv", []):
        key = (clean(row["micro_skill_key"]), clean(row["content_version"]))
        field_review_ordinals[key] += 1
        stable_key = "|".join([*key, clean(row["field_key"]), clean(row["review_gate"]), str(field_review_ordinals[key])])
        planned["canonical_teaching_dictionary_field_reviews"].append(
            {
                "id": stable_uuid("field_review", stable_key),
                "teaching_content_version_id": content_ids.get(key),
                **row_base("teaching_content_field_reviews.csv", row),
                "field_key": row["field_key"],
                "review_gate": row["review_gate"],
                "review_status": row["review_status"],
                "reviewed_by": row["reviewed_by"],
                "reviewed_at": row["reviewed_at"],
                "review_notes": row["review_notes"],
            }
        )

    for version in validation_report.get("versions", []):
        key = (clean(version["micro_skill_key"]), clean(version["content_version"]))
        csv_row = content_rows_by_key.get(key, {})
        planned["canonical_teaching_dictionary_readiness_reports"].append(
            {
                "id": stable_uuid("readiness_report", "|".join(key)),
                "teaching_content_version_id": content_ids.get(key),
                "validator_version": validation_report.get("schema_version", VALIDATOR_VERSION),
                "readiness_state": version["readiness_state"],
                "first_exposure_allowed": version["first_exposure_allowed"],
                "guided_review_allowed": version["guided_review_allowed"],
                "blockers": version["blockers"],
                "warnings": version["warnings"],
                "p0_field_statuses": [],
                "p1_field_statuses": [],
                "p2_field_statuses": [],
                "source_summary": version.get("source_summary", {}),
                "licence_summary": {
                    "source_licence": csv_row.get("source_licence", ""),
                    "source_use_note": csv_row.get("source_use_note", ""),
                },
                "review_summary": version.get("review_summary", {}),
                "activity_progression_summary": {
                    "first_exposure_progression": split_pipe(csv_row.get("first_exposure_progression", "")),
                    "guided_practice_progression": split_pipe(csv_row.get("guided_practice_progression", "")),
                    "review_proofreading_progression": split_pipe(
                        csv_row.get("review_proofreading_progression", "")
                    ),
                },
                "report_metadata": {
                    "validator_generated_at": validation_report.get("generated_at"),
                    "dry_run_only": validation_report.get("dry_run_only", True),
                },
                "generated_at": validation_report.get("generated_at"),
            }
        )

    return planned


def duplicate_summary(planned: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for table, rows in planned.items():
        fields = UNIQUE_KEY_FIELDS[table]
        counts: Counter[tuple[Any, ...]] = Counter()
        rows_by_key: dict[tuple[Any, ...], list[int]] = defaultdict(list)
        for row in rows:
            key = tuple(row.get(field) for field in fields)
            counts[key] += 1
            rows_by_key[key].append(row.get("source_row_number", 0))
        duplicates = [
            {
                "key": dict(zip(fields, key)),
                "count": count,
                "source_rows": rows_by_key[key],
            }
            for key, count in counts.items()
            if count > 1
        ]
        summary[table] = {
            "unique_key_fields": fields,
            "duplicate_count": len(duplicates),
            "duplicates": duplicates,
        }
    return summary


def planned_micro_skill_keys(planned: dict[str, list[dict[str, Any]]]) -> list[str]:
    keys: set[str] = set()
    for table in [
        "canonical_teaching_dictionary_word_support",
        "canonical_teaching_dictionary_content_versions",
    ]:
        for row in planned.get(table, []):
            value = row.get("micro_skill_key")
            if value:
                keys.add(str(value))
    return sorted(keys)


def build_manifest(folder: Path, include_planned_rows: bool = False) -> dict[str, Any]:
    validator = load_validator()
    validation_report = validator.validate(folder)
    validation_report["generated_at"] = "1970-01-01T00:00:00+00:00"
    folder_hash = folder_sha256(folder)

    base = {
        "mode": "dry_run",
        "read_only": True,
        "actual_import_run": False,
        "csv_folder": str(folder),
        "source_folder_sha256": folder_hash,
        "source_commit": source_commit(),
        "validator_version": validation_report.get("schema_version", VALIDATOR_VERSION),
        "validation": validation_report,
        "readiness_summary": validation_report["summary"],
        "status": "blocked_by_validation_errors" if validation_report["summary"]["errors"] else "ready_for_local_preflight",
    }
    if validation_report["summary"]["errors"]:
        return {
            **base,
            "planned_inserts_by_table": {},
            "duplicate_conflict_summary": {"workbook_duplicates": {}, "database_conflicts": "not_checked_in_dry_run"},
            "blocked_rows": validation_report["issues"],
        }

    planned = build_planned_rows(folder, validation_report)
    duplicates = duplicate_summary(planned)
    duplicate_blockers = [
        {"table": table, **details}
        for table, details in duplicates.items()
        if details["duplicate_count"] > 0
    ]
    planned_counts = {table: len(rows) for table, rows in planned.items()}
    csv_data, _csv_issues = validator.load_csv_folder(folder)
    row_counts = {file_name: len(csv_data.get(file_name, [])) for file_name in CSV_FILES}

    manifest = {
        **base,
        "row_counts_by_csv": row_counts,
        "planned_inserts_by_table": planned_counts,
        "planned_micro_skill_keys": planned_micro_skill_keys(planned),
        "duplicate_conflict_summary": {
            "workbook_duplicates": duplicates,
            "database_conflicts": "not_checked_in_dry_run",
        },
        "blocked_rows": duplicate_blockers,
        "status": "blocked_by_duplicate_rows" if duplicate_blockers else "ready_for_local_preflight",
    }
    if include_planned_rows:
        manifest["planned_rows_by_table"] = planned
    return manifest


def require_local_db_url(db_url: str) -> dict[str, Any]:
    parsed = urlparse(db_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("Local DB URL must use postgres:// or postgresql://.")
    if parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("Refusing non-local database host. Expected localhost or 127.0.0.1.")
    if parsed.port != 54322:
        raise ValueError("Refusing non-local Supabase port. Expected local Postgres port 54322.")
    if (parsed.path or "").lstrip("/") != "postgres":
        raise ValueError("Refusing non-local Supabase database. Expected database name postgres.")
    return {
        "scheme": parsed.scheme,
        "host": parsed.hostname,
        "port": parsed.port,
        "database": (parsed.path or "").lstrip("/"),
        "username": parsed.username,
    }


def run_psql_json(
    db_url: str,
    sql: str,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> Any:
    wrapped_sql = (
        "select coalesce(jsonb_agg(row_to_json(result_rows)), '[]'::jsonb) "
        f"from ({sql}) result_rows"
    )
    if psql_mode == "host":
        command = [
            psql_command,
            db_url,
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            wrapped_sql,
        ]
    elif psql_mode == "docker":
        if not docker_container:
            raise ValueError("--docker-container is required when --psql-mode docker is used.")
        command = [
            "docker",
            "exec",
            "-i",
            docker_container,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            wrapped_sql,
        ]
    else:
        raise ValueError(f"Unsupported psql mode: {psql_mode!r}.")

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise ValueError(detail or f"{command[0]} exited with status {result.returncode}")
    return json.loads(result.stdout.strip() or "[]")


def run_psql_script_text(
    db_url: str,
    sql: str,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> str:
    if psql_mode == "host":
        command = [
            psql_command,
            db_url,
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "-v",
            "ON_ERROR_STOP=1",
        ]
    elif psql_mode == "docker":
        if not docker_container:
            raise ValueError("--docker-container is required when --psql-mode docker is used.")
        command = [
            "docker",
            "exec",
            "-i",
            docker_container,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "--no-psqlrc",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "-v",
            "ON_ERROR_STOP=1",
        ]
    else:
        raise ValueError(f"Unsupported psql mode: {psql_mode!r}.")
    result = subprocess.run(command, input=sql, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise ValueError(detail or f"{command[0]} exited with status {result.returncode}")
    return result.stdout.strip()


def db_existing_tables(
    db_url: str,
    tables: list[str],
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> set[str]:
    rows = run_psql_json(
        db_url,
        (
            "select table_name from information_schema.tables "
            "where table_schema = 'public' "
            "and table_name = any (array["
            + ", ".join(quote_sql_literal(table) for table in tables)
            + "])"
        ),
        psql_command,
        psql_mode,
        docker_container,
    )
    return {row["table_name"] for row in rows}


def db_count_by_table(
    db_url: str,
    tables: list[str],
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, int]:
    if not tables:
        return {}
    selects = [
        f"select {quote_sql_literal(table)} as table_name, count(*)::integer as row_count from public.{table}"
        for table in tables
    ]
    rows = run_psql_json(db_url, " union all ".join(selects), psql_command, psql_mode, docker_container)
    return {row["table_name"]: int(row["row_count"]) for row in rows}


def local_audit_counts(
    db_url: str,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, Any]:
    protected_existing_tables = sorted(
        db_existing_tables(db_url, PROTECTED_TABLES, psql_command, psql_mode, docker_container)
    )
    protected_counts = db_count_by_table(db_url, protected_existing_tables, psql_command, psql_mode, docker_container)
    storage_counts = db_count_by_table(db_url, ALL_STORAGE_TABLES, psql_command, psql_mode, docker_container)
    return {
        "storage_tables": {
            "expected": ALL_STORAGE_TABLES,
            "row_counts_before": storage_counts,
        },
        "protected_tables": {
            "tables_checked": PROTECTED_TABLES,
            "missing_from_local_schema": sorted(set(PROTECTED_TABLES) - set(protected_existing_tables)),
            "row_counts_before": protected_counts,
            "mutation_allowed": False,
        },
    }


def planned_values(rows: list[dict[str, Any]], fields: list[str]) -> str:
    values = []
    for row in rows:
        values.append("(" + ", ".join(sql_value(row.get(field)) for field in fields) + ")")
    return ", ".join(values)


def db_conflict_summary(
    db_url: str,
    planned: dict[str, list[dict[str, Any]]],
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for table, config in DB_CONFLICT_SQL.items():
        rows = planned.get(table, [])
        fields = config["fields"]
        if not rows:
            summary[table] = {"conflict_count": 0, "conflicts": []}
            continue
        aliases = [f"k{index}" for index, _ in enumerate(fields)]
        comparisons = " and ".join(
            f"coalesce(active.{quote_sql_identifier(field)}::text, '') = coalesce(incoming.{alias}::text, '')"
            for field, alias in zip(fields, aliases)
        )
        select_columns = ", ".join(f"incoming.{alias} as {field}" for alias, field in zip(aliases, fields))
        sql = f"""
            select distinct {select_columns}
            from (values {planned_values(rows, fields)}) as incoming({", ".join(aliases)})
            join public.{table} active
              on {config["where"]}
             and {comparisons}
            limit 50
        """
        conflicts = run_psql_json(db_url, sql, psql_command, psql_mode, docker_container)
        summary[table] = {"conflict_count": len(conflicts), "conflicts": conflicts}
    return summary


def db_missing_micro_skill_keys(
    db_url: str,
    keys: list[str],
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> list[str]:
    if not keys:
        return []
    values_sql = ", ".join(f"({quote_sql_literal(key)})" for key in keys)
    rows = run_psql_json(
        db_url,
        f"""
            select planned.micro_skill_key
            from (values {values_sql}) as planned(micro_skill_key)
            left join public.micro_skill_catalog catalog
              on catalog.micro_skill_key = planned.micro_skill_key
            where catalog.micro_skill_key is null
            order by planned.micro_skill_key
        """,
        psql_command,
        psql_mode,
        docker_container,
    )
    return [row["micro_skill_key"] for row in rows]


def db_active_signed_off_content_conflicts(
    db_url: str,
    planned_content_rows: list[dict[str, Any]],
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> list[dict[str, Any]]:
    active_skill_keys = sorted(
        {
            str(row["micro_skill_key"])
            for row in planned_content_rows
            if row["is_active"] == "TRUE"
            and row["version_status"] == "active"
            and row["final_readiness_review_status"] == "signed_off"
        }
    )
    if not active_skill_keys:
        return []

    values_sql = ", ".join(f"({quote_sql_literal(key)})" for key in active_skill_keys)
    return run_psql_json(
        db_url,
        f"""
            select active.micro_skill_key, active.content_version, active.id::text as existing_content_version_id
            from (values {values_sql}) as incoming(micro_skill_key)
            join public.canonical_teaching_dictionary_content_versions active
              on active.micro_skill_key = incoming.micro_skill_key
             and active.is_active = true
             and active.version_status = 'active'
             and active.final_readiness_review_status = 'signed_off'
            order by active.micro_skill_key, active.content_version
        """,
        psql_command,
        psql_mode,
        docker_container,
    )


def local_apply_preflight(
    manifest: dict[str, Any],
    db_url: str,
    confirmation_token: str | None,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, Any]:
    if confirmation_token != LOCAL_CONFIRMATION_TOKEN:
        raise ValueError(
            f"Refusing local teaching dictionary import without --confirm-local-dev-import {LOCAL_CONFIRMATION_TOKEN!r}."
        )
    target = require_local_db_url(db_url)
    if manifest["validation"]["summary"]["errors"]:
        raise ValueError("Refusing local preflight because validator reported structural errors.")
    if manifest.get("blocked_rows"):
        raise ValueError("Refusing local preflight because the import manifest has blocked rows.")

    migration_rows = run_psql_json(
        db_url,
        (
            "select version from supabase_migrations.schema_migrations "
            f"where version = {quote_sql_literal(EXPECTED_MIGRATION_VERSION)}"
        ),
        psql_command,
        psql_mode,
        docker_container,
    )
    if not migration_rows:
        raise ValueError(f"Migration ledger is missing {EXPECTED_MIGRATION_VERSION}.")

    found_tables = db_existing_tables(db_url, ALL_STORAGE_TABLES, psql_command, psql_mode, docker_container)
    missing_tables = sorted(set(ALL_STORAGE_TABLES) - found_tables)
    if missing_tables:
        raise ValueError(f"Missing teaching dictionary storage tables: {missing_tables}.")

    audit_counts = local_audit_counts(db_url, psql_command, psql_mode, docker_container)
    planned = manifest["planned_rows_by_table"]
    missing_skill_keys = db_missing_micro_skill_keys(
        db_url,
        manifest["planned_micro_skill_keys"],
        psql_command,
        psql_mode,
        docker_container,
    )
    if missing_skill_keys:
        raise LocalPreflightError(
            "Missing local micro_skill_catalog keys required by teaching dictionary rows.",
            {
                "micro_skill_catalog_fk_readiness": {
                    "planned_key_count": len(manifest["planned_micro_skill_keys"]),
                    "missing_key_count": len(missing_skill_keys),
                    "missing_micro_skill_keys": missing_skill_keys,
                },
                **audit_counts,
            },
        )

    conflicts = db_conflict_summary(db_url, planned, psql_command, psql_mode, docker_container)
    conflict_blockers = {table: details for table, details in conflicts.items() if details["conflict_count"] > 0}
    if conflict_blockers:
        raise ValueError(f"Active database conflicts would block import: {json.dumps(conflict_blockers)}")

    active_signed_off = [
        row
        for row in planned["canonical_teaching_dictionary_content_versions"]
        if row["is_active"] == "TRUE"
        and row["version_status"] == "active"
        and row["final_readiness_review_status"] == "signed_off"
    ]
    active_counts = Counter(row["micro_skill_key"] for row in active_signed_off)
    duplicate_active = sorted(skill for skill, count in active_counts.items() if count > 1)
    if duplicate_active:
        raise ValueError(f"Planned rows contain duplicate active signed-off content versions: {duplicate_active}")

    existing_active_conflicts = db_active_signed_off_content_conflicts(
        db_url,
        planned["canonical_teaching_dictionary_content_versions"],
        psql_command,
        psql_mode,
        docker_container,
    )
    if existing_active_conflicts:
        raise ValueError(
            "Existing active signed-off teaching content would block import: "
            f"{json.dumps(existing_active_conflicts)}"
        )

    return {
        "mode": "apply_local_preflight",
        "actual_import_run": False,
        "target_environment": {
            **target,
            "classification": "local_dev_only",
            "psql_mode": psql_mode,
            "docker_container": docker_container if psql_mode == "docker" else None,
        },
        "migration_ledger": {
            "required_version": EXPECTED_MIGRATION_VERSION,
            "present": True,
        },
        **audit_counts,
        "database_conflicts": conflicts,
        "existing_active_signed_off_content_conflicts": existing_active_conflicts,
        "micro_skill_catalog_fk_readiness": {
            "planned_key_count": len(manifest["planned_micro_skill_keys"]),
            "missing_key_count": 0,
            "missing_micro_skill_keys": [],
        },
        "transaction_plan": {
            "will_acquire_advisory_xact_lock": True,
            "advisory_lock_name": ADVISORY_LOCK_NAME,
            "transaction_scope": "single transaction for import batch and all teaching dictionary rows",
            "rollback_behavior": "any failed insert, FK violation, duplicate, row-count mismatch, or protected-count change rolls back the full batch",
            "import_order": [IMPORT_BATCH_TABLE, *CONTENT_TABLES_IN_IMPORT_ORDER],
            "row_count_verification": "planned inserts by table must exactly match inserted rows by import_batch_id before commit",
            "deletion_policy": "no deletion; future rollback uses batch/content row_status deactivation",
        },
        "status": "local_apply_preflight_ready_no_import_run",
    }


def insert_statement(table: str, rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    columns = CONTENT_TABLE_COLUMNS[table]
    column_sql = ", ".join(quote_sql_identifier(column) for column in columns)
    values_sql: list[str] = []
    for row in rows:
        values: list[str] = []
        for column in columns:
            if column == "import_batch_id":
                values.append("(select id from _teaching_dictionary_import_batch)")
            else:
                values.append(sql_value(coerce_column(column, row.get(column)), jsonb=column in JSONB_COLUMNS))
        values_sql.append("(" + ", ".join(values) + ")")
    return f"insert into public.{table} ({column_sql})\nvalues\n" + ",\n".join(values_sql) + ";"


def protected_counts_values(protected_counts: dict[str, int]) -> str:
    return ", ".join(f"({quote_sql_literal(table)}, {int(count)})" for table, count in sorted(protected_counts.items()))


def protected_count_selects(tables: list[str]) -> str:
    return " union all ".join(
        f"select {quote_sql_literal(table)} as table_name, count(*)::integer as row_count from public.{table}"
        for table in tables
    )


def content_count_selects() -> str:
    return " union all ".join(
        (
            f"select {quote_sql_literal(table)} as table_name, "
            f"count(*)::integer as row_count from public.{table} "
            "where import_batch_id = (select id from _teaching_dictionary_import_batch)"
        )
        for table in CONTENT_TABLES_IN_IMPORT_ORDER
    )


def planned_counts_values(planned_counts: dict[str, int]) -> str:
    return ", ".join(f"({quote_sql_literal(table)}, {int(planned_counts[table])})" for table in CONTENT_TABLES_IN_IMPORT_ORDER)


def local_import_transaction_sql(manifest: dict[str, Any], preflight: dict[str, Any]) -> str:
    planned = manifest["planned_rows_by_table"]
    planned_counts = {table: len(rows) for table, rows in planned.items()}
    protected_before = preflight["protected_tables"]["row_counts_before"]
    protected_tables = sorted(protected_before)
    insert_statements = "\n\n".join(insert_statement(table, planned[table]) for table in CONTENT_TABLES_IN_IMPORT_ORDER)

    return f"""
begin;

select pg_advisory_xact_lock(hashtext({quote_sql_literal(ADVISORY_LOCK_NAME)}));

create temporary table _teaching_dictionary_import_batch (
  id uuid not null
) on commit preserve rows;

create temporary table _teaching_dictionary_protected_counts_before (
  table_name text primary key,
  row_count integer not null
) on commit preserve rows;

insert into _teaching_dictionary_protected_counts_before(table_name, row_count)
values {protected_counts_values(protected_before)};

with inserted as (
  insert into public.{IMPORT_BATCH_TABLE} (
    source_folder_path,
    source_folder_sha256,
    source_commit,
    validator_version,
    validation_summary,
    row_counts,
    readiness_summary,
    import_mode,
    batch_status,
    source_metadata,
    imported_by,
    imported_at
  )
  values (
    {sql_value(manifest["csv_folder"])},
    {sql_value(manifest["source_folder_sha256"])},
    {sql_value(manifest.get("source_commit"))},
    {sql_value(manifest["validator_version"])},
    {sql_value(manifest["validation"]["summary"], jsonb=True)},
    {sql_value(manifest["row_counts_by_csv"], jsonb=True)},
    {sql_value(manifest["readiness_summary"], jsonb=True)},
    'local_dev_import',
    'applied',
    {sql_value({"csv_folder": manifest["csv_folder"]}, jsonb=True)},
    'phase_5f_local_dev_import',
    timezone('utc', now())
  )
  returning id
)
insert into _teaching_dictionary_import_batch(id)
select id from inserted;

{insert_statements}

do $$
declare
  mismatch_count integer;
  protected_mismatch_count integer;
begin
  with planned(table_name, row_count) as (
    values {planned_counts_values(planned_counts)}
  ),
  actual as (
    {content_count_selects()}
  )
  select count(*) into mismatch_count
  from planned
  join actual using (table_name)
  where planned.row_count <> actual.row_count;

  if mismatch_count <> 0 then
    raise exception 'teaching dictionary import row-count verification failed';
  end if;

  with protected_after as (
    {protected_count_selects(protected_tables)}
  )
  select count(*) into protected_mismatch_count
  from _teaching_dictionary_protected_counts_before before_counts
  join protected_after after_counts using (table_name)
  where before_counts.row_count <> after_counts.row_count;

  if protected_mismatch_count <> 0 then
    raise exception 'teaching dictionary import changed protected table counts';
  end if;
end $$;

commit;

with inserted_counts as (
  {content_count_selects()}
),
protected_after as (
  {protected_count_selects(protected_tables)}
)
select jsonb_build_object(
  'actual_import_run', true,
  'import_batch_id', (select id::text from _teaching_dictionary_import_batch),
  'inserted_counts_by_table', (
    select jsonb_object_agg(table_name, row_count) from inserted_counts
  ),
  'protected_counts_before', (
    select jsonb_object_agg(table_name, row_count) from _teaching_dictionary_protected_counts_before
  ),
  'protected_counts_after', (
    select jsonb_object_agg(table_name, row_count) from protected_after
  ),
  'row_count_verification', 'passed',
  'protected_table_verification', 'passed',
  'status', 'local_import_committed'
)::text;
""".strip()


def run_local_import_transaction(
    manifest: dict[str, Any],
    preflight: dict[str, Any],
    db_url: str,
    psql_command: str,
    psql_mode: str,
    docker_container: str | None,
) -> dict[str, Any]:
    sql = local_import_transaction_sql(manifest, preflight)
    output = run_psql_script_text(db_url, sql, psql_command, psql_mode, docker_container)
    report_line = output.splitlines()[-1] if output else "{}"
    return json.loads(report_line)


def print_summary(manifest: dict[str, Any]) -> None:
    print("Teaching Dictionary CSV Import Plan")
    print(f"Input: {manifest['csv_folder']}")
    print(f"Status: {manifest['status']}")
    print(f"Validator errors: {manifest['validation']['summary']['errors']}")
    print(f"Validator warnings: {manifest['validation']['summary']['warnings']}")
    if manifest.get("planned_inserts_by_table"):
        print("Planned inserts:")
        for table, count in manifest["planned_inserts_by_table"].items():
            print(f"  {table}: {count}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Plan or locally import Phase 5 teaching dictionary CSV exports.")
    parser.add_argument("csv_folder", help="Folder containing teaching dictionary CSV exports.")
    parser.add_argument("--report", help="Optional JSON manifest output path.")
    parser.add_argument("--apply", action="store_true", help="Refused. Use --apply-local or --apply-local-import.")
    parser.add_argument("--apply-local", action="store_true", help="Run local/dev preflight only; performs no inserts.")
    parser.add_argument("--apply-local-import", action="store_true", help="Run guarded local/dev import transaction after preflight.")
    parser.add_argument("--local-db-url", help="Explicit local Supabase Postgres URL.")
    parser.add_argument(
        "--confirm-local-dev-import",
        help=f"Required for local paths. Must equal {LOCAL_CONFIRMATION_TOKEN!r}.",
    )
    parser.add_argument("--psql-command", default="psql", help="psql executable for host mode.")
    parser.add_argument("--psql-mode", choices=("host", "docker"), default="host")
    parser.add_argument("--docker-container", help="Local Supabase DB container for docker psql mode.")
    args = parser.parse_args()

    if args.apply:
        print("Refusing --apply: generic apply remains disabled. Use --apply-local preflight.", file=sys.stderr)
        return 2
    if (args.apply_local or args.apply_local_import) and not args.local_db_url:
        print("Refusing local apply path without --local-db-url.", file=sys.stderr)
        return 2

    folder = Path(args.csv_folder).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        print(f"CSV folder not found: {folder}", file=sys.stderr)
        return 2

    manifest = build_manifest(folder, include_planned_rows=args.apply_local or args.apply_local_import)

    if args.apply_local or args.apply_local_import:
        try:
            manifest["local_apply_preflight"] = local_apply_preflight(
                manifest=manifest,
                db_url=args.local_db_url,
                confirmation_token=args.confirm_local_dev_import,
                psql_command=args.psql_command,
                psql_mode=args.psql_mode,
                docker_container=args.docker_container,
            )
            manifest["mode"] = "apply_local_preflight"
            manifest["actual_import_run"] = False
            manifest["read_only"] = not args.apply_local_import
            manifest["status"] = "local_apply_preflight_ready_no_import_run"
            if args.apply_local_import:
                import_report = run_local_import_transaction(
                    manifest=manifest,
                    preflight=manifest["local_apply_preflight"],
                    db_url=args.local_db_url,
                    psql_command=args.psql_command,
                    psql_mode=args.psql_mode,
                    docker_container=args.docker_container,
                )
                manifest["local_import"] = import_report
                manifest["mode"] = "apply_local_import"
                manifest["read_only"] = False
                manifest["actual_import_run"] = True
                manifest["status"] = import_report.get("status", "local_import_completed")
        except (OSError, ValueError) as error:
            manifest["mode"] = "apply_local_preflight"
            manifest["read_only"] = not args.apply_local_import
            manifest["actual_import_run"] = False
            manifest["status"] = "local_apply_preflight_blocked"
            manifest["local_apply_error"] = {
                "message": str(error),
                "details": getattr(error, "details", {}),
            }
            if args.report:
                report_path = Path(args.report)
                report_path.parent.mkdir(parents=True, exist_ok=True)
                report_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            print_summary(manifest)
            print(f"Local apply blocked: {error}", file=sys.stderr)
            return 2

    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print_summary(manifest)
    return 2 if manifest["validation"]["summary"]["errors"] or manifest.get("blocked_rows") else 0


if __name__ == "__main__":
    raise SystemExit(main())
