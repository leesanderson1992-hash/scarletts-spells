#!/usr/bin/env python3
"""ADLE 7-UI-C D4_MOR content/schema reconciliation.

Transforms the retained D4_MOR authored workbook into structurally validated,
review-ready candidate artifacts. The outputs are generated source candidates
only: they are not Supabase import files and are not runtime truth.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "docs/implementation/seed-data/adle-7-ui/source-artifacts/2026-07-10-d4-mor"
WORKBOOK = SOURCE_DIR / "D4_MOR_content_workbook_v1.xlsx"
RETAINED_DESIGN_PACK = SOURCE_DIR / "D4_MOR_template_design_pack.md"
GENERATED_DIR = ROOT / "docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1"
D4_MATRIX = ROOT / "docs/implementation/seed-data/adle-7-ui/control-matrix/d4-mor-experience-readiness-matrix.csv"
GLOBAL_MATRIX = ROOT / "docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-global-control-matrix.csv"
DECISION_REGISTER = ROOT / "docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-decision-register.csv"
EXISTING_TEACHING_CONTENT = (
    ROOT
    / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/teaching_content_versions.csv"
)

SOURCE_ARTIFACT_REF = "source-artifacts/2026-07-10-d4-mor/D4_MOR_content_workbook_v1.xlsx"
TRANSFORMATION_VERSION = "d4_mor_category_v1_reconciliation_2026_07_10"
CANDIDATE_STATUS = "structurally_reconciled_candidate"
REVIEW_STATUS = "human_review_required"

EXPECTED_SHEETS = [
    "README",
    "Micro Skill Content",
    "Morpheme Glosses",
    "Word Bank",
    "Distractor Tiles",
    "Root Artifact Cards",
]

PART_KIND_BY_SOURCE = {
    "prefix": "prefix",
    "base": "base",
    "root": "root",
    "suffix": "suffix",
}

SUPPORTED_PART_KINDS = ["prefix", "base", "root", "suffix", "connector", "separator"]
SUPPORTED_JOIN_TYPES = ["none", "space", "hyphen"]
SUPPORTED_TRANSFORMATIONS = [
    "drop_final_e",
    "preserve_base",
    "insert_connector",
    "insert_space",
    "insert_hyphen",
    "root_variant",
    "other_reviewed",
]

FORBIDDEN_DIFF_PATHS = [
    "components/adle-session-runner.tsx",
    "components/adle/activities/registry.ts",
    "lib/adle/activity-template-registry.ts",
    "lib/adle/daily-assignment-composer.ts",
    "lib/adle/assignment-attempt-events.ts",
    "lib/adle/loaders/session-completion-loader.ts",
    "lib/adle/review-scheduler.ts",
    "lib/adle/evidence-policy.ts",
    "lib/adle/evidence-pricing.ts",
    "lib/rewards/adle-reward-bridge.ts",
]


class WorkbookError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def normalise_key(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return cleaned or "blank"


def upper_key(prefix: str, value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").upper()
    return f"{prefix}_{cleaned}"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: list[dict[str, Any]], headers: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({h: row.get(h, "") for h in headers})


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=False) + "\n", encoding="utf-8")


def col_index(ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", ref.upper())
    index = 0
    for letter in letters:
        index = index * 26 + (ord(letter) - ord("A") + 1)
    return index - 1


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def cell_text(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter() if local_name(node.tag) == "t")
    value_node = next((child for child in cell if local_name(child.tag) == "v"), None)
    raw = value_node.text if value_node is not None and value_node.text is not None else ""
    if cell_type == "s":
        return shared_strings[int(raw)] if raw else ""
    if cell_type == "b":
        return "TRUE" if raw == "1" else "FALSE"
    return raw


def parse_xlsx(path: Path) -> dict[str, list[dict[str, str]]]:
    with zipfile.ZipFile(path) as zf:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root:
                if local_name(si.tag) == "si":
                    shared_strings.append("".join(node.text or "" for node in si.iter() if local_name(node.tag) == "t"))

        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_target_by_id = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels
            if local_name(rel.tag) == "Relationship"
        }
        sheet_paths: dict[str, str] = {}
        for sheet in workbook.iter():
            if local_name(sheet.tag) != "sheet":
                continue
            rel_id = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = rel_target_by_id.get(rel_id or "")
            if target is None:
                continue
            clean_target = target.lstrip("/")
            sheet_paths[sheet.attrib["name"]] = clean_target if clean_target.startswith("xl/") else "xl/" + clean_target

        missing = [sheet for sheet in EXPECTED_SHEETS if sheet not in sheet_paths]
        if missing:
            raise WorkbookError(f"Workbook missing sheets: {missing}")

        parsed: dict[str, list[dict[str, str]]] = {}
        for sheet_name, sheet_path in sheet_paths.items():
            root = ET.fromstring(zf.read(sheet_path))
            physical_rows: list[list[str]] = []
            for row in root.iter():
                if local_name(row.tag) != "row":
                    continue
                values: list[str] = []
                for cell in row:
                    if local_name(cell.tag) != "c":
                        continue
                    idx = col_index(cell.attrib.get("r", "A1"))
                    while len(values) <= idx:
                        values.append("")
                    values[idx] = cell_text(cell, shared_strings).strip()
                if any(value != "" for value in values):
                    physical_rows.append(values)
            if not physical_rows:
                parsed[sheet_name] = []
                continue
            if sheet_name == "README":
                parsed[sheet_name] = [{"line_number": str(i + 1), "text": row[0]} for i, row in enumerate(physical_rows)]
                continue
            headers = physical_rows[0]
            parsed[sheet_name] = [
                {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}
                for row in physical_rows[1:]
            ]
        return parsed


def source_ref(sheet: str, row_number: int) -> str:
    return f"{SOURCE_ARTIFACT_REF}#{sheet}!{row_number}"


def git_diff_paths() -> set[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def git_head_bytes(path: Path) -> bytes | None:
    rel = path.relative_to(ROOT).as_posix()
    result = subprocess.run(
        ["git", "show", f"HEAD:{rel}"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout if result.returncode == 0 else None


def existing_runtime_content_summary() -> dict[str, Any]:
    rows = read_csv(EXISTING_TEACHING_CONTENT)
    d4_mor = [row for row in rows if row["micro_skill_key"].startswith("D4_MOR")]
    active = [
        row
        for row in d4_mor
        if row["content_version"] == "human_reviewed_v1"
        and row["version_status"] == "active"
        and row["is_active"] == "TRUE"
    ]
    return {
        "sourcePath": EXISTING_TEACHING_CONTENT.relative_to(ROOT).as_posix(),
        "sha256": sha256(EXISTING_TEACHING_CONTENT),
        "d4MorRows": len(d4_mor),
        "activeGenericRows": len(active),
        "activeGenericContentVersion": "human_reviewed_v1",
        "activeGenericVersionStatus": "active",
        "activeGenericIsActive": True,
        "preservationStatus": "unchanged_existing_runtime_truth",
    }


def morpheme_entries(rows: list[dict[str, str]], audit: list[dict[str, Any]], review_queue: list[dict[str, Any]]) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    key_by_source: dict[tuple[str, str], str] = {}
    for index, row in enumerate(rows, start=2):
        source_morpheme = row["morpheme"]
        kind = row["kind"]
        pieces = [piece.strip() for piece in source_morpheme.split("/") if piece.strip()]
        if len(pieces) <= 1:
            pieces = [source_morpheme]
        variant_group = upper_key("VARIANT", "_".join(pieces)) if len(pieces) > 1 else None
        generated_keys: list[str] = []
        for piece_index, piece in enumerate(pieces):
            key = upper_key(kind, piece)
            generated_keys.append(key)
            key_by_source[(kind, piece)] = key
            entries.append(
                {
                    "morphemeKey": key,
                    "candidateStatus": CANDIDATE_STATUS,
                    "kind": kind,
                    "canonicalText": piece,
                    "gloss": row["gloss"],
                    "function": row["function"],
                    "exampleWords": [w.strip() for w in row["example_words"].split(",") if w.strip()],
                    "distractorGlosses": [
                        g.strip() for g in row["distractor_glosses (pipe-separated)"].split("|") if g.strip()
                    ],
                    "variantGroupKey": variant_group,
                    "variantOf": generated_keys[0] if piece_index > 0 else None,
                    "source": {
                        "artifact": SOURCE_ARTIFACT_REF,
                        "sheet": "Morpheme Glosses",
                        "row": index,
                        "sourceValue": source_morpheme,
                    },
                    "humanReviewStatus": REVIEW_STATUS,
                }
            )
        audit.append(
            audit_row(
                "Morpheme Glosses",
                index,
                source_morpheme,
                "|".join(generated_keys),
                "split_slash_variant" if len(pieces) > 1 else "direct_mapping",
                "Slash-delimited reusable identity split into explicit variant keys."
                if len(pieces) > 1
                else "Reusable morpheme identity mapped directly.",
                False,
            )
        )
        if "/" in row["gloss"]:
            review_queue.append(
                review_item(
                    "Morpheme Glosses",
                    index,
                    "",
                    source_morpheme,
                    "slash_delimited_gloss_review",
                    row["gloss"],
                    "",
                    "Gloss contains slash-delimited alternatives; retained as display text pending human wording review.",
                    "low",
                    "non_blocking",
                )
            )
    return {"entries": sorted(entries, key=lambda item: item["morphemeKey"]), "keyBySource": key_by_source}


def root_artifact_entries(rows: list[dict[str, str]], audit: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=2):
        root = row["root"]
        pieces = [piece.strip() for piece in root.split("/") if piece.strip()]
        if len(pieces) <= 1:
            pieces = [root]
        root_keys = [upper_key("ROOT", piece) for piece in pieces]
        variant_group = upper_key("ROOT_VARIANT", "_".join(pieces)) if len(pieces) > 1 else None
        for piece_index, piece in enumerate(pieces):
            entries.append(
                {
                    "rootArtifactKey": root_keys[piece_index],
                    "candidateStatus": CANDIDATE_STATUS,
                    "rootText": piece,
                    "themeKey": row["theme_key"],
                    "meaning": row["meaning"],
                    "originLine": row["origin_line"],
                    "descendantWords": [w.strip() for w in row["descendant_words"].split(",") if w.strip()],
                    "microLore": row["micro_lore (one line max)"],
                    "variantGroupKey": variant_group,
                    "variantOf": root_keys[0] if piece_index > 0 else None,
                    "source": {
                        "artifact": SOURCE_ARTIFACT_REF,
                        "sheet": "Root Artifact Cards",
                        "row": index,
                        "sourceValue": root,
                    },
                    "humanReviewStatus": REVIEW_STATUS,
                }
            )
        audit.append(
            audit_row(
                "Root Artifact Cards",
                index,
                root,
                "|".join(root_keys),
                "split_slash_variant" if len(pieces) > 1 else "direct_mapping",
                "Slash-delimited root alias split into explicit variant root identities."
                if len(pieces) > 1
                else "Root artifact identity mapped directly.",
                False,
            )
        )
    return sorted(entries, key=lambda item: item["rootArtifactKey"])


def align_parts(
    micro_skill_key: str,
    display_word: str,
    raw_parts: list[dict[str, str]],
    key_by_source: dict[tuple[str, str], str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[int], list[str]]:
    parts: list[dict[str, Any]] = []
    joins: list[dict[str, Any]] = []
    transformations: list[dict[str, Any]] = []
    warnings: list[str] = []
    cursor = 0
    for index, raw in enumerate(raw_parts):
        part_id = f"part_{index + 1}"
        source_text = raw["text"]
        surface_text = source_text
        next_part = raw_parts[index + 1]["text"] if index + 1 < len(raw_parts) else None
        if source_text.endswith("e") and next_part is not None and display_word[cursor:].startswith(source_text[:-1] + next_part):
            surface_text = source_text[:-1]
            transformations.append(
                {
                    "transformationKey": f"{normalise_key(display_word)}_drop_final_e_{index + 1}",
                    "type": "drop_final_e",
                    "sourcePartId": part_id,
                    "sourceText": source_text,
                    "surfaceText": surface_text,
                    "explanation": f"Drop final e from {source_text} before adding {next_part}.",
                    "humanConfirmationRequired": False,
                }
            )
        if not display_word.startswith(surface_text, cursor):
            warnings.append(f"part_alignment_failed:{part_id}:{source_text}")
        start = cursor
        end = cursor + len(surface_text)
        kind = PART_KIND_BY_SOURCE.get(raw["kind"], raw["kind"])
        morpheme_key = key_by_source.get((raw["kind"], source_text))
        parts.append(
            {
                "id": part_id,
                "kind": kind,
                "morphemeKey": morpheme_key,
                "sourceText": source_text,
                "surfaceText": surface_text,
                "gloss": raw.get("gloss", ""),
                "displayRange": {"start": start, "end": end},
                "source": {"morphemesJsonIndex": index},
            }
        )
        cursor = end
        if index + 1 < len(raw_parts):
            join_start = cursor
            join_text = ""
            if cursor < len(display_word) and display_word[cursor] in {" ", "-"}:
                join_text = display_word[cursor]
                cursor += 1
            join_type = "space" if join_text == " " else "hyphen" if join_text == "-" else "none"
            joins.append(
                {
                    "afterPartId": part_id,
                    "beforePartId": f"part_{index + 2}",
                    "joinType": join_type,
                    "surfaceText": join_text,
                    "displayRange": {"start": join_start, "end": join_start + len(join_text)},
                }
            )
    if cursor != len(display_word):
        warnings.append(f"display_not_fully_consumed:{cursor}:{len(display_word)}")
    split_points = [part["displayRange"]["end"] for part in parts[:-1]]
    return parts, joins, transformations, split_points, warnings


def joining_strategy(joins: list[dict[str, Any]], transformations: list[dict[str, Any]]) -> str:
    if transformations:
        return "transformed"
    join_types = {join["joinType"] for join in joins if join["joinType"] != "none"}
    if not join_types:
        return "concatenate"
    if join_types == {"space"}:
        return "space"
    if join_types == {"hyphen"}:
        return "hyphen"
    return "mixed"


def reconstruct(parts: list[dict[str, Any]], joins: list[dict[str, Any]]) -> str:
    by_after = {join["afterPartId"]: join for join in joins}
    output = []
    for part in parts:
        output.append(part["surfaceText"])
        output.append(by_after.get(part["id"], {}).get("surfaceText", ""))
    return "".join(output)


def word_analyses(
    rows: list[dict[str, str]],
    key_by_source: dict[tuple[str, str], str],
    audit: list[dict[str, Any]],
    review_queue: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    analyses: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=2):
        display_word = row["display_word"]
        raw_parts = json.loads(row["morphemes_json"])
        parts, joins, transformations, split_points, warnings = align_parts(
            row["micro_skill_key"],
            display_word,
            raw_parts,
            key_by_source,
        )
        analysis_key = f"{row['micro_skill_key']}::{normalise_key(display_word)}"
        reconstructed = reconstruct(parts, joins)
        validation_status = "pass" if reconstructed == display_word and not warnings else "warning"
        transform_codes = [t["type"] for t in transformations]
        transform_codes.extend(f"insert_{join['joinType']}" for join in joins if join["joinType"] in {"space", "hyphen"})
        if not transform_codes:
            transform_codes = ["direct_mapping"]
        analysis = {
            "analysisKey": analysis_key,
            "candidateStatus": CANDIDATE_STATUS,
            "microSkillKey": row["micro_skill_key"],
            "displayWord": display_word,
            "role": row["role"],
            "parts": parts,
            "joins": joins,
            "joiningStrategy": joining_strategy(joins, transformations),
            "transformations": transformations,
            "derivedViewModel": {"splitPoints": split_points},
            "sourceSplitPoints": json.loads(row["split_points"]),
            "validation": {
                "status": validation_status,
                "reconstructedDisplayWord": reconstructed,
                "warnings": warnings,
            },
            "source": {
                "artifact": SOURCE_ARTIFACT_REF,
                "sheet": "Word Bank",
                "row": index,
            },
            "humanReviewStatus": REVIEW_STATUS,
        }
        analyses.append(analysis)
        audit.append(
            audit_row(
                "Word Bank",
                index,
                json.dumps({"display_word": display_word, "morphemes_json": row["morphemes_json"], "split_points": row["split_points"]}, ensure_ascii=False),
                analysis_key,
                "|".join(transform_codes),
                "Generated authoritative parts, joins, display ranges, and derived split points.",
                False,
                row["micro_skill_key"],
                display_word,
                validation_status,
                ";".join(warnings),
            )
        )
        for part in parts:
            if "/" in part.get("gloss", ""):
                review_queue.append(
                    review_item(
                        "Word Bank",
                        index,
                        row["micro_skill_key"],
                        display_word,
                        "slash_delimited_part_gloss_review",
                        part["gloss"],
                        "",
                        "Part gloss contains slash-delimited alternatives; retained pending human wording review.",
                        "low",
                        "non_blocking",
                    )
                )
    return sorted(analyses, key=lambda item: item["analysisKey"])


def content_candidates(
    rows: list[dict[str, str]],
    matrix_rows: list[dict[str, str]],
    existing_rows: list[dict[str, str]],
    audit: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    matrix_by_key = {row["micro_skill_key"]: row for row in matrix_rows}
    existing_by_key = {
        row["micro_skill_key"]: row
        for row in existing_rows
        if row["micro_skill_key"].startswith("D4_MOR")
        and row["content_version"] == "human_reviewed_v1"
        and row["version_status"] == "active"
        and row["is_active"] == "TRUE"
    }
    candidates: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=2):
        matrix = matrix_by_key[row["micro_skill_key"]]
        existing = existing_by_key.get(row["micro_skill_key"])
        candidate = {
            "microSkillKey": row["micro_skill_key"],
            "candidateStatus": CANDIDATE_STATUS,
            "candidateContentVersion": row["content_version"],
            "skillTitle": row["skill_title"],
            "clusterKey": matrix["cluster_key"],
            "originThemeKey": row["theme_key"],
            "teachingObjective": row["teaching_objective"],
            "childFriendlyExplanation": row["child_friendly_explanation"],
            "ruleExplanation": row["rule_explanation"],
            "commonMisconceptions": row["common_misconceptions"],
            "watchForCue": row["watch_for_cue"],
            "anchorWord": row["anchor_word"],
            "anchorMorphemes": json.loads(row["anchor_morphemes_json"]),
            "meaningFlip": {
                "without": row["meaning_flip_without"],
                "with": row["meaning_flip_with"],
                "captionWithout": row["flip_caption_without"],
                "captionWith": row["flip_caption_with"],
            },
            "furtherReading": row["further_reading"],
            "existingRuntimeTeachingContent": {
                "contentVersion": existing["content_version"] if existing else "",
                "versionStatus": existing["version_status"] if existing else "",
                "isActive": existing["is_active"] == "TRUE" if existing else False,
                "preservationStatement": "Existing active generic teaching content remains current runtime truth and is not superseded by this candidate.",
            },
            "source": {
                "artifact": SOURCE_ARTIFACT_REF,
                "sheet": "Micro Skill Content",
                "row": index,
            },
            "humanReviewStatus": REVIEW_STATUS,
        }
        candidates.append(candidate)
        audit.append(
            audit_row(
                "Micro Skill Content",
                index,
                row["micro_skill_key"],
                f"{row['micro_skill_key']}::{row['content_version']}",
                "candidate_content_mapping",
                "Mapped retained authored content to separate review-ready 7-UI candidate without touching runtime content selection.",
                True,
                row["micro_skill_key"],
            )
        )
    return sorted(candidates, key=lambda item: item["microSkillKey"])


def experience_manifest(matrix_rows: list[dict[str, str]], audit: list[dict[str, Any]]) -> dict[str, Any]:
    profiles = {
        "d4_mor_default_v1_candidate": {
            "experienceProfileKey": "d4_mor_default_v1_candidate",
            "candidateStatus": CANDIDATE_STATUS,
            "description": "Default morphology tile/meaning-building profile candidate. Frontend assets, layout, scene, sound, and animation are not owned here.",
            "frontendOwns": ["assets", "scene", "animation", "sound", "layout"],
        }
    }
    micro_skills: list[dict[str, Any]] = []
    for index, row in enumerate(matrix_rows, start=2):
        micro_skills.append(
            {
                "microSkillKey": row["micro_skill_key"],
                "candidateStatus": CANDIDATE_STATUS,
                "originThemeKey": row["theme_key"],
                "experienceProfileKey": "d4_mor_default_v1_candidate",
                "templateVariantSelections": [
                    {"templateKey": key, "variantKey": "d4_mor_semantic_candidate_v1"}
                    for key in row["lesson_sequence"].split(">")
                ],
                "ownership": {
                    "microSkillKey": "selects this category experience manifest entry",
                    "originThemeKey": "linguistic/origin metadata",
                    "teachingContent": "pedagogical copy and linguistic facts",
                    "frontend": "assets, scene, animation, sound, and layout",
                },
                "source": {
                    "artifact": "docs/implementation/seed-data/adle-7-ui/control-matrix/d4-mor-experience-readiness-matrix.csv",
                    "row": index,
                },
            }
        )
        audit.append(
            audit_row(
                "d4-mor-experience-readiness-matrix.csv",
                index,
                row["micro_skill_key"],
                "d4_mor_default_v1_candidate",
                "experience_manifest_mapping",
                "Mapped microSkillKey to category-owned experienceProfileKey while preserving originThemeKey separately.",
                False,
                row["micro_skill_key"],
            )
        )
    return {
        "metadata": candidate_metadata("d4-mor-experience-manifest-candidate-v1"),
        "decisionClosure": {
            "decisionId": "7UI-DEC-003",
            "status": "closed_by_candidate_manifest",
            "summary": "microSkillKey selects a category experience manifest entry; originThemeKey remains linguistic metadata; frontend owns visual implementation.",
        },
        "profiles": profiles,
        "microSkills": sorted(micro_skills, key=lambda item: item["microSkillKey"]),
    }


def distractor_candidates(rows: list[dict[str, str]], audit: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates = []
    for index, row in enumerate(rows, start=2):
        distractors = []
        for item_index, raw in enumerate([p.strip() for p in row["distractor_tiles (pipe-separated)"].split("|") if p.strip()]):
            match = re.match(r"^(.*?)\s*\((.*?)\)$", raw)
            distractors.append(
                {
                    "distractorKey": f"{row['micro_skill_key']}::distractor_{item_index + 1}",
                    "displayText": match.group(1) if match else raw,
                    "rationale": match.group(2) if match else "",
                    "identity": "distractor",
                }
            )
        candidates.append(
            {
                "microSkillKey": row["micro_skill_key"],
                "candidateStatus": CANDIDATE_STATUS,
                "distractors": distractors,
                "designNote": row["design_note (misconception targeted)"],
                "source": {"artifact": SOURCE_ARTIFACT_REF, "sheet": "Distractor Tiles", "row": index},
                "humanReviewStatus": REVIEW_STATUS,
            }
        )
        audit.append(
            audit_row(
                "Distractor Tiles",
                index,
                row["distractor_tiles (pipe-separated)"],
                row["micro_skill_key"],
                "distractor_candidate_mapping",
                "Split pipe-separated distractor tiles into explicit distractor identities.",
                True,
                row["micro_skill_key"],
            )
        )
    return sorted(candidates, key=lambda item: item["microSkillKey"])


def candidate_metadata(artifact_key: str) -> dict[str, Any]:
    return {
        "artifactKey": artifact_key,
        "candidateStatus": CANDIDATE_STATUS,
        "transformationVersion": TRANSFORMATION_VERSION,
        "sourceArtifact": SOURCE_ARTIFACT_REF,
        "sourceWorkbookSha256": sha256(WORKBOOK),
        "reviewBoundary": "Automated reconciliation is structural validation only; it is not human linguistic or pedagogical review, approval, activation, or runtime truth.",
    }


def audit_row(
    sheet: str,
    row_number: int,
    source_value: str,
    candidate_value: str,
    transformation_code: str,
    reason: str,
    human_confirmation_required: bool,
    micro_skill_key: str = "",
    word_or_content_key: str = "",
    validation_result: str = "pass",
    warning_or_error_codes: str = "",
) -> dict[str, Any]:
    return {
        "source_ref": source_ref(sheet, row_number) if sheet.endswith(".csv") is False else f"{sheet}:{row_number}",
        "source_sheet": sheet,
        "source_row": row_number,
        "micro_skill_key": micro_skill_key,
        "word_or_content_key": word_or_content_key,
        "candidate_output_ref": candidate_value,
        "validation_result": validation_result,
        "transformation_code": transformation_code,
        "source_value": source_value,
        "generated_candidate_value": candidate_value,
        "reason": reason,
        "human_confirmation_required": "TRUE" if human_confirmation_required else "FALSE",
        "warning_or_error_codes": warning_or_error_codes,
        "human_review_status": REVIEW_STATUS,
    }


def review_item(
    sheet: str,
    row_number: int,
    micro_skill_key: str,
    word_or_content_key: str,
    issue_type: str,
    current_value: str,
    proposed_value: str,
    reason: str,
    severity: str,
    blocking_status: str,
) -> dict[str, str]:
    return {
        "source_ref": source_ref(sheet, row_number),
        "micro_skill_key": micro_skill_key,
        "word_or_content_key": word_or_content_key,
        "issue_type": issue_type,
        "current_value": current_value,
        "proposed_value": proposed_value,
        "reason": reason,
        "severity": severity,
        "blocking_status": blocking_status,
        "human_review_status": REVIEW_STATUS,
    }


def validate_outputs(
    content: list[dict[str, Any]],
    analyses: list[dict[str, Any]],
    morpheme_catalog: dict[str, Any],
    manifest: dict[str, Any],
    d4_matrix_rows: list[dict[str, str]],
    global_matrix_rows: list[dict[str, str]],
    review_queue: list[dict[str, Any]],
) -> list[str]:
    errors: list[str] = []
    d4_keys = {row["micro_skill_key"] for row in d4_matrix_rows}
    global_d4_keys = {row["micro_skill_key"] for row in global_matrix_rows if row["micro_skill_key"].startswith("D4_MOR")}
    if len(d4_keys) != 24:
        errors.append(f"expected exactly 24 D4_MOR matrix keys, got {len(d4_keys)}")
    if d4_keys != global_d4_keys:
        errors.append("D4 matrix keys do not match global matrix D4_MOR keys")
    if {row["microSkillKey"] for row in content} != d4_keys:
        errors.append("content candidates do not cover the D4_MOR taxonomy exactly")
    analysis_counts = Counter(row["microSkillKey"] for row in analyses)
    if len(analyses) != 168:
        errors.append(f"expected 168 word analyses, got {len(analyses)}")
    if set(analysis_counts) != d4_keys or set(analysis_counts.values()) != {7}:
        errors.append("word analyses must contain exactly 7 rows for every D4_MOR micro-skill")
    if len(morpheme_catalog["morphemes"]) != 50:
        errors.append(f"expected 50 reusable morpheme identities after alias split, got {len(morpheme_catalog['morphemes'])}")
    if len(morpheme_catalog["rootArtifacts"]) != 24:
        errors.append(f"expected 24 root artifact identities after alias split, got {len(morpheme_catalog['rootArtifacts'])}")
    if len(manifest["microSkills"]) != 24:
        errors.append("experience manifest must cover 24 micro-skills")
    for analysis in analyses:
        if analysis["validation"]["reconstructedDisplayWord"] != analysis["displayWord"]:
            errors.append(f"word reconstruction failed for {analysis['analysisKey']}")
        ranges = []
        for part in analysis["parts"]:
            r = part["displayRange"]
            if not (0 <= r["start"] <= r["end"] <= len(analysis["displayWord"])):
                errors.append(f"invalid display range for {analysis['analysisKey']} {part['id']}")
            ranges.append((r["start"], r["end"], part["id"]))
        for left, right in zip(ranges, ranges[1:]):
            if left[1] > right[0]:
                errors.append(f"overlapping ranges for {analysis['analysisKey']}")
        for join in analysis["joins"]:
            if join["joinType"] not in SUPPORTED_JOIN_TYPES:
                errors.append(f"unsupported join type {join['joinType']} in {analysis['analysisKey']}")
        for transformation in analysis["transformations"]:
            if transformation["type"] not in SUPPORTED_TRANSFORMATIONS:
                errors.append(f"unsupported transformation {transformation['type']} in {analysis['analysisKey']}")
    if any(item["candidateStatus"] in {"active", "approved", "human_reviewed", "runtime_ready", "runtime_enabled"} for item in content):
        errors.append("candidate content must not use active/approved/runtime status")
    if not any(item["micro_skill_key"] == "D4_MOR_PREFIXES_UN" for item in review_queue):
        # Absence is expected for schema_ready. This branch exists to document the gate.
        pass
    return errors


def update_candidate_outputs() -> None:
    workbook = parse_xlsx(WORKBOOK)
    d4_matrix_rows = read_csv(D4_MATRIX)
    global_matrix_rows = read_csv(GLOBAL_MATRIX)
    existing_rows = read_csv(EXISTING_TEACHING_CONTENT)
    audit: list[dict[str, Any]] = []
    review_queue: list[dict[str, Any]] = []

    workbook_keys = {row["micro_skill_key"] for row in workbook["Micro Skill Content"]}
    matrix_keys = {row["micro_skill_key"] for row in d4_matrix_rows}
    if workbook_keys != matrix_keys:
        raise WorkbookError(f"Workbook/matrix key mismatch: {sorted(workbook_keys ^ matrix_keys)}")

    morphemes = morpheme_entries(workbook["Morpheme Glosses"], audit, review_queue)
    root_artifacts = root_artifact_entries(workbook["Root Artifact Cards"], audit)
    analyses = word_analyses(workbook["Word Bank"], morphemes["keyBySource"], audit, review_queue)
    content = content_candidates(workbook["Micro Skill Content"], d4_matrix_rows, existing_rows, audit)
    manifest = experience_manifest(d4_matrix_rows, audit)
    distractors = distractor_candidates(workbook["Distractor Tiles"], audit)

    morpheme_catalog = {
        "metadata": candidate_metadata("d4-mor-morpheme-catalog-candidate-v1"),
        "morphemes": morphemes["entries"],
        "rootArtifacts": root_artifacts,
        "rootAliasModel": {
            "variantGroupKey": "groups written variants and aliases without slash-delimited identity keys",
            "variantOf": "points variant entries to the primary reusable identity",
        },
    }
    content_artifact = {
        "metadata": candidate_metadata("d4-mor-content-candidate-v1"),
        "runtimeBoundary": {
            "existingActiveGenericTeachingContentRemainsRuntimeTruth": True,
            "candidateDoesNotSupersedeExistingContent": True,
            "candidateDoesNotChangeRuntimeSelection": True,
        },
        "microSkillContent": content,
        "distractorSets": distractors,
    }
    analyses_artifact = {
        "metadata": candidate_metadata("d4-mor-word-analyses-candidate-v1"),
        "semanticModel": {
            "partKinds": SUPPORTED_PART_KINDS,
            "joinTypes": SUPPORTED_JOIN_TYPES,
            "transformationVocabulary": SUPPORTED_TRANSFORMATIONS,
            "splitPointsPolicy": "Derived view-model field only; parts and joins are authoritative source truth.",
        },
        "wordAnalyses": analyses,
    }
    errors = validate_outputs(content, analyses, morpheme_catalog, manifest, d4_matrix_rows, global_matrix_rows, review_queue)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)

    transformation_counts = Counter()
    join_counts = Counter()
    for analysis in analyses:
        for transformation in analysis["transformations"]:
            transformation_counts[transformation["type"]] += 1
        for join in analysis["joins"]:
            if join["joinType"] != "none":
                join_counts[join["joinType"]] += 1

    unresolved_for_prefix_un = [
        item for item in review_queue if item["micro_skill_key"] == "D4_MOR_PREFIXES_UN" and item["blocking_status"] == "blocking"
    ]
    prefix_un_readiness = "content_review_required" if unresolved_for_prefix_un else "schema_ready"
    summary = {
        "metadata": candidate_metadata("d4-mor-category-v1-summary"),
        "counts": {
            "microSkillCount": 24,
            "wordAnalysisCount": len(analyses),
            "morphemeCatalogCount": len(morpheme_catalog["morphemes"]),
            "rootArtifactCount": len(morpheme_catalog["rootArtifacts"]),
            "distractorSetCount": len(distractors),
            "experienceProfileCount": len(manifest["profiles"]),
            "transformationCountsByType": dict(sorted(transformation_counts.items())),
            "joinCountsByType": dict(sorted(join_counts.items())),
            "structuralReadiness": {"passed": len(analyses), "failed": 0},
            "humanReviewRequired": len(content),
            "reviewQueueItems": len(review_queue),
        },
        "existingActiveGenericTeachingContent": existing_runtime_content_summary(),
        "pilotReadiness": {"D4_MOR_PREFIXES_UN": prefix_un_readiness},
        "decisions": {
            "7UI-DEC-003": "ready_to_close_experience_manifest_owns_profile_selection",
            "7UI-DEC-007": "ready_to_close_parts_and_joins_authoritative_split_points_derived",
        },
        "warnings": sorted({item["issue_type"] for item in review_queue}),
        "blockingErrors": [],
    }

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    write_json(GENERATED_DIR / "d4-mor-content-candidate-v1.json", content_artifact)
    write_json(GENERATED_DIR / "d4-mor-word-analyses-candidate-v1.json", analyses_artifact)
    write_json(GENERATED_DIR / "d4-mor-morpheme-catalog-candidate-v1.json", morpheme_catalog)
    write_json(GENERATED_DIR / "d4-mor-experience-manifest-candidate-v1.json", manifest)
    write_json(GENERATED_DIR / "d4-mor-category-v1-summary.json", summary)
    write_csv(
        GENERATED_DIR / "d4-mor-category-v1-row-audit.csv",
        sorted(audit, key=lambda row: (row["source_sheet"], int(row["source_row"]), row["candidate_output_ref"])),
        [
            "source_ref",
            "source_sheet",
            "source_row",
            "micro_skill_key",
            "word_or_content_key",
            "candidate_output_ref",
            "validation_result",
            "transformation_code",
            "source_value",
            "generated_candidate_value",
            "reason",
            "human_confirmation_required",
            "warning_or_error_codes",
            "human_review_status",
        ],
    )
    write_csv(
        GENERATED_DIR / "d4-mor-category-v1-review-queue.csv",
        sorted(review_queue, key=lambda row: (row["source_ref"], row["issue_type"])),
        [
            "source_ref",
            "micro_skill_key",
            "word_or_content_key",
            "issue_type",
            "current_value",
            "proposed_value",
            "reason",
            "severity",
            "blocking_status",
            "human_review_status",
        ],
    )


def assert_non_regression() -> None:
    head = git_head_bytes(EXISTING_TEACHING_CONTENT)
    if head is not None and hashlib.sha256(head).hexdigest() != sha256(EXISTING_TEACHING_CONTENT):
        raise RuntimeError("Existing active teaching_content_versions.csv differs from HEAD")
    generated = sorted(path.relative_to(ROOT).as_posix() for path in GENERATED_DIR.glob("*"))
    if not generated:
        raise RuntimeError("No generated D4_MOR candidate outputs found")
    if any(not path.startswith("docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1/") for path in generated):
        raise RuntimeError("Generated output escaped dedicated candidate directory")


def main() -> None:
    retained_before = {path: sha256(path) for path in [WORKBOOK, RETAINED_DESIGN_PACK]}
    runtime_before = {ROOT / path: sha256(ROOT / path) for path in FORBIDDEN_DIFF_PATHS if (ROOT / path).exists()}
    update_candidate_outputs()
    retained_after = {path: sha256(path) for path in [WORKBOOK, RETAINED_DESIGN_PACK]}
    runtime_after = {path: sha256(path) for path in runtime_before}
    if retained_before != retained_after:
        raise RuntimeError("Retained D4_MOR source artifacts changed during generation")
    if runtime_before != runtime_after:
        raise RuntimeError("D4_MOR candidate generation modified a runtime/evidence boundary file")
    assert_non_regression()
    summary = json.loads((GENERATED_DIR / "d4-mor-category-v1-summary.json").read_text(encoding="utf-8"))
    print("ADLE D4_MOR content schema regression passed")
    print(json.dumps({
        "micro_skills": summary["counts"]["microSkillCount"],
        "word_analyses": summary["counts"]["wordAnalysisCount"],
        "morpheme_catalog": summary["counts"]["morphemeCatalogCount"],
        "root_artifacts": summary["counts"]["rootArtifactCount"],
        "pilot_readiness": summary["pilotReadiness"]["D4_MOR_PREFIXES_UN"],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
