#!/usr/bin/env python3
"""Read-only compatibility audit for six-word, two-family base-word lessons."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CSV_DIR = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv"
OUTPUT = ROOT / "docs/implementation/qa/base-word-family-pair-compatibility-audit.csv"
APPROVED = "approved_for_first_exposure"
SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE"


def read(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    families = [row for row in read(CSV_DIR / "base_word_families.csv") if row["micro_skill_key"] == SKILL and row["review_status"] == APPROVED]
    members_by_family: dict[str, list[dict[str, str]]] = defaultdict(list)
    for member in read(CSV_DIR / "base_word_family_members.csv"):
        if member["assignment_eligible"] == "TRUE" and member["review_status"] == APPROVED:
            members_by_family[member["base_family_key"]].append(member)

    facts: dict[str, tuple[int, int]] = {}
    for family in families:
        members = members_by_family[family["base_family_key"]]
        authentic = sum(member["member_role"] == "authentic_target" for member in members)
        related = sum(member["member_role"] in {"base", "transfer"} for member in members)
        facts[family["base_family_key"]] = (authentic, related)

    rows: list[dict[str, str]] = []
    for key in sorted(facts):
        authentic, related = facts[key]
        partners = sorted(
            (other, other_authentic, other_related)
            for other, (other_authentic, other_related) in facts.items()
            if other != key and authentic >= 1 and other_authentic >= 1 and related + other_related >= 4
        )
        best = sorted(partners, key=lambda item: (-item[2], -item[1], item[0]))[0] if partners else None
        rows.append({
            "base_family_key": key,
            "eligible_authentic_targets": str(authentic),
            "eligible_related_words": str(related),
            "compatibility_status": "pair_ready" if best else "blocked_no_safe_pair",
            "compatible_partner_count": str(len(partners)),
            "recommended_partner_family_key": best[0] if best else "",
            "recommended_partner_authentic_targets": str(best[1]) if best else "",
            "recommended_combined_related_words": str(related + best[2]) if best else "",
            "blocking_reason": "" if best else "No approved IDENTIFY_BASE family supplies enough combined related words for the current six-word lesson.",
            "human_review_status": "approved",
        })

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)
    print(f"pair audit: {sum(row['compatibility_status'] == 'pair_ready' for row in rows)} pair-ready, {sum(row['compatibility_status'] != 'pair_ready' for row in rows)} blocked")


if __name__ == "__main__":
    main()
