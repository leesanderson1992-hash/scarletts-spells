#!/usr/bin/env python3
"""Guard the approved pair-compatibility audit's public release facts."""

from __future__ import annotations

import csv
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "docs/implementation/qa/base-word-family-pair-compatibility-audit.csv"

subprocess.run([sys.executable, "scripts/audit-base-word-family-pair-compatibility.py"], cwd=ROOT, check=True)
with AUDIT.open(newline="", encoding="utf-8") as handle:
    rows = list(csv.DictReader(handle))

assert len(rows) == 85, f"expected 85 approved IDENTIFY_BASE families, found {len(rows)}"
ready = [row for row in rows if row["compatibility_status"] == "pair_ready"]
blocked = [row["base_family_key"] for row in rows if row["compatibility_status"] != "pair_ready"]
assert len(ready) == 82, f"expected 82 pair-ready families, found {len(ready)}"
assert blocked == ["bed_base_family", "foot_base_family", "sun_base_family"], f"unexpected blocked families: {blocked}"
assert all(int(row["recommended_combined_related_words"]) >= 4 for row in ready), "pair-ready rows must supply four related words"
print("base-word-family-pair-compatibility-regression: ok")
