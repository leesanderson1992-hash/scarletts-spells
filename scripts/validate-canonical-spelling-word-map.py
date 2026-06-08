#!/usr/bin/env python3
"""Read-only validator for the canonical spelling word-map workbook.

This script intentionally avoids Supabase, migrations, imports, and runtime
consumers. It reads an .xlsx file and local catalog seed artifacts only, then
prints a validation report. It may write a local JSON report only when
--report is provided.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = (
    ROOT
    / "docs/implementation/seed-data/canonical-spelling-word-map/"
    / "canonical-spelling-word-map-v1.xlsx"
)
EXPANDED_CATALOG = ROOT / "docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json"
MVP1_MANIFEST = ROOT / "docs/implementation/seed-data/domain4-mvp1-seed-manifest.json"

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


WORKBOOK_SHEETS: dict[str, list[str]] = {
    "micro_skill_word_bank": [
        "micro_skill_key",
        "word",
        "normalised_word",
        "word_role",
        "micro_skill_role",
        "diversity_group_key",
        "complexity_band",
        "frequency_band",
        "practice_route",
        "approved_for_assignment",
        "notes",
    ],
    "micro_skill_diversity_groups": [
        "micro_skill_key",
        "diversity_group_key",
        "display_label",
        "required_for_mastery",
        "minimum_success_examples",
        "notes",
    ],
    "contrast_pairs": [
        "target_micro_skill_key",
        "target_word",
        "contrast_word",
        "contrast_micro_skill_key",
        "contrast_type",
        "approved_for_assignment",
    ],
    "diagnostic_misspelling_mappings": [
        "misspelling_normalised",
        "correction_normalised",
        "micro_skill_key",
        "diagnostic_reason",
        "confidence",
        "resolver_visible_candidate",
        "notes",
    ],
    "word_metadata": [
        "word",
        "normalised_word",
        "syllable_count",
        "phoneme_hint",
        "stress_pattern",
        "has_schwa",
        "morphology_notes",
        "irregularity_band",
        "spelling_complexity_score",
        "source",
    ],
    "lesson_route_support": [
        "micro_skill_key",
        "route",
        "minimum_words_required",
        "requires_contrast_words",
        "template_key",
        "enabled_for_mvp",
    ],
    "import_notes": ["version", "author", "source", "review_status", "notes"],
    "allowed_values": [
        "word_role",
        "micro_skill_role",
        "contrast_type",
        "route",
        "confidence",
        "complexity_band",
        "frequency_band",
        "review_status",
        "boolean",
    ],
    "README": ["Canonical Spelling Word Map Workbook"],
}

BOOLEAN_COLUMNS = {
    ("micro_skill_word_bank", "approved_for_assignment"),
    ("micro_skill_diversity_groups", "required_for_mastery"),
    ("contrast_pairs", "approved_for_assignment"),
    ("diagnostic_misspelling_mappings", "resolver_visible_candidate"),
    ("word_metadata", "has_schwa"),
    ("lesson_route_support", "requires_contrast_words"),
    ("lesson_route_support", "enabled_for_mvp"),
}

NUMERIC_COLUMNS = {
    ("micro_skill_diversity_groups", "minimum_success_examples"),
    ("word_metadata", "syllable_count"),
    ("word_metadata", "spelling_complexity_score"),
    ("lesson_route_support", "minimum_words_required"),
}

NORMALIZED_COLUMNS = {
    ("micro_skill_word_bank", "normalised_word"),
    ("diagnostic_misspelling_mappings", "misspelling_normalised"),
    ("diagnostic_misspelling_mappings", "correction_normalised"),
    ("word_metadata", "normalised_word"),
}

MICRO_SKILL_COLUMNS = {
    ("micro_skill_word_bank", "micro_skill_key"),
    ("micro_skill_diversity_groups", "micro_skill_key"),
    ("contrast_pairs", "target_micro_skill_key"),
    ("contrast_pairs", "contrast_micro_skill_key"),
    ("diagnostic_misspelling_mappings", "micro_skill_key"),
    ("lesson_route_support", "micro_skill_key"),
}

MUTATION_TERMS = re.compile(
    r"\b("
    r"resolver[_ -]?visible|canonical mapping|spelling_canonical_mappings|"
    r"create learning_items|create assignment_items|mastery evidence|"
    r"supabase|migration|import into"
    r")\b",
    re.IGNORECASE,
)


@dataclass
class Issue:
    severity: str
    sheet: str
    row: int | None
    field: str | None
    message: str


def normalize_header(value: str) -> str:
    return value.strip()


def cell_ref_to_col_index(ref: str) -> int:
    letters = "".join(ch for ch in ref if ch.isalpha())
    value = 0
    for char in letters.upper():
        value = value * 26 + ord(char) - 64
    return value - 1


def read_xlsx(path: Path) -> dict[str, list[dict[str, str]]]:
    with ZipFile(path) as zf:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", NS):
                shared_strings.append("".join(t.text or "" for t in item.findall(".//a:t", NS)))

        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        def cell_value(cell: ET.Element) -> str:
            cell_type = cell.attrib.get("t")
            if cell_type == "inlineStr":
                return "".join(t.text or "" for t in cell.findall(".//a:t", NS))
            value = cell.find("a:v", NS)
            if value is None:
                return ""
            raw = value.text or ""
            if cell_type == "s":
                try:
                    return shared_strings[int(raw)]
                except (ValueError, IndexError):
                    return raw
            if cell_type == "b":
                return "TRUE" if raw == "1" else "FALSE"
            return raw

        sheets: dict[str, list[dict[str, str]]] = {}
        for sheet in workbook.findall("a:sheets/a:sheet", NS):
            name = sheet.attrib["name"]
            rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = rel_targets[rel_id]
            sheet_path = "xl/" + target if not target.startswith("/") else target[1:]
            root = ET.fromstring(zf.read(sheet_path))
            raw_rows: list[list[str]] = []
            for row in root.findall("a:sheetData/a:row", NS):
                values: list[str] = []
                for cell in row.findall("a:c", NS):
                    index = cell_ref_to_col_index(cell.attrib.get("r", "A1"))
                    while len(values) <= index:
                        values.append("")
                    values[index] = cell_value(cell).strip()
                if any(value.strip() for value in values):
                    raw_rows.append(values)

            if not raw_rows:
                sheets[name] = []
                continue

            headers = [normalize_header(value) for value in raw_rows[0]]
            rows: list[dict[str, str]] = []
            for row_index, values in enumerate(raw_rows[1:], start=2):
                record = {"__row": str(row_index)}
                for index, header in enumerate(headers):
                    if header:
                        record[header] = values[index].strip() if index < len(values) else ""
                rows.append(record)
            sheets[name] = rows

        return sheets


def headers_for(path: Path, sheet_name: str) -> list[str]:
    with ZipFile(path) as zf:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", NS):
                shared_strings.append("".join(t.text or "" for t in item.findall(".//a:t", NS)))
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        for sheet in workbook.findall("a:sheets/a:sheet", NS):
            if sheet.attrib["name"] != sheet_name:
                continue
            rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = rel_targets[rel_id]
            sheet_path = "xl/" + target if not target.startswith("/") else target[1:]
            root = ET.fromstring(zf.read(sheet_path))
            first = root.find("a:sheetData/a:row", NS)
            if first is None:
                return []
            headers: list[str] = []
            for cell in first.findall("a:c", NS):
                value = cell.find("a:v", NS)
                if value is None:
                    headers.append("")
                    continue
                raw = value.text or ""
                if cell.attrib.get("t") == "s" and raw.isdigit() and int(raw) < len(shared_strings):
                    headers.append(shared_strings[int(raw)].strip())
                else:
                    headers.append(raw.strip())
            return headers
    return []


def load_catalog_keys() -> dict[str, dict[str, Any]]:
    keys: dict[str, dict[str, Any]] = {}
    if EXPANDED_CATALOG.exists():
        rows = json.loads(EXPANDED_CATALOG.read_text())
        for row in rows:
            key = row.get("micro_skill_key")
            if key:
                keys[key] = row
    if MVP1_MANIFEST.exists():
        manifest = json.loads(MVP1_MANIFEST.read_text())
        starter = manifest.get("starter_subset", {})
        for key in starter.get("assignable_node_ids", []):
            keys.setdefault(
                key,
                {
                    "micro_skill_key": key,
                    "mastery_domain_key": "D4",
                    "is_active": True,
                    "is_assignable": True,
                },
            )
    return keys


def add(issues: list[Issue], severity: str, sheet: str, row: int | None, field: str | None, message: str) -> None:
    issues.append(Issue(severity, sheet, row, field, message))


def get_allowed_values(sheets: dict[str, list[dict[str, str]]], column: str) -> set[str]:
    values = set()
    for row in sheets.get("allowed_values", []):
        value = row.get(column, "").strip()
        if value:
            values.add(value)
    return values


def is_blank(value: str) -> bool:
    return not value or not value.strip()


def is_punctuation_only(value: str) -> bool:
    return bool(value) and not any(ch.isalnum() for ch in value)


def validate(path: Path) -> dict[str, Any]:
    sheets = read_xlsx(path)
    catalog = load_catalog_keys()
    issues: list[Issue] = []

    for sheet, required_headers in WORKBOOK_SHEETS.items():
        if sheet not in sheets:
            add(issues, "error", sheet, None, None, "Stage 2A.1 contract sheet is missing.")
            continue
        actual_headers = headers_for(path, sheet)
        for header in required_headers:
            if header not in actual_headers:
                add(issues, "error", sheet, 1, header, "Stage 2A.1 contract-required column is missing.")

    boolean_values = get_allowed_values(sheets, "boolean") or {"TRUE", "FALSE"}
    enum_columns = {
        ("micro_skill_word_bank", "word_role"): get_allowed_values(sheets, "word_role"),
        ("micro_skill_word_bank", "micro_skill_role"): get_allowed_values(sheets, "micro_skill_role"),
        ("micro_skill_word_bank", "complexity_band"): get_allowed_values(sheets, "complexity_band"),
        ("micro_skill_word_bank", "frequency_band"): get_allowed_values(sheets, "frequency_band"),
        ("micro_skill_word_bank", "practice_route"): get_allowed_values(sheets, "route"),
        ("contrast_pairs", "contrast_type"): get_allowed_values(sheets, "contrast_type"),
        ("diagnostic_misspelling_mappings", "confidence"): get_allowed_values(sheets, "confidence"),
        ("lesson_route_support", "route"): get_allowed_values(sheets, "route"),
        ("import_notes", "review_status"): get_allowed_values(sheets, "review_status"),
    }

    diversity_groups = {
        (row.get("micro_skill_key", ""), row.get("diversity_group_key", ""))
        for row in sheets.get("micro_skill_diversity_groups", [])
        if row.get("micro_skill_key") and row.get("diversity_group_key")
    }

    import_note_headers = set(headers_for(path, "import_notes"))
    if "source_license" not in import_note_headers:
        add(
            issues,
            "warning",
            "import_notes",
            1,
            "source_license",
            "Workbook-level source licence column is absent; add it before import planning if sources vary or are external.",
        )
    if "redistribution_status" not in import_note_headers:
        add(
            issues,
            "warning",
            "import_notes",
            1,
            "redistribution_status",
            "Workbook-level redistribution status column is absent; add it before import planning for external sources.",
        )

    approved_words_by_skill_route: dict[tuple[str, str], int] = {}
    approved_contrasts_by_skill: dict[str, int] = {}

    for sheet_name, rows in sheets.items():
        for row in rows:
            row_num = int(row.get("__row", "0") or 0)

            for sheet, field in BOOLEAN_COLUMNS:
                if sheet_name == sheet and field in row:
                    value = row.get(field, "")
                    if value not in boolean_values:
                        add(issues, "error", sheet_name, row_num, field, f"Expected boolean value, got {value!r}.")

            for sheet, field in NUMERIC_COLUMNS:
                if sheet_name == sheet and field in row and row.get(field, ""):
                    try:
                        float(row[field])
                    except ValueError:
                        add(issues, "error", sheet_name, row_num, field, f"Expected numeric value, got {row[field]!r}.")

            for sheet, field in NORMALIZED_COLUMNS:
                if sheet_name == sheet and field in row:
                    value = row.get(field, "")
                    if is_blank(value):
                        add(issues, "error", sheet_name, row_num, field, "Normalized word is empty.")
                    elif value != value.lower():
                        add(issues, "error", sheet_name, row_num, field, "Normalized word must be lowercase.")
                    elif is_punctuation_only(value):
                        add(issues, "error", sheet_name, row_num, field, "Normalized word is punctuation-only.")

            for sheet, field in MICRO_SKILL_COLUMNS:
                if sheet_name == sheet and field in row:
                    key = row.get(field, "")
                    if is_blank(key):
                        add(issues, "error", sheet_name, row_num, field, "micro_skill_key is empty.")
                        continue
                    catalog_row = catalog.get(key)
                    if not catalog_row:
                        add(issues, "error", sheet_name, row_num, field, f"micro_skill_key {key!r} is not in local active D4 catalog artifacts.")
                    else:
                        if catalog_row.get("mastery_domain_key") != "D4":
                            add(issues, "error", sheet_name, row_num, field, f"micro_skill_key {key!r} is not D4.")
                        if catalog_row.get("is_active") is not True:
                            add(issues, "error", sheet_name, row_num, field, f"micro_skill_key {key!r} is not active.")
                        if catalog_row.get("is_assignable") is not True:
                            add(issues, "error", sheet_name, row_num, field, f"micro_skill_key {key!r} is not assignable.")

            for (sheet, field), allowed in enum_columns.items():
                if sheet_name == sheet and field in row and row.get(field, "") and allowed:
                    if row[field] not in allowed:
                        add(issues, "error", sheet_name, row_num, field, f"Value {row[field]!r} is not in allowed_values.{field}.")

            if sheet_name == "micro_skill_word_bank":
                group = row.get("diversity_group_key", "")
                key = row.get("micro_skill_key", "")
                if group and (key, group) not in diversity_groups:
                    add(issues, "error", sheet_name, row_num, "diversity_group_key", f"Diversity group {group!r} is used before definition for {key!r}.")
                if row.get("approved_for_assignment") == "TRUE":
                    approved_words_by_skill_route[(key, row.get("practice_route", ""))] = approved_words_by_skill_route.get((key, row.get("practice_route", "")), 0) + 1

            if sheet_name == "contrast_pairs" and row.get("approved_for_assignment") == "TRUE":
                approved_contrasts_by_skill[row.get("target_micro_skill_key", "")] = approved_contrasts_by_skill.get(row.get("target_micro_skill_key", ""), 0) + 1

            if sheet_name == "diagnostic_misspelling_mappings":
                if row.get("resolver_visible_candidate") != "FALSE":
                    add(issues, "error", sheet_name, row_num, "resolver_visible_candidate", "Diagnostic rows must not be resolver-visible candidates.")

            for field, value in row.items():
                if field == "__row" or not value:
                    continue
                if MUTATION_TERMS.search(value):
                    if sheet_name == "README" and "must not" in value.lower():
                        continue
                    if sheet_name == "diagnostic_misspelling_mappings" and "not resolver truth" in value.lower():
                        continue
                    if sheet_name == "diagnostic_misspelling_mappings" and "do not import as canonical mapping" in value.lower():
                        continue
                    add(issues, "warning", sheet_name, row_num, field, f"Text mentions mutation/authority term: {value!r}.")

    for row in sheets.get("lesson_route_support", []):
        row_num = int(row.get("__row", "0") or 0)
        if row.get("enabled_for_mvp") != "TRUE":
            continue
        key = row.get("micro_skill_key", "")
        route = row.get("route", "")
        minimum = 0
        try:
            minimum = int(float(row.get("minimum_words_required", "0") or "0"))
        except ValueError:
            pass
        available = approved_words_by_skill_route.get((key, route), 0)
        if available < minimum:
            add(issues, "error", "lesson_route_support", row_num, "minimum_words_required", f"Enabled route {route!r} for {key!r} requires {minimum} approved words but has {available}.")
        if row.get("requires_contrast_words") == "TRUE" and approved_contrasts_by_skill.get(key, 0) == 0:
            add(issues, "error", "lesson_route_support", row_num, "requires_contrast_words", f"Enabled route {route!r} for {key!r} requires approved contrast rows but has none.")

    sheet_summary = {}
    for sheet, rows in sheets.items():
        sheet_summary[sheet] = {
            "rows": len(rows),
            "columns": headers_for(path, sheet),
        }

    return {
        "workbook": str(path),
        "read_only": True,
        "catalog_reference": [
            str(EXPANDED_CATALOG.relative_to(ROOT)) if EXPANDED_CATALOG.exists() else None,
            str(MVP1_MANIFEST.relative_to(ROOT)) if MVP1_MANIFEST.exists() else None,
        ],
        "catalog_key_count": len(catalog),
        "sheet_summary": sheet_summary,
        "issue_counts": {
            "errors": sum(1 for issue in issues if issue.severity == "error"),
            "warnings": sum(1 for issue in issues if issue.severity == "warning"),
        },
        "issues": [asdict(issue) for issue in issues],
    }


def print_text_report(report: dict[str, Any]) -> None:
    print("Canonical spelling word-map validation")
    print(f"Workbook: {report['workbook']}")
    print(f"Read-only: {report['read_only']}")
    print(f"Catalog keys loaded: {report['catalog_key_count']}")
    print("Sheets:")
    for name, details in report["sheet_summary"].items():
        print(f"  - {name}: {details['rows']} data rows, {len(details['columns'])} columns")
    print(f"Errors: {report['issue_counts']['errors']}")
    print(f"Warnings: {report['issue_counts']['warnings']}")
    for issue in report["issues"][:50]:
        row = f" row {issue['row']}" if issue["row"] else ""
        field = f" field {issue['field']}" if issue["field"] else ""
        print(f"[{issue['severity'].upper()}] {issue['sheet']}{row}{field}: {issue['message']}")
    if len(report["issues"]) > 50:
        print(f"... {len(report['issues']) - 50} more issue(s) omitted from text output.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate canonical spelling word-map workbook without side effects.")
    parser.add_argument("workbook", nargs="?", default=str(DEFAULT_WORKBOOK), help="Path to .xlsx workbook.")
    parser.add_argument("--report", help="Optional JSON report output path.")
    parser.add_argument("--no-fail", action="store_true", help="Return exit code 0 even when validation errors are found.")
    args = parser.parse_args()

    workbook = Path(args.workbook).expanduser().resolve()
    if not workbook.exists():
        print(f"Workbook not found: {workbook}", file=sys.stderr)
        return 2

    report = validate(workbook)
    print_text_report(report)

    if args.report:
        report_path = Path(args.report).expanduser().resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        print(f"JSON report written: {report_path}")

    if report["issue_counts"]["errors"] and not args.no_fail:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
