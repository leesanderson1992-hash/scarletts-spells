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
    assert row["review_status"] == "draft" and not row["approval_reference"]
    parts = json.loads(row["morphology_parts_json"])
    assert parts and all(part["sourceText"] for part in parts)
    surface = "".join(part["surfaceText"] for part in parts)
    if row["analysis_kind_candidate"] == "compound":
        assert surface == row["word"].replace(" ", "").replace("-", "")
    else:
        assert surface == row["word"], (row["word"], surface)
    assert isinstance(json.loads(row["morphology_joins_json"]), list)
    assert isinstance(json.loads(row["morphology_transformations_json"]), list)
counts = Counter(row["review_priority"] for row in rows)
assert set(counts) <= {"normal", "high"}
print(json.dumps({"valid": True, "words": len(rows), "highPriority": counts["high"],
                  "analysisKinds": dict(Counter(row["analysis_kind_candidate"] for row in rows))}))
