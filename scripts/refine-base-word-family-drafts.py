#!/usr/bin/env python3
"""Refine in-review base-word family drafts without activating curriculum.

This is intentionally a local authoring aid. It removes the explicitly
identified true compounds, adds controlled dictation prompts, and links every
family to an auditable etymology route that remains pending human review.
"""

from __future__ import annotations

import csv
import argparse
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
CSV_DIR = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv"
REVIEW_REPORT = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/base-word-family-human-review.md"
COMPOUND_MEMBER_KEYS = {
    "bedroom_en_gb",
    "football_en_gb",
    "playground_en_gb",
    "sunshine_en_gb",
}
COMPOUND_MEMBER_SUMS = {
    "bedroom_en_gb": "bed + room → bedroom",
    "football_en_gb": "foot + ball → football",
    "playground_en_gb": "play + ground → playground",
    "sunshine_en_gb": "sun + shine → sunshine",
}
ORPHAN_REFERENCE_KEYS = {"nature_natural_en_gb", "tall_taller_tallest_en_gb"}


def read_csv(name: str) -> tuple[list[str], list[dict[str, str]]]:
    with (CSV_DIR / name).open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return reader.fieldnames or [], list(reader)


def write_csv(name: str, headers: list[str], rows: list[dict[str, str]]) -> None:
    with (CSV_DIR / name).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, lineterminator="\n", extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)


def etymology_route(family: dict[str, str]) -> dict[str, object]:
    base = family["base_word_key"].removesuffix("_en_gb")
    meaning = family["base_meaning"]
    route: dict[str, object] = {
        "relation_type": "free_base",
        "origin_language": "Modern English",
        "origin_form": base,
        "literal_meaning": meaning,
        "child_facing_meaning": meaning,
        "semantic_connection": f"The visible English base {base} is recorded in this family’s reviewed word sums; a human reviewer must confirm every member remains semantically appropriate.",
        "evidence": {
            "source_name": "Online Etymology Dictionary",
            "source_url": f"https://www.etymonline.com/search?q={quote(base)}",
            "verification_status": "linked_for_human_review",
        },
    }
    if family["base_family_key"] == "act_base_family":
        route.update({
            "relation_type": "etymological_root",
            "origin_language": "Latin",
            "origin_form": "actus",
            "literal_meaning": "a doing or deed",
            "child_facing_meaning": "to do, make, or carry out something",
            "semantic_connection": "The English base act is visible in this family. Some members use a Latin-derived route, so teach their link as word history rather than as a simple modern suffix rule.",
        })
    elif family["base_family_key"] == "graph_base_family":
        route.update({
            "relation_type": "classical_root",
            "origin_language": "Greek",
            "origin_form": "graphein",
            "literal_meaning": "to write, draw, or represent with lines",
            "child_facing_meaning": "to write, draw, or record information",
            "semantic_connection": "The Greek-derived root graph connects writing, drawing, and recording in words such as graphic, geography, photograph, and photography; it does not mean only a chart.",
        })
    elif family["base_family_key"] == "photo_base_family":
        route.update({
            "relation_type": "classical_root",
            "origin_language": "Greek",
            "origin_form": "phōs / phōtos",
            "literal_meaning": "light",
            "child_facing_meaning": "light",
            "semantic_connection": "The Greek-derived root photo means light and is recorded as a root route, not as a modern English prefix lesson.",
        })
    elif family["base_family_key"] == "port_base_family":
        route.update({
            "relation_type": "etymological_root",
            "origin_language": "Latin",
            "origin_form": "portare",
            "literal_meaning": "to carry",
            "child_facing_meaning": "to carry",
            "semantic_connection": "The transport-family link follows the Latin carry route. Do not teach the harbour meaning of English port as the explanation for transport.",
        })
    return route


def dictation_sentence(display_word: str) -> tuple[str, str, str]:
    # Controlled prompt: the runtime hides the written sentence during
    # independent recall, while audio says the target exactly once.
    sentence = f"Please spell {display_word}."
    return sentence, "2", sentence


