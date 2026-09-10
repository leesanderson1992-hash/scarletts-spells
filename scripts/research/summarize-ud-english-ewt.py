#!/usr/bin/env python3
"""Summarize relevant annotations in a pinned local UD English-EWT checkout."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


TARGET_FORMS = {"there", "their", "they", "'re", "to", "too", "two"}
REQUESTED_TEXTS = {
    "I look forward to seeing you all there.",
    "great, we look forward to seeing you.",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("treebank", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    files = sorted(args.treebank.glob("*.conllu"))
    distributions: dict[str, Counter[tuple[str, str]]] = defaultdict(Counter)
    requested_examples: list[dict[str, Any]] = []
    typo_examples: list[dict[str, Any]] = []
    token_total = 0
    sentence_total = 0
    for path in files:
        for block in path.read_text().split("\n\n"):
            lines = block.splitlines()
            text = next((line.removeprefix("# text = ") for line in lines if line.startswith("# text = ")), None)
            tokens = []
            for line in lines:
                columns = line.split("\t")
                if len(columns) != 10 or "-" in columns[0] or "." in columns[0]:
                    continue
                token_total += 1
                record = {
                    "id": columns[0], "form": columns[1], "lemma": columns[2], "upos": columns[3],
                    "xpos": columns[4], "features": columns[5], "head": columns[6],
                    "relation": columns[7], "misc": columns[9],
                }
                tokens.append(record)
                form = columns[1].lower()
                if form in TARGET_FORMS:
                    distributions[form][(columns[3], columns[7])] += 1
            if tokens:
                sentence_total += 1
            if text in REQUESTED_TEXTS:
                requested_examples.append({"text": text, "tokens": tokens})
            if len(typo_examples) < 12 and any(
                token["form"].lower() in {"their", "there", "they're"} and "CorrectForm=" in token["misc"]
                for token in tokens
            ):
                typo_examples.append({"text": text, "tokens": tokens})

    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=args.treebank, capture_output=True, text=True, check=True
    ).stdout.strip()
    result = {
        "schemaVersion": 1,
        "purpose": "development_regression_reference_only",
        "repository": "https://github.com/UniversalDependencies/UD_English-EWT",
        "commit": commit,
        "license": "CC BY-SA 4.0",
        "files": [{"name": path.name, "sha256": sha256(path)} for path in files],
        "sentences": sentence_total,
        "tokens": token_total,
        "targetFormDistribution": {
            form: [
                {"upos": key[0], "relation": key[1], "count": count}
                for key, count in sorted(distribution.items(), key=lambda item: (-item[1], item[0]))
            ]
            for form, distribution in sorted(distributions.items())
        },
        "requestedGerundExamples": requested_examples,
        "annotatedHomophoneTypoExamples": typo_examples,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"output": str(args.output), "commit": commit, "sentences": sentence_total, "tokens": token_total}, indent=2))


if __name__ == "__main__":
    main()
