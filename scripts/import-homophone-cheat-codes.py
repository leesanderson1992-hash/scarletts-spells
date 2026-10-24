#!/usr/bin/env python3
"""Pin the supplied word-page cheat codes to approved convergence contrast sets."""

import csv
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "data/adle/homophone/convergence-v1/approved-lesson-content.json"
OUTPUT = ROOT / "data/adle/homophone/convergence-v1/approved-cheat-codes.json"


def group_key(words):
    return frozenset(word.strip().casefold() for word in words)


def main(source_path):
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    with source_path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    by_group_word = {}
    for row in rows:
        key = (group_key(row["Group"].split("/")), row["Word"].strip().casefold())
        if key in by_group_word and by_group_word[key] != row:
            raise ValueError(f"Conflicting cheat code row: {row['Group']} / {row['Word']}")
        by_group_word[key] = row
    records = []
    for lesson in content["lessons"]:
        for contrast in lesson["sets"]:
            members = [member["word"] for member in contrast["members"]]
            for member in contrast["members"]:
                row = by_group_word.get((group_key(members), member["word"].casefold()))
                if not row or not row["Kid's ultimate cheat code"].strip():
                    raise ValueError(f"Missing cheat code: {contrast['setKey']} / {member['word']}")
                records.append({
                    "setKey": contrast["setKey"],
                    "word": member["word"],
                    "pageHeading": row["Page heading"],
                    "cheatCode": row["Kid's ultimate cheat code"],
                    "imageDescription": row["One-image description"],
                    "highlightSpelling": row["Highlight this spelling"],
                })
    OUTPUT.write_text(json.dumps({
        "sourceFile": source_path.name,
        "sourceSha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
        "contentVersion": content["contentVersion"],
        "wordPages": records,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"contrastSets": sum(len(lesson["sets"]) for lesson in content["lessons"]),
                      "wordPages": len(records), "output": str(OUTPUT)}))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: import-homophone-cheat-codes.py <word-pages.csv>")
    main(Path(sys.argv[1]))
