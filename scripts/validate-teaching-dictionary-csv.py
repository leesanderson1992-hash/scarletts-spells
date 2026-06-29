#!/usr/bin/env python3
"""Read-only validator for Phase 5C teaching dictionary CSV exports.

This script intentionally avoids Supabase, migrations, imports, runtime
consumers, and generated teaching content. It reads a folder of CSV files and
local D4 seed artifacts only, then prints a readiness summary. It may write a
local JSON report only when --report is provided.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
EXPANDED_CATALOG = ROOT / "docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json"
SCHEMA_VERSION = "version_3_phase_5c_teaching_dictionary_csv_v1"

REQUIRED_FILES = {
    "canonical_words.csv": [
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
        "row_status",
    ],
    "canonical_word_metadata.csv": [
        "word_key",
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
    "canonical_word_micro_skills.csv": [
        "word_key",
        "micro_skill_key",
        "micro_skill_role",
        "difficulty_band",
        "evidence_weight",
        "display_order",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "confidence",
        "review_status",
    ],
    "teaching_content_versions.csv": [
        "micro_skill_key",
        "content_version",
        "version_status",
        "is_active",
        "teaching_objective",
        "child_friendly_explanation",
        "rule_explanation",
        "memory_tip",
        "anchor_word_key",
        "ordered_example_word_keys",
        "contrast_word_keys",
        "common_misconceptions",
        "first_exposure_progression",
        "review_progression",
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
    ],
    "teaching_content_field_reviews.csv": [
        "micro_skill_key",
        "content_version",
        "field_key",
        "review_gate",
        "review_status",
        "reviewed_by",
        "reviewed_at",
        "review_notes",
    ],
}

OPTIONAL_FILES = {
    "teaching_content_sources.csv": [
        "source_key",
        "source_category",
        "source_name",
        "source_url",
        "source_licence",
        "source_use_note",
        "importability_status",
        "legal_review_status",
    ]
}

SOURCE_CATEGORIES = {
    "internal_authored",
    "internal_reviewed_seed",
    "public_domain",
    "open_licensed",
    "licensed_vendor",
    "reference_only",
    "ai_assisted_draft",
}
REVIEW_STATUSES = {
    "draft",
    "ai_draft",
    "in_review",
    "changes_requested",
    "approved_for_guided_review",
    "approved_for_first_exposure",
    "rejected",
    "superseded",
}
VERSION_STATUSES = {
    "draft",
    "in_review",
    "changes_requested",
    "active",
    "rejected",
    "superseded",
    "archived",
}
FINAL_REVIEW_STATUSES = {"not_started", "in_review", "changes_requested", "signed_off", "rejected"}
REVIEW_GATES = {
    "source_licence",
    "pedagogy",
    "child_language",
    "british_english",
    "accessibility",
    "legal",
    "final_readiness",
}
IMPORTABILITY_STATUSES = {
    "importable",
    "reference_only",
    "requires_legal_review",
    "not_importable",
    "unknown",
}
LEGAL_REVIEW_STATUSES = {"not_required", "required", "passed", "failed", "unknown"}
ROW_STATUSES = {"draft", "active", "rejected", "superseded"}
CONFIDENCE_VALUES = {"low", "medium", "high"}
DIFFICULTY_BANDS = {"low", "medium", "high"}
BOOLEAN_VALUES = {"TRUE", "FALSE"}
MICRO_SKILL_ROLES = {"anchor", "ordered_example", "contrast", "diagnostic", "route_support", "review_example"}

ENUM_COLUMNS = {
    ("canonical_words.csv", "source_category"): SOURCE_CATEGORIES,
    ("canonical_words.csv", "review_status"): REVIEW_STATUSES,
    ("canonical_words.csv", "row_status"): ROW_STATUSES,
    ("canonical_words.csv", "confidence"): CONFIDENCE_VALUES,
    ("canonical_word_metadata.csv", "source_category"): SOURCE_CATEGORIES,
    ("canonical_word_metadata.csv", "review_status"): REVIEW_STATUSES,
    ("canonical_word_metadata.csv", "confidence"): CONFIDENCE_VALUES,
    ("canonical_word_metadata.csv", "has_schwa"): BOOLEAN_VALUES,
    ("canonical_word_micro_skills.csv", "source_category"): SOURCE_CATEGORIES,
    ("canonical_word_micro_skills.csv", "review_status"): REVIEW_STATUSES,
    ("canonical_word_micro_skills.csv", "confidence"): CONFIDENCE_VALUES,
    ("canonical_word_micro_skills.csv", "difficulty_band"): DIFFICULTY_BANDS,
    ("canonical_word_micro_skills.csv", "micro_skill_role"): MICRO_SKILL_ROLES,
    ("teaching_content_versions.csv", "source_category"): SOURCE_CATEGORIES,
    ("teaching_content_versions.csv", "version_status"): VERSION_STATUSES,
    ("teaching_content_versions.csv", "final_readiness_review_status"): FINAL_REVIEW_STATUSES,
    ("teaching_content_versions.csv", "confidence"): CONFIDENCE_VALUES,
    ("teaching_content_versions.csv", "is_active"): BOOLEAN_VALUES,
    ("teaching_content_field_reviews.csv", "review_status"): REVIEW_STATUSES,
    ("teaching_content_field_reviews.csv", "review_gate"): REVIEW_GATES,
    ("teaching_content_sources.csv", "source_category"): SOURCE_CATEGORIES,
    ("teaching_content_sources.csv", "importability_status"): IMPORTABILITY_STATUSES,
    ("teaching_content_sources.csv", "legal_review_status"): LEGAL_REVIEW_STATUSES,
}

P0_FIELDS = [
    ("teaching_objective", "missing_teaching_objective"),
    ("child_friendly_explanation", "missing_child_friendly_explanation"),
    ("rule_explanation", "missing_rule_explanation"),
    ("anchor_word_key", "missing_anchor_word"),
    ("ordered_example_word_keys", "missing_ordered_example_words"),
    ("first_exposure_progression", "missing_first_exposure_progression"),
]

REQUIRED_FIRST_EXPOSURE_FIELD_REVIEWS = {
    "teaching_objective",
    "child_friendly_explanation",
    "rule_explanation",
    "anchor_word_key",
    "ordered_example_word_keys",
    "first_exposure_progression",
    "source",
    "licence",
}

REQUIRED_GUIDED_REVIEW_FIELD_REVIEWS = {
    "anchor_word_key",
    "ordered_example_word_keys",
    "rule_explanation",
    "review_progression",
    "source",
    "licence",
}

HARD_BOUNDARIES = [
    "dry-run only",
    "no Supabase writes",
    "no migrations",
    "no imports",
    "no assignment generation",
    "no resolver changes",
    "no evidence/proficiency writes",
    "no Word Treasure changes",
]


@dataclass
class Issue:
    severity: str
    file: str
    row: int | None
    field: str | None
    message: str


@dataclass
class Blocker:
    blocker_reason: str
    field_key: str | None
    severity: str
    review_gate: str | None
    message: str


def clean(value: Any) -> str:
    return str(value or "").strip()


def parse_bool(value: str) -> bool:
    return clean(value).upper() == "TRUE"


def split_list(value: str) -> list[str]:
    return [part.strip() for part in clean(value).split("|") if part.strip()]


def row_is_blank(row: dict[str, str]) -> bool:
    return all(not clean(value) for key, value in row.items() if key != "__row")


def add_issue(issues: list[Issue], severity: str, file_name: str, row: int | None, field: str | None, message: str) -> None:
    issues.append(Issue(severity, file_name, row, field, message))


def add_blocker(
    blockers: list[Blocker],
    reason: str,
    field: str | None,
    severity: str,
    review_gate: str | None,
    message: str,
) -> None:
    candidate = Blocker(reason, field, severity, review_gate, message)
    if candidate not in blockers:
        blockers.append(candidate)


def read_csv_file(path: Path, expected_headers: list[str]) -> tuple[list[dict[str, str]], list[Issue]]:
    issues: list[Issue] = []
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            headers = reader.fieldnames or []
            if headers != expected_headers:
                add_issue(
                    issues,
                    "error",
                    path.name,
                    1,
                    None,
                    f"Headers do not match expected contract. Expected {expected_headers}; got {headers}.",
                )
                return [], issues

            rows: list[dict[str, str]] = []
            for index, raw in enumerate(reader, start=2):
                row = {"__row": str(index)}
                for header in expected_headers:
                    row[header] = clean(raw.get(header, ""))
                if not row_is_blank(row):
                    rows.append(row)
            return rows, issues
    except UnicodeDecodeError as exc:
        add_issue(issues, "error", path.name, None, None, f"Could not read CSV as UTF-8: {exc}")
        return [], issues
    except csv.Error as exc:
        add_issue(issues, "error", path.name, None, None, f"Malformed CSV: {exc}")
        return [], issues


def load_csv_folder(folder: Path) -> tuple[dict[str, list[dict[str, str]]], list[Issue]]:
    issues: list[Issue] = []
    data: dict[str, list[dict[str, str]]] = {}

    for file_name, headers in REQUIRED_FILES.items():
        path = folder / file_name
        if not path.exists():
            add_issue(issues, "error", file_name, None, None, "Required CSV file is missing.")
            data[file_name] = []
            continue
        rows, file_issues = read_csv_file(path, headers)
        data[file_name] = rows
        issues.extend(file_issues)

    for file_name, headers in OPTIONAL_FILES.items():
        path = folder / file_name
        if path.exists():
            rows, file_issues = read_csv_file(path, headers)
            data[file_name] = rows
            issues.extend(file_issues)
        else:
            data[file_name] = []

    return data, issues


def load_micro_skill_catalog() -> dict[str, dict[str, Any]]:
    with EXPANDED_CATALOG.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)
    return {row["micro_skill_key"]: row for row in rows}


def row_number(row: dict[str, str]) -> int | None:
    try:
        return int(row.get("__row", ""))
    except ValueError:
        return None


def validate_enums(data: dict[str, list[dict[str, str]]], issues: list[Issue]) -> None:
    for (file_name, field), allowed in ENUM_COLUMNS.items():
        for row in data.get(file_name, []):
            value = clean(row.get(field))
            if value and value not in allowed:
                add_issue(
                    issues,
                    "error",
                    file_name,
                    row_number(row),
                    field,
                    f"Invalid enum value {value!r}; expected one of {sorted(allowed)}.",
                )


def validate_unique_keys(rows: list[dict[str, str]], file_name: str, key_fields: list[str], issues: list[Issue]) -> None:
    seen: dict[tuple[str, ...], int] = {}
    for row in rows:
        key = tuple(clean(row.get(field)) for field in key_fields)
        if any(not part for part in key):
            continue
        if key in seen:
            add_issue(
                issues,
                "error",
                file_name,
                row_number(row),
                ", ".join(key_fields),
                f"Duplicate key {key}; first seen on row {seen[key]}.",
            )
        else:
            seen[key] = row_number(row) or 0


def validate_source_fields(
    row: dict[str, str],
    file_name: str,
    issues: list[Issue],
    blockers: list[Blocker] | None = None,
) -> None:
    source_category = clean(row.get("source_category"))
    source_name = clean(row.get("source_name"))
    source_licence = clean(row.get("source_licence"))
    source_use_note = clean(row.get("source_use_note"))

    def issue_and_block(reason: str, field: str, message: str) -> None:
        add_issue(issues, "error", file_name, row_number(row), field, message)
        if blockers is not None:
            add_blocker(blockers, reason, field, "blocking_first_exposure", "source_licence", message)

    if not source_category:
        issue_and_block("missing_source", "source_category", "Missing source category.")
    if not source_name:
        issue_and_block("missing_source", "source_name", "Missing source name.")
    if not source_licence and not source_use_note:
        issue_and_block("missing_licence", "source_licence", "Missing source licence or source use note.")
    if source_category == "internal_authored" and not source_use_note:
        issue_and_block("missing_licence", "source_use_note", "Internally authored content requires a source_use_note.")


def validate_global_references(
    data: dict[str, list[dict[str, str]]],
    catalog: dict[str, dict[str, Any]],
    issues: list[Issue],
) -> None:
    word_rows = data["canonical_words.csv"]
    word_keys = {clean(row["word_key"]) for row in word_rows if clean(row["word_key"])}

    validate_unique_keys(word_rows, "canonical_words.csv", ["word_key"], issues)
    validate_unique_keys(
        data["teaching_content_versions.csv"],
        "teaching_content_versions.csv",
        ["micro_skill_key", "content_version"],
        issues,
    )

    for file_name in [
        "canonical_words.csv",
        "canonical_word_metadata.csv",
        "canonical_word_micro_skills.csv",
        "teaching_content_versions.csv",
    ]:
        for row in data.get(file_name, []):
            validate_source_fields(row, file_name, issues)

    for row in data["canonical_word_metadata.csv"]:
        key = clean(row["word_key"])
        if key and key not in word_keys:
            add_issue(issues, "error", "canonical_word_metadata.csv", row_number(row), "word_key", f"Unknown word_key {key!r}.")

    for row in data["canonical_word_micro_skills.csv"]:
        key = clean(row["word_key"])
        skill = clean(row["micro_skill_key"])
        if key and key not in word_keys:
            add_issue(issues, "error", "canonical_word_micro_skills.csv", row_number(row), "word_key", f"Unknown word_key {key!r}.")
        if skill and skill not in catalog:
            add_issue(
                issues,
                "error",
                "canonical_word_micro_skills.csv",
                row_number(row),
                "micro_skill_key",
                f"Unknown micro_skill_key {skill!r}.",
            )

    for row in data["teaching_content_versions.csv"]:
        skill = clean(row["micro_skill_key"])
        if skill and skill not in catalog:
            add_issue(
                issues,
                "error",
                "teaching_content_versions.csv",
                row_number(row),
                "micro_skill_key",
                f"Unknown micro_skill_key {skill!r}.",
            )
        for field in ["anchor_word_key"]:
            key = clean(row[field])
            if key and key not in word_keys:
                add_issue(issues, "error", "teaching_content_versions.csv", row_number(row), field, f"Unknown word_key {key!r}.")
        for field in ["ordered_example_word_keys", "contrast_word_keys"]:
            for key in split_list(row[field]):
                if key not in word_keys:
                    add_issue(
                        issues,
                        "error",
                        "teaching_content_versions.csv",
                        row_number(row),
                        field,
                        f"Unknown word_key {key!r}.",
                    )

    version_keys = {
        (clean(row["micro_skill_key"]), clean(row["content_version"]))
        for row in data["teaching_content_versions.csv"]
        if clean(row["micro_skill_key"]) and clean(row["content_version"])
    }
    for row in data["teaching_content_field_reviews.csv"]:
        key = (clean(row["micro_skill_key"]), clean(row["content_version"]))
        if key not in version_keys:
            add_issue(
                issues,
                "error",
                "teaching_content_field_reviews.csv",
                row_number(row),
                "content_version",
                f"Field review references unknown teaching content version {key}.",
            )


def build_metadata_indexes(data: dict[str, list[dict[str, str]]]) -> tuple[dict[str, dict[str, str]], dict[tuple[str, str], list[dict[str, str]]]]:
    metadata_by_word = {clean(row["word_key"]): row for row in data["canonical_word_metadata.csv"] if clean(row["word_key"])}
    mappings_by_skill: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in data["canonical_word_micro_skills.csv"]:
        mappings_by_skill[(clean(row["micro_skill_key"]), clean(row["micro_skill_role"]))].append(row)
    return metadata_by_word, mappings_by_skill


def approved_field_reviews(data: dict[str, list[dict[str, str]]]) -> dict[tuple[str, str], dict[str, set[str]]]:
    reviews: dict[tuple[str, str], dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for row in data["teaching_content_field_reviews.csv"]:
        status = clean(row["review_status"])
        if status not in {"approved_for_guided_review", "approved_for_first_exposure"}:
            continue
        key = (clean(row["micro_skill_key"]), clean(row["content_version"]))
        reviews[key][clean(row["field_key"])].add(status)
    return reviews


def has_approved_reviews(
    reviews: dict[tuple[str, str], dict[str, set[str]]],
    key: tuple[str, str],
    fields: set[str],
    required_status: str,
) -> bool:
    field_reviews = reviews.get(key, {})
    return all(required_status in field_reviews.get(field, set()) for field in fields)


def validate_active_versions(data: dict[str, list[dict[str, str]]], issues: list[Issue]) -> None:
    active_rows: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in data["teaching_content_versions.csv"]:
        if parse_bool(row["is_active"]):
            active_rows[clean(row["micro_skill_key"])].append(row)
            if clean(row["version_status"]) != "active":
                add_issue(
                    issues,
                    "error",
                    "teaching_content_versions.csv",
                    row_number(row),
                    "is_active",
                    "is_active=TRUE requires version_status=active.",
                )
            if clean(row["final_readiness_review_status"]) != "signed_off":
                add_issue(
                    issues,
                    "error",
                    "teaching_content_versions.csv",
                    row_number(row),
                    "final_readiness_review_status",
                    "is_active=TRUE requires final_readiness_review_status=signed_off.",
                )
    for skill, rows in active_rows.items():
        if skill and len(rows) > 1:
            for row in rows:
                add_issue(
                    issues,
                    "error",
                    "teaching_content_versions.csv",
                    row_number(row),
                    "is_active",
                    f"Duplicate active signed-off version for micro_skill_key {skill!r}.",
                )


def source_category_blocks(row: dict[str, str], blockers: list[Blocker]) -> None:
    source_category = clean(row["source_category"])
    if source_category == "reference_only":
        add_blocker(
            blockers,
            "copyrighted_reference_only_content",
            "source_category",
            "blocking_first_exposure",
            "source_licence",
            "reference_only content may guide review but must not be surfaced as final teaching content.",
        )
    if source_category == "ai_assisted_draft" and clean(row["final_readiness_review_status"]) == "signed_off":
        add_blocker(
            blockers,
            "unreviewed_ai_generated_content",
            "source_category",
            "blocking_first_exposure",
            "pedagogy",
            "ai_assisted_draft content cannot claim final signoff without human-reviewed field approvals.",
        )


def add_missing_review_blockers(
    blockers: list[Blocker],
    reviews: dict[tuple[str, str], dict[str, set[str]]],
    key: tuple[str, str],
    fields: set[str],
    required_status: str,
    severity: str,
) -> None:
    field_reviews = reviews.get(key, {})
    for field in sorted(fields):
        if required_status not in field_reviews.get(field, set()):
            add_blocker(
                blockers,
                "needs_pedagogy_review" if field not in {"source", "licence"} else "needs_legal_review",
                field,
                severity,
                "pedagogy" if field not in {"source", "licence"} else "source_licence",
                f"Field {field!r} is missing {required_status} review.",
            )


def family_required_blockers(
    row: dict[str, str],
    catalog_row: dict[str, Any] | None,
    metadata_by_word: dict[str, dict[str, str]],
    mappings_by_skill: dict[tuple[str, str], list[dict[str, str]]],
    blockers: list[Blocker],
) -> None:
    if not catalog_row:
        return
    family = clean(catalog_row.get("skill_family_key"))
    anchor_key = clean(row["anchor_word_key"])
    anchor_metadata = metadata_by_word.get(anchor_key, {})

    if family == "D4_HOM" and not split_list(row["contrast_word_keys"]):
        add_blocker(
            blockers,
            "insufficient_ordered_example_words",
            "contrast_word_keys",
            "blocking_first_exposure",
            "pedagogy",
            "D4_HOM first-exposure content requires contrast words.",
        )

    if family in {"D4_MOR", "D4_INF"}:
        has_morphology = bool(clean(anchor_metadata.get("morphemes")) or clean(anchor_metadata.get("morphology_notes")))
        if not has_morphology:
            add_blocker(
                blockers,
                "missing_rule_explanation",
                "morphology_metadata",
                "blocking_first_exposure",
                "pedagogy",
                f"{family} first-exposure content requires morphology metadata support.",
            )

    if family == "D4_SCHWA":
        has_sound_metadata = bool(
            clean(anchor_metadata.get("phoneme_hint"))
            or clean(anchor_metadata.get("stress_pattern"))
            or parse_bool(anchor_metadata.get("has_schwa", "FALSE"))
        )
        if not has_sound_metadata:
            add_blocker(
                blockers,
                "missing_rule_explanation",
                "phoneme_stress_schwa_metadata",
                "blocking_first_exposure",
                "pedagogy",
                "D4_SCHWA first-exposure content requires schwa, stress, or phoneme metadata support.",
            )


def readiness_state_for(
    blockers: list[Blocker],
    version_status: str,
    is_active: bool,
    can_guided_review: bool,
    can_first_exposure: bool,
) -> str:
    if version_status in {"rejected", "superseded", "archived"}:
        return version_status
    reasons = {blocker.blocker_reason for blocker in blockers}
    if reasons & {
        "missing_source",
        "missing_licence",
        "source_not_importable",
        "source_requires_legal_review",
        "copyrighted_reference_only_content",
    }:
        return "source_or_license_gap"
    if "unreviewed_ai_generated_content" in reasons:
        return "needs_manual_review"
    if is_active and reasons & {
        "missing_teaching_objective",
        "missing_child_friendly_explanation",
        "missing_rule_explanation",
        "missing_first_exposure_progression",
    }:
        return "content_gap"
    if reasons & {
        "missing_anchor_word",
        "missing_ordered_example_words",
        "insufficient_ordered_example_words",
        "missing_review_progression",
        "unsupported_activity_key",
        "unsupported_practice_route",
    }:
        return "content_gap"
    if can_guided_review and not can_first_exposure:
        return "ready_for_guided_review_only"
    if reasons & {
        "missing_confidence",
        "missing_review_status",
        "needs_pedagogy_review",
        "needs_child_language_review",
        "needs_british_english_review",
        "needs_accessibility_review",
        "needs_legal_review",
    }:
        return "needs_manual_review"
    if reasons & {
        "missing_teaching_objective",
        "missing_child_friendly_explanation",
        "missing_rule_explanation",
        "missing_anchor_word",
        "missing_ordered_example_words",
        "insufficient_ordered_example_words",
        "missing_first_exposure_progression",
        "missing_review_progression",
        "unsupported_activity_key",
        "unsupported_practice_route",
    }:
        return "content_gap"
    if can_first_exposure:
        return "ready_for_first_exposure"
    if can_guided_review:
        return "ready_for_guided_review_only"
    return "needs_manual_review"


def validate_teaching_version(
    row: dict[str, str],
    catalog: dict[str, dict[str, Any]],
    word_keys: set[str],
    metadata_by_word: dict[str, dict[str, str]],
    mappings_by_skill: dict[tuple[str, str], list[dict[str, str]]],
    reviews: dict[tuple[str, str], dict[str, set[str]]],
    global_issues: list[Issue],
) -> dict[str, Any]:
    blockers: list[Blocker] = []
    warnings: list[str] = []
    key = (clean(row["micro_skill_key"]), clean(row["content_version"]))
    version_status = clean(row["version_status"])

    validate_source_fields(row, "teaching_content_versions.csv", [], blockers)
    source_category_blocks(row, blockers)

    if version_status not in {"rejected", "superseded", "archived"}:
        for field, blocker in P0_FIELDS:
            if not clean(row[field]):
                add_blocker(blockers, blocker, field, "blocking_first_exposure", "pedagogy", f"Missing required P0 field {field!r}.")
        if not split_list(row["ordered_example_word_keys"]):
            add_blocker(
                blockers,
                "missing_ordered_example_words",
                "ordered_example_word_keys",
                "blocking_first_exposure",
                "pedagogy",
                "Missing ordered example words.",
            )

    catalog_row = catalog.get(clean(row["micro_skill_key"]))
    if clean(row["micro_skill_key"]) and catalog_row is None:
        add_blocker(
            blockers,
            "unsupported_practice_route",
            "micro_skill_key",
            "blocking_first_exposure",
            None,
            f"Unknown micro_skill_key {clean(row['micro_skill_key'])!r}.",
        )
    anchor_key = clean(row["anchor_word_key"])
    if anchor_key and anchor_key not in word_keys:
        add_blocker(
            blockers,
            "missing_anchor_word",
            "anchor_word_key",
            "blocking_first_exposure",
            "pedagogy",
            f"anchor_word_key {anchor_key!r} does not resolve to canonical_words.csv.",
        )
    for example_key in split_list(row["ordered_example_word_keys"]):
        if example_key not in word_keys:
            add_blocker(
                blockers,
                "missing_ordered_example_words",
                "ordered_example_word_keys",
                "blocking_first_exposure",
                "pedagogy",
                f"ordered_example_word_keys contains unknown word_key {example_key!r}.",
            )
    for contrast_key in split_list(row["contrast_word_keys"]):
        if contrast_key not in word_keys:
            add_blocker(
                blockers,
                "insufficient_ordered_example_words",
                "contrast_word_keys",
                "blocking_first_exposure",
                "pedagogy",
                f"contrast_word_keys contains unknown word_key {contrast_key!r}.",
            )

    if version_status not in {"rejected", "superseded", "archived"}:
        family_required_blockers(row, catalog_row, metadata_by_word, mappings_by_skill, blockers)

    if not clean(row["confidence"]):
        add_blocker(blockers, "missing_confidence", "confidence", "blocking_first_exposure", "final_readiness", "Missing confidence.")

    final_signed_off = clean(row["final_readiness_review_status"]) == "signed_off"
    if clean(row["final_readiness_review_status"]) in {"", "not_started", "in_review", "changes_requested"}:
        add_blocker(
            blockers,
            "missing_review_status",
            "final_readiness_review_status",
            "blocking_first_exposure",
            "final_readiness",
            "Final readiness review is not signed off.",
        )
    elif clean(row["final_readiness_review_status"]) == "rejected":
        add_blocker(
            blockers,
            "needs_pedagogy_review",
            "final_readiness_review_status",
            "blocking_first_exposure",
            "final_readiness",
            "Final readiness review rejected this content version.",
        )

    add_missing_review_blockers(
        blockers,
        reviews,
        key,
        REQUIRED_FIRST_EXPOSURE_FIELD_REVIEWS,
        "approved_for_first_exposure",
        "blocking_first_exposure",
    )

    first_exposure_blockers = [
        blocker for blocker in blockers if blocker.severity in {"blocking_first_exposure", "blocking_guided_review"}
    ]
    can_first_exposure = not first_exposure_blockers and final_signed_off and version_status == "active"

    guided_required_fields_present = bool(
        clean(row["anchor_word_key"])
        and split_list(row["ordered_example_word_keys"])
        and clean(row["rule_explanation"])
        and clean(row["review_progression"])
    )
    guided_reviews_ok = has_approved_reviews(reviews, key, REQUIRED_GUIDED_REVIEW_FIELD_REVIEWS, "approved_for_guided_review") or has_approved_reviews(
        reviews, key, REQUIRED_GUIDED_REVIEW_FIELD_REVIEWS, "approved_for_first_exposure"
    )
    can_guided_review = guided_required_fields_present and guided_reviews_ok and clean(row["source_category"]) != "reference_only"

    state = readiness_state_for(blockers, version_status, parse_bool(row["is_active"]), can_guided_review, can_first_exposure)
    if version_status == "active" and state not in {"ready_for_first_exposure", "ready_for_guided_review_only"}:
        warnings.append("Active content version is not readiness-ready.")

    return {
        "micro_skill_key": clean(row["micro_skill_key"]),
        "content_version": clean(row["content_version"]),
        "readiness_state": state,
        "first_exposure_allowed": state == "ready_for_first_exposure",
        "guided_review_allowed": state in {"ready_for_first_exposure", "ready_for_guided_review_only"},
        "blockers": [asdict(blocker) for blocker in blockers],
        "warnings": warnings,
        "source_summary": {
            "source_category": clean(row["source_category"]),
            "source_name": clean(row["source_name"]),
        },
        "review_summary": {
            "version_status": version_status,
            "is_active": parse_bool(row["is_active"]),
            "final_readiness_review_status": clean(row["final_readiness_review_status"]),
        },
    }


def validate(folder: Path) -> dict[str, Any]:
    issues: list[Issue] = []
    data, load_issues = load_csv_folder(folder)
    issues.extend(load_issues)

    if any(issue.severity == "error" and "Headers do not match" in issue.message for issue in issues):
        return build_report(folder, [], issues)

    catalog = load_micro_skill_catalog()
    validate_enums(data, issues)
    validate_global_references(data, catalog, issues)
    validate_active_versions(data, issues)

    metadata_by_word, mappings_by_skill = build_metadata_indexes(data)
    word_keys = {clean(row["word_key"]) for row in data["canonical_words.csv"] if clean(row["word_key"])}
    reviews = approved_field_reviews(data)
    versions = [
        validate_teaching_version(row, catalog, word_keys, metadata_by_word, mappings_by_skill, reviews, issues)
        for row in data["teaching_content_versions.csv"]
    ]
    return build_report(folder, versions, issues)


def build_report(folder: Path, versions: list[dict[str, Any]], issues: list[Issue]) -> dict[str, Any]:
    state_counts = Counter(version["readiness_state"] for version in versions)
    summary = {
        "teaching_content_versions": len(versions),
        "ready_for_first_exposure": state_counts["ready_for_first_exposure"],
        "ready_for_guided_review_only": state_counts["ready_for_guided_review_only"],
        "content_gap": state_counts["content_gap"],
        "source_or_license_gap": state_counts["source_or_license_gap"],
        "needs_manual_review": state_counts["needs_manual_review"],
        "rejected": state_counts["rejected"],
        "superseded": state_counts["superseded"],
        "archived": state_counts["archived"],
        "errors": sum(1 for issue in issues if issue.severity == "error"),
        "warnings": sum(1 for issue in issues if issue.severity == "warning") + sum(len(version["warnings"]) for version in versions),
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "input_folder": str(folder),
        "dry_run_only": True,
        "summary": summary,
        "versions": versions,
        "issues": [asdict(issue) for issue in issues],
        "hard_boundaries": HARD_BOUNDARIES,
    }


def print_summary(report: dict[str, Any]) -> None:
    summary = report["summary"]
    print("Teaching Dictionary CSV Readiness")
    print(f"Input: {report['input_folder']}")
    print(f"Versions inspected: {summary['teaching_content_versions']}")
    for key in [
        "ready_for_first_exposure",
        "ready_for_guided_review_only",
        "content_gap",
        "source_or_license_gap",
        "needs_manual_review",
        "rejected",
        "superseded",
        "archived",
        "errors",
        "warnings",
    ]:
        print(f"{key}: {summary[key]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Phase 5C teaching dictionary CSV exports without side effects.")
    parser.add_argument("csv_folder", nargs="?", help="Folder containing teaching dictionary CSV exports.")
    parser.add_argument("--report", help="Optional path for JSON readiness report.")
    args = parser.parse_args()

    if not args.csv_folder:
        parser.print_help()
        return 2

    folder = Path(args.csv_folder).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        print(f"CSV folder does not exist or is not a directory: {folder}", file=sys.stderr)
        return 2

    try:
        report = validate(folder)
    except Exception as exc:  # pragma: no cover - defensive CLI boundary.
        print(f"Validator failed before producing a report: {exc}", file=sys.stderr)
        return 2

    print_summary(report)

    if args.report:
        report_path = Path(args.report).expanduser().resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"JSON report: {report_path}")

    if report["summary"]["errors"] > 0:
        return 1
    if any(version["blockers"] for version in report["versions"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
