#!/usr/bin/env python3
"""Validate reviewed homophone morphology and family plans."""

import csv
import json
import re
from pathlib import Path

DIR = Path(__file__).resolve().parents[1] / "data/adle/homophone/convergence-v1"


def read(name):
    with (DIR / name).open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


dictionary = read("dictionary-intake-review.csv")
structure = read("incoming-canonical-structure-review.csv")
dependencies = read("incoming-missing-base-and-expansion-words-review.csv")
family_rows = read("incoming-lexical-base-families-review.csv")
member_rows = read("incoming-lexical-base-family-members-review.csv")
backlog = read("base-root-population-backlog.csv")
existing_gaps = read("full-dictionary-missing-base-root-review.csv")
unanalysed = read("full-dictionary-unanalysed-words-review.csv")
link_gaps = read("full-dictionary-family-link-review.csv")
summary = json.loads((DIR / "full-dictionary-base-root-audit-summary.json").read_text())
index = read("full-dictionary-canonical-base-index.csv")
canonical = {row["word"] for row in index}
assert len(dictionary) == len(structure) == 38
assert len(family_rows) == len(member_rows) == 38
assert len({row["word"] for row in structure}) == 38
assert {row["word"] for row in dictionary} == {row["word"] for row in structure}
assert len(dependencies) == 5
assert {row["word"] for row in dependencies} == {"lease", "let", "pack", "send", "had"}
assert all(row["word"] not in canonical for row in dependencies)
assert len(existing_gaps) == summary["missingBaseRootCandidates"] == 892
assert len(unanalysed) == summary["unanalysedWords"] == 886
assert len(link_gaps) == summary["reviewedMorphologyWithoutFamilyLink"] == 1105
assert len(backlog) == len(existing_gaps) + len(dependencies) == 897

dictionary_by_word = {row["word"]: row for row in dictionary}
families = {}
family_by_key = {row["base_family_key"]: row for row in family_rows}
member_by_word = {row["word"]: row for row in member_rows}
assert len(family_by_key) == len(member_by_word) == 38
for row in structure:
    word = row["word"]
    source = dictionary_by_word[word]
    assert source["review_status"] == "approved_for_first_exposure" and source["content_approval_reference"]
    assert source["structure_review_status"] == source["family_review_status"] == "approved"
    assert row["structure_review_status"] == row["family_review_status"] == "approved"
    assert row["content_approval_reference"] == source["content_approval_reference"]
    assert row["word_sum"] == source["child_facing_word_sum"]
    assert row["base_family_key"] == source["base_family_key"]
    assert row["part_of_speech"] == source["part_of_speech"]
    assert row["word_key"] == re.sub(r"[^a-z0-9]+", "_", word).strip("_") + "_en_gb"
    assert row["base_family_key"] == re.sub(r"[^a-z0-9]+", "_", row["base_or_root"]).strip("_") \
        + "_" + row["base_part_of_speech"] + "_base_family"
    parts = json.loads(row["morphology_parts_json"])
    joins = json.loads(row["morphology_joins_json"])
    transformations = json.loads(row["morphology_transformations_json"])
    assert isinstance(parts, list) and parts and isinstance(joins, list) and isinstance(transformations, list)
    assert len(joins) == len(parts) - 1
    assert "".join(part["surfaceText"] for part in parts) == word
    assert sum(part["kind"] == "base" for part in parts) == 1
    assert next(part["sourceText"] for part in parts if part["kind"] == "base") == row["base_or_root"]
    assert all(part["sourceText"] and part["surfaceText"] for part in parts)
    if row["analysis_kind"] == "free_base":
        assert row["base_or_root"] == word and row["word_sum"] == word and len(parts) == 1
    elif row["base_canonical_status"] == "missing_canonical_base":
        assert row["base_or_root"] in {"lease", "let", "pack", "send"}
    elif row["base_canonical_status"] == "approved_canonical":
        assert row["base_or_root"] in canonical
    families.setdefault(row["base_family_key"], set()).add(word)
    family = family_by_key[row["base_family_key"]]
    member = member_by_word[word]
    assert family["base_lemma"] == row["base_or_root"]
    assert family["base_part_of_speech"] == row["base_part_of_speech"]
    assert family["base_meaning"] and family["structure_review_status"] == "approved"
    assert member["base_family_key"] == row["base_family_key"]
    assert member["word_sum"] == row["word_sum"]
    assert member["morphology_parts_json"] == row["morphology_parts_json"]
    assert member["structure_review_status"] == "approved"
    assert member["relationship_kind"] in {"free_base", "regular_inflection", "irregular_inflection", "contraction"}
assert len(families) == 38
assert {row["word"] for row in dependencies if row["dependency_type"] == "free_base"} == {
    row["base_or_root"] for row in structure if row["base_canonical_status"] == "missing_canonical_base"}
assert {row["component"] for row in backlog if row["source_scope"] == "incoming_homophone_words"} == {
    row["word"] for row in dependencies}
print(json.dumps({"valid": True, "incomingWords": 38, "proposedFamilies": 38,
                  "missingIncomingDependencies": 5, "wholeDictionaryGapCandidates": 892,
                  "combinedBacklog": 897, "unanalysedCanonicalWords": 886,
                  "approvedMeaningAndContrastContent": True,
                  "morphologyAndFamilyApproved": True}, indent=2))
