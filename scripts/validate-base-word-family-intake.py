#!/usr/bin/env python3
"""Read-only validation of a Base Word family review package."""

import csv
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

BASE_WORD_MICRO_SKILLS = {
    "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
    "D4_MOR_BASE_WORDS_PRESERVE_BASE",
}
ROW_STATUSES = {"active", "draft", "rejected", "superseded"}
REVIEW_STATUSES = {
    "approved_for_first_exposure", "in_review", "draft", "ai_draft",
    "changes_requested", "approved_for_guided_review", "rejected", "superseded",
}
APPROVED = "approved_for_first_exposure"
MEMBER_ROLES = {"base", "authentic_target", "transfer", "optional_transfer_check"}
SUPPORT_ROLES = {"support_example", "review_example"}
FAMILY_COLUMNS = {
    "base_family_key", "micro_skill_key", "base_word_key", "base_meaning",
    "etymology_route", "row_status", "source_category", "source_name",
    "source_url", "source_licence", "source_use_note", "confidence",
    "review_status", "reviewed_by", "reviewed_at",
}
MEMBER_COLUMNS = {
    "base_family_key", "word_key", "display_word", "member_role", "word_sum",
    "morphology_parts", "morphology_joins", "morphology_transformations",
    "child_friendly_meaning", "dictation_sentence", "dictation_target_token_index",
    "audio_text", "assignment_eligible", "row_status", "source_category",
    "source_name", "source_url", "source_licence", "source_use_note",
    "confidence", "review_status", "reviewed_by", "reviewed_at",
}
DEPENDENCY_COLUMNS = {
    "word_key", "micro_skill_key", "word_row_status", "word_review_status",
    "support_role", "support_row_status", "support_review_status", "content_version",
    "content_version_status", "content_is_active",
    "content_final_readiness_review_status", "child_friendly_explanation",
    "rule_explanation",
}


def read_rows(path: Path, expected: set[str]) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = sorted(expected - set(reader.fieldnames or []))
        if missing:
            raise ValueError(f"{path}: missing columns: {', '.join(missing)}")
        rows = list(reader)
    if not rows:
        raise ValueError(f"{path}: no review rows")
    return rows


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def is_iso8601(value: str) -> bool:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def is_placeholder(value: str) -> bool:
    return not value.strip() or value.strip().startswith("<")


def approved_active(row_status: str, review_status: str) -> bool:
    return row_status == "active" and review_status == APPROVED


def review_errors(row: dict[str, str], identity: str, row_status: str = "row_status", review_status: str = "review_status") -> list[str]:
    errors: list[str] = []
    if row[row_status] not in ROW_STATUSES:
        errors.append(f"{identity}: invalid {row_status} {row[row_status]!r}")
    if row[review_status] not in REVIEW_STATUSES:
        errors.append(f"{identity}: invalid {review_status} {row[review_status]!r}")
    if row[review_status] == APPROVED and (not row.get("reviewed_by", "").strip() or not is_iso8601(row.get("reviewed_at", ""))):
        errors.append(f"{identity}: approval requires reviewed_by and ISO-8601 reviewed_at")
    return errors


def tokens(sentence: str) -> list[str]:
    return re.findall(r"[\w']+", sentence.casefold(), flags=re.UNICODE)