def main() -> int:
    parser = argparse.ArgumentParser(description="Refine local ADLE base-word-family draft CSVs.")
    parser.add_argument("--approve-reviewer", help="Human reviewer name to apply to all family-layer rows.")
    parser.add_argument("--approved-at", help="Required ISO-8601 timestamp when --approve-reviewer is used.")
    args = parser.parse_args()
    if bool(args.approve_reviewer) != bool(args.approved_at):
        parser.error("--approve-reviewer and --approved-at must be supplied together.")
    family_headers, families = read_csv("base_word_families.csv")
    member_headers, members = read_csv("base_word_family_members.csv")
    _, canonical_words = read_csv("canonical_words.csv")
    display_by_key = {row["word_key"]: row["display_word"] for row in canonical_words}

    orphan_rows_removed = 0
    for file_name in ("canonical_word_metadata.csv", "micro_skill_word_support.csv"):
        headers, rows = read_csv(file_name)
        retained_rows = [row for row in rows if row.get("word_key") not in ORPHAN_REFERENCE_KEYS]
        orphan_rows_removed += len(rows) - len(retained_rows)
        write_csv(file_name, headers, retained_rows)
    if "etymology_route" not in family_headers:
        family_headers.insert(family_headers.index("source_category"), "etymology_route")

    for family in families:
        family["etymology_route"] = json.dumps(etymology_route(family), ensure_ascii=False, separators=(",", ":"))
        if family["base_family_key"] == "act_base_family":
            family["base_meaning"] = "to do, make, or carry out something"
        elif family["base_family_key"] == "graph_base_family":
            family["base_meaning"] = "to write, draw, or record information"
        elif family["base_family_key"] == "port_base_family":
            family["base_meaning"] = "to carry"
        if args.approve_reviewer:
            family["review_status"] = "approved_for_first_exposure"
            family["reviewed_by"] = args.approve_reviewer
            family["reviewed_at"] = args.approved_at

    retained = []
    excluded = []
    for member in members:
        if member["word_key"] in COMPOUND_MEMBER_KEYS:
            excluded.append(member)
            continue
        display = display_by_key[member["word_key"]]
        sentence, index, audio = dictation_sentence(display)
        member["dictation_sentence"] = sentence
        member["dictation_target_token_index"] = index
        member["audio_text"] = audio
        member["assignment_eligible"] = "TRUE"
        if args.approve_reviewer:
            member["review_status"] = "approved_for_first_exposure"
            member["reviewed_by"] = args.approve_reviewer
            member["reviewed_at"] = args.approved_at
        if member["base_family_key"] == "act_base_family":
            member["transformation_notes"] = "This member follows the Latin-derived act route. Teach the visible link carefully; it is not always a simple modern suffix rule."
        elif member["base_family_key"] == "graph_base_family":
            member["transformation_notes"] = "The Greek-derived root graph means to write, draw, or record information; keep that meaning visible in the word family."
        retained.append(member)

    write_csv("base_word_families.csv", family_headers, families)
    write_csv("base_word_family_members.csv", member_headers, retained)

    by_family: dict[str, list[dict[str, str]]] = defaultdict(list)
    for member in retained:
        by_family[member["base_family_key"]].append(member)
    ready = []
    research_only = []
    for family in families:
        rows = by_family[family["base_family_key"]]
        targets = sum(row["member_role"] == "authentic_target" for row in rows)
        transfers = sum(row["member_role"] == "transfer" for row in rows)
        (ready if targets >= 2 and transfers >= 3 else research_only).append((family["base_family_key"], len(rows), targets, transfers))
    ready.sort(key=lambda row: (row[0] != "play_base_family", row[0]))
    family_by_key = {family["base_family_key"]: family for family in families}
    report = [
        "# Base-word family human-review sheet",
        "",
        "All rows are `ai_assisted_draft`; `assignment_eligible=TRUE` means the record has complete controlled dictation support. Runtime use still requires an imported, active dictionary row and approved runtime content.",
        "",
        "## Compound members removed",
        "",
        *[f"- `{key}` — true compound `{word_sum}`." for key, word_sum in COMPOUND_MEMBER_SUMS.items()],
        "",
        "## Orphaned source rows removed",
        "",
        "- `nature_natural_en_gb` from canonical word metadata and micro-skill support.",
        "- `tall_taller_tallest_en_gb` from canonical word metadata and micro-skill support.",
        "",
        "## Five-word composition candidates",
        "",
        "A candidate needs at least two possible authentic targets and three transfer members. Human review must approve every route, word sum, sentence, and age/safeguarding decision before use.",
        "",
        *[f"- `{key}` — {count} members; {targets} target candidates; {transfers} transfers." for key, count, targets, transfers in ready],
        "",
        "## Pilot review details",
        "",
    ]
    for key, _, _, _ in ready:
        family = family_by_key[key]
        route = json.loads(family["etymology_route"])
        report.extend([
            f"### `{key}`",
            "",
            f"- Teaching meaning: {family['base_meaning']}",
            f"- Route: {route['relation_type']}; {route['origin_language']} `{route['origin_form']}` — {route['literal_meaning']}",
            f"- Child-facing explanation: {route['child_facing_meaning']}",
            f"- Review decision: `{family['review_status']}` by `{family['reviewed_by'] or 'unassigned'}`; route, word sums, and dictated wording remain auditable in this sheet.",
            "",
        ])
        for row in by_family[key]:
            report.append(f"- `{display_by_key[row['word_key']]}` ({row['member_role']}): `{row['word_sum']}` — “{row['dictation_sentence']}”")
        report.append("")
    report.extend([
        "## Research-only families",
        "",
        *[f"- `{key}` — {count} members; {targets} target candidates; {transfers} transfers." for key, count, targets, transfers in research_only],
        "",
        "## Mandatory human review",
        "",
        "- Verify each linked etymology route against its cited source before approval.",
        "- Check that child-facing meanings and word sums do not turn a historical connection into a misleading modern rule.",
        "- Review every controlled dictation prompt, audio text, token index, age suitability, safeguarding, and UK-English usage.",
    ])
    REVIEW_REPORT.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Retained {len(retained)} members; removed {len(excluded)} compound members in this run; removed {orphan_rows_removed} orphaned source rows; {len(ready)} five-word candidates.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
