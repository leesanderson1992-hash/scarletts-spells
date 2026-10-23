#!/usr/bin/env python3
"""Create a per-skill handoff from the captured and verified Production baseline."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data/adle/homophone/convergence-v1"
manifest = json.loads((DIR / "manifest.json").read_text())
baseline = json.loads((DIR / "production-baseline.json").read_text())
approved = {row["normalised_word"].replace("’", "'") for row in baseline["dictionary"]
            if row["row_status"] == "active" and row["review_status"] == "approved_for_first_exposure"}
heads = {row["micro_skill_key"]: row for row in baseline["activationHeads"]
         if row["environment_key"] == "production" and row["activation_status"] == "enabled"}
reuse = {
    "D4_HOM_CONFUSABLE_WORDS_OF_OFF",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_WHO_S_WHOSE",
    "D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS",
}
with (DIR / "readiness-report.csv").open("w", encoding="utf-8", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(["micro_skill_key", "lesson_plan", "production_route_status", "contrast_set_count",
                     "word_count", "missing_dictionary_words", "outstanding"])
    for skill in manifest["skills"]:
        key = skill["key"]
        words = sorted({word for group in skill["sets"] for word in group["members"]})
        missing = sorted(set(words) - approved)
        if skill["routeStatus"] == "retain_v2":
            assert key in heads, f"Retained route has no activation head: {key}"
            plan = "retain_existing_v2"
            route = "enabled_v2"
            outstanding = "review word-set relationships for convergence; no lesson or route change"
        else:
            assert key not in heads, f"New route unexpectedly active: {key}"
            plan = "adapt_released_content" if key in reuse else "new_specialist_lesson"
            route = "not_activated"
            outstanding = "review contrast sets; author and review contextual lesson; wire/publish/activate v1 route"
            if missing:
                outstanding = "import reviewed dictionary facts; " + outstanding
        writer.writerow([key, plan, route, len(skill["sets"]), len(words), ";".join(missing), outstanding])
print("Wrote 68-row homophone readiness report")