def json_array(value: str, identity: str, field: str, errors: list[str], require_nonempty: bool) -> list[object]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        errors.append(f"{identity}: {field} must be JSON")
        return []
    if not isinstance(parsed, list):
        errors.append(f"{identity}: {field} must be a JSON array")
        return []
    if require_nonempty and not parsed:
        errors.append(f"{identity}: {field} must not be empty")
    return parsed


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Usage: validate-base-word-family-intake.py FAMILIES.csv MEMBERS.csv DEPENDENCIES.csv")
    family_path, member_path, dependency_path = (Path(value) for value in sys.argv[1:])
    families = read_rows(family_path, FAMILY_COLUMNS)
    members = read_rows(member_path, MEMBER_COLUMNS)
    dependencies = read_rows(dependency_path, DEPENDENCY_COLUMNS)
    errors: list[str] = []
    runtime_blockers: list[str] = []

    family_by_key: dict[str, dict[str, str]] = {}
    for index, row in enumerate(families, start=2):
        identity = f"family row {index}"
        key = row["base_family_key"].strip()
        if is_placeholder(key): errors.append(f"{identity}: base_family_key must be concrete")
        elif key in family_by_key: errors.append(f"{identity}: duplicate base_family_key {key!r}")
        family_by_key[key] = row
        if row["micro_skill_key"] not in BASE_WORD_MICRO_SKILLS:
            errors.append(f"{identity}: unsupported Base Word micro_skill_key {row['micro_skill_key']!r}")
        if is_placeholder(row["base_word_key"]) or is_placeholder(row["base_meaning"]):
            errors.append(f"{identity}: base_word_key and base_meaning must be concrete")
        try:
            route = json.loads(row["etymology_route"])
            if not isinstance(route, dict) or not route.get("relation_type") or not route.get("evidence"):
                errors.append(f"{identity}: etymology_route needs relation_type and evidence")
        except json.JSONDecodeError:
            errors.append(f"{identity}: etymology_route must be JSON")
        errors.extend(review_errors(row, identity))
        if not approved_active(row["row_status"], row["review_status"]):
            runtime_blockers.append(f"{identity}: family is not active and approved")

    members_by_family: dict[str, list[dict[str, str]]] = {}
    authentic_pairs: set[tuple[str, str]] = set()
    for index, row in enumerate(members, start=2):
        identity = f"member row {index}"
        family = row["base_family_key"].strip()
        key = row["word_key"].strip()
        members_by_family.setdefault(family, []).append(row)
        if family not in family_by_key: errors.append(f"{identity}: unknown base_family_key {family!r}")
        if is_placeholder(key) or is_placeholder(row["display_word"]) or is_placeholder(row["word_sum"]) or is_placeholder(row["child_friendly_meaning"]):
            errors.append(f"{identity}: word_key, display_word, word_sum, and child_friendly_meaning must be concrete")
        if row["member_role"] not in MEMBER_ROLES: errors.append(f"{identity}: invalid member_role {row['member_role']!r}")
        parts = json_array(row["morphology_parts"], identity, "morphology_parts", errors, True)
        joins = json_array(row["morphology_joins"], identity, "morphology_joins", errors, False)
        transformations = json_array(row["morphology_transformations"], identity, "morphology_transformations", errors, True)
        if parts and any(not isinstance(part, dict) or not part.get("sourceText") or not part.get("surfaceText") for part in parts):
            errors.append(f"{identity}: every morphology part needs sourceText and surfaceText")
        if parts and len(joins) != len(parts) - 1:
            errors.append(f"{identity}: morphology_joins length must equal parts length minus one")
        if row["assignment_eligible"] not in {"TRUE", "FALSE"}:
            errors.append(f"{identity}: assignment_eligible must be TRUE or FALSE")
        if row["assignment_eligible"] == "TRUE":
            sentence, display, audio = row["dictation_sentence"], row["display_word"], row["audio_text"]
            try: target_index = int(row["dictation_target_token_index"])
            except ValueError: target_index = -1
            word_tokens = tokens(sentence)
            if not sentence.strip() or audio != sentence or target_index < 0 or target_index >= len(word_tokens) or word_tokens[target_index] != display.casefold() or word_tokens.count(display.casefold()) != 1:
                errors.append(f"{identity}: eligible dictation needs matching audio and exactly one indexed display_word token")
        errors.extend(review_errors(row, identity))
        if not approved_active(row["row_status"], row["review_status"]): runtime_blockers.append(f"{identity}: member is not active and approved")
        if row["member_role"] == "authentic_target": authentic_pairs.add((key, family_by_key.get(family, {}).get("micro_skill_key", "")))

    dependency_by_pair: dict[tuple[str, str], dict[str, str]] = {}
    signed_off_skills: set[str] = set()
    for index, row in enumerate(dependencies, start=2):
        identity = f"dependency row {index}"
        pair = (row["word_key"].strip(), row["micro_skill_key"])
        if pair in dependency_by_pair: errors.append(f"{identity}: duplicate word/micro-skill dependency")
        dependency_by_pair[pair] = row
        if row["micro_skill_key"] not in BASE_WORD_MICRO_SKILLS: errors.append(f"{identity}: unsupported Base Word micro_skill_key")
        for status, allowed in ((row["word_row_status"], ROW_STATUSES), (row["support_row_status"], ROW_STATUSES)):
            if status not in allowed: errors.append(f"{identity}: invalid row status {status!r}")
        for status in (row["word_review_status"], row["support_review_status"]):
            if status not in REVIEW_STATUSES: errors.append(f"{identity}: invalid review status {status!r}")
        if row["support_role"] not in SUPPORT_ROLES: errors.append(f"{identity}: support_role must be support_example or review_example")
        if not all(row[field].strip() for field in ("content_version", "child_friendly_explanation", "rule_explanation")):
            errors.append(f"{identity}: content version and both explanations are required")
        ready = approved_active(row["word_row_status"], row["word_review_status"]) and approved_active(row["support_row_status"], row["support_review_status"]) and row["content_version_status"] == "active" and row["content_is_active"] == "TRUE" and row["content_final_readiness_review_status"] == "signed_off"
        if ready: signed_off_skills.add(row["micro_skill_key"])
        else: runtime_blockers.append(f"{identity}: exact word/support/content dependency is not runtime ready")

    for word_key, skill in authentic_pairs:
        if (word_key, skill) not in dependency_by_pair:
            errors.append(f"authentic target {word_key!r}/{skill}: exact support dependency missing")
    for family, rows in members_by_family.items():
        if any(row["member_role"] == "authentic_target" for row in rows):
            has_transfer = any(row["member_role"] in {"base", "transfer"} and row["assignment_eligible"] == "TRUE" and approved_active(row["row_status"], row["review_status"]) for row in rows)
            if not has_transfer: runtime_blockers.append(f"family {family!r}: approved eligible transfer pool missing")
    for family in family_by_key.values():
        if family["micro_skill_key"] not in signed_off_skills:
            runtime_blockers.append(f"micro-skill {family['micro_skill_key']!r}: signed-off teaching content missing")

    if errors:
        raise SystemExit("\n".join(sorted(errors)))
    print(json.dumps({
        "status": "valid_review_package",
        "runtime_contract_ready": not runtime_blockers,
        "runtime_blockers": sorted(set(runtime_blockers)),
        "families": {"rows": len(families), "sha256": digest(family_path)},
        "members": {"rows": len(members), "sha256": digest(member_path)},
        "dependencies": {"rows": len(dependencies), "sha256": digest(dependency_path)},
        "writes": False,
        "approval_assigned": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
