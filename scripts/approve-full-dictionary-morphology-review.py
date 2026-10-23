#!/usr/bin/env python3
"""Stamp the owner's explicit approval on the exact reviewed morphology packet."""
import csv
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
directory = root / "data/adle/homophone/convergence-v1"
main = directory / "full-dictionary-unanalysed-words-review.csv"
links = directory / "two-base-family-links-review.csv"
expected = {
    main: "993862ed1b3d2cd9cdafb5105f6a6e8701b09a63508ccab8be85892255099598",
    links: "f36a608c13bb95b07548735d2cfd708c99f209781ced8553f7a6401378f69750",
}
reference = ("Content owner approval in Codex chat, 2026-10-23: interest + ing; "
             "two-base words join both families; potential poten + ial "
             "(visible poten + tial); remaining morphology correct")
for path, digest in expected.items():
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, f"Review packet changed: {path}"

with main.open(encoding="utf-8", newline="") as file:
    reader = csv.DictReader(file)
    fields, rows = reader.fieldnames, list(reader)
assert len(rows) == 886 and all(row["review_status"] == "draft" for row in rows)
by_word = {row["word"]: row for row in rows}
assert len(by_word) == 886
assert by_word["interesting"]["word_sum_candidate"] == "interest + ing → interesting"
assert by_word["potential"]["word_sum_candidate"] == "poten + ial → potential"
assert by_word["potential"]["visible_word_sum_candidate"] == "poten + tial → potential"
for word in ("photograph", "photography"):
    family_links = json.loads(by_word[word]["base_family_links_json"])
    assert {family for link in family_links for family in link["existingFamilyKeys"]} == {
        "photo_base_family", "graph_base_family"}
for row in rows:
    row["review_status"] = "approved"
    row["reviewed_by"] = "Katie Sanderson"
    row["approval_reference"] = reference
with main.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)

with links.open(encoding="utf-8", newline="") as file:
    reader = csv.DictReader(file)
    fields, members = reader.fieldnames, list(reader)
assert len(members) == 26
assert all(row["morphology_review_status"] == "draft" for row in members)
for row in members:
    row["morphology_review_status"] = "approved"
with links.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(members)
print(json.dumps({"approvedMorphologyWords": len(rows), "twoBaseMembershipRows": len(members)}))
