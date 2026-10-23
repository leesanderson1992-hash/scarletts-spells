#!/usr/bin/env python3
"""Check the draft 886-word morphology review for completeness and valid surfaces."""
import csv
import json
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "data/adle/homophone/convergence-v1/full-dictionary-unanalysed-words-review.csv"
with path.open(encoding="utf-8", newline="") as file:
    rows = list(csv.DictReader(file))
assert len(rows) == 886
assert len({row["word_key"] for row in rows}) == len(rows)
for row in rows:
    assert row["word"] and row["source_morphemes"] and row["word_sum_candidate"]
    assert row["base_or_root_candidate"] and row["analysis_kind_candidate"]
    assert row["word"] in row["word_sum_candidate"]
    assert row["review_status"] == "approved" and row["reviewed_by"] and row["approval_reference"]
    parts = json.loads(row["morphology_parts_json"])
    assert parts and all(part["sourceText"] for part in parts)
    surface = "".join(part["surfaceText"] for part in parts)
    if row["analysis_kind_candidate"] == "compound":
        assert surface == row["word"].replace(" ", "").replace("-", "")
    else:
        assert surface == row["word"], (row["word"], surface)
    assert row["visible_word_sum_candidate"]
    base_parts = {part["sourceText"].lower() for part in parts if part["kind"] == "base"}
    links = json.loads(row["base_family_links_json"])
    assert {link["component"] for link in links} == base_parts
    assert isinstance(json.loads(row["morphology_joins_json"]), list)
    assert isinstance(json.loads(row["morphology_transformations_json"]), list)
counts = Counter(row["review_priority"] for row in rows)
assert set(counts) <= {"normal", "high"}
by_word = {row["word"]: row for row in rows}
assert by_word["interesting"]["word_sum_candidate"] == "interest + ing → interesting"
assert by_word["potential"]["word_sum_candidate"] == "poten + ial → potential"
assert by_word["potential"]["visible_word_sum_candidate"] == "poten + tial → potential"
with (path.parent / "two-base-family-links-review.csv").open(encoding="utf-8", newline="") as file:
    members = list(csv.DictReader(file))
assert len(members) == 26 and len({row["word_key"] for row in members}) == 13
assert all(row["morphology_review_status"] == "approved" for row in members)
assert all(row["membership_status"] == "pending_morphology_and_family_import" for row in members)
for word in ("photograph", "photography"):
    assert {row["existing_family_keys"] for row in members if row["word"] == word} == {
        "photo_base_family", "graph_base_family"}
print(json.dumps({"valid": True, "words": len(rows), "highPriority": counts["high"],
                  "twoBaseWords": 13, "twoBaseLinks": 26,
                  "analysisKinds": dict(Counter(row["analysis_kind_candidate"] for row in rows))}))
