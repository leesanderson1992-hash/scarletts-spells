#!/usr/bin/env python3
"""Run local LanguageTool as a secondary comparator over exposed failures."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path
from typing import Any

import psutil


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def utf16_length(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def run_with_peak_rss(command: list[str]) -> tuple[subprocess.CompletedProcess[str], float, int]:
    started = time.perf_counter()
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    tracked = psutil.Process(process.pid)
    peak = 0
    while process.poll() is None:
        try:
            processes = [tracked, *tracked.children(recursive=True)]
            peak = max(peak, sum(item.memory_info().rss for item in processes if item.is_running()))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        time.sleep(0.02)
    stdout, stderr = process.communicate()
    completed = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
    return completed, time.perf_counter() - started, peak


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("runtime_output", type=Path)
    parser.add_argument("--java", type=Path, required=True)
    parser.add_argument("--jar", type=Path, required=True)
    parser.add_argument("--scratch", type=Path, required=True)
    args = parser.parse_args()
    rows = read_jsonl(args.input)
    args.scratch.mkdir(parents=True, exist_ok=True)

    chunks: list[str] = []
    for row in rows:
        text = row["candidate"]["sourceText"]
        if text not in chunks:
            chunks.append(text)

    batch_size = 100
    batch_matches: list[list[dict[str, Any]]] = []
    text_locations: dict[str, dict[str, int]] = {}
    batch_texts: list[str] = []
    for batch_index, batch_start in enumerate(range(0, len(chunks), batch_size)):
        batch = chunks[batch_start: batch_start + batch_size]
        cursor = 0
        for text in batch:
            text_locations[text] = {"batch": batch_index, "start": cursor}
            cursor += utf16_length(text) + 2
        batch_texts.append("\n\n".join(batch))
    locations = []
    for row in rows:
        candidate = row["candidate"]
        base = text_locations[candidate["sourceText"]]
        locations.append({
            "batch": base["batch"],
            "start": base["start"] + candidate["startUtf16"],
            "end": base["start"] + candidate["endUtf16"],
        })

    version_result = subprocess.run([str(args.java), "-jar", str(args.jar), "--version"], capture_output=True, text=True, check=True)
    seconds = 0.0
    peak_rss = 0
    for batch_index, aggregate in enumerate(batch_texts):
        input_path = args.scratch / f"exposed-failures-{batch_index:03d}.txt"
        input_path.write_text(aggregate)
        command = [str(args.java), "-Xms128m", "-Xmx1g", "-jar", str(args.jar), "--json", "-l", "en-GB", str(input_path)]
        completed, elapsed, batch_peak = run_with_peak_rss(command)
        if completed.returncode != 0:
            raise RuntimeError(f"LanguageTool failed ({completed.returncode}): {completed.stderr}")
        seconds += elapsed
        peak_rss = max(peak_rss, batch_peak)
        batch_matches.append(json.loads(completed.stdout).get("matches", []))

    status_counts = {"correct_alternative": 0, "wrong_or_policy_unsafe": 0, "no_target_match": 0}
    for row, location in zip(rows, locations, strict=True):
        target_matches = []
        for match in batch_matches[location["batch"]]:
            match_start = match["offset"]
            match_end = match_start + match["length"]
            if match_start < location["end"] and match_end > location["start"]:
                target_matches.append({
                    "ruleId": match["rule"]["id"],
                    "category": match["rule"].get("category", {}).get("id"),
                    "message": match["message"],
                    "offsetWithinFocus": match_start - location["start"],
                    "length": match["length"],
                    "replacements": [replacement["value"] for replacement in match.get("replacements", [])[:12]],
                })
        gold = row["gold"]
        intended = gold["intendedAlternative"]
        replacements = {value.lower() for match in target_matches for value in match["replacements"]}
        if gold["classification"] == "INVALID" and intended and intended.lower() in replacements:
            comparator = "correct_alternative"
        elif target_matches:
            comparator = "wrong_or_policy_unsafe"
        else:
            comparator = "no_target_match"
        status_counts[comparator] += 1
        row["languageTool"] = {"targetMatches": target_matches, "comparatorOutcome": comparator}

    rendered = "".join(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n" for row in rows)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered)
    runtime = {
        "schemaVersion": 1,
        "purpose": "secondary_diagnostic_comparator_only",
        "version": version_result.stdout.strip() or version_result.stderr.strip(),
        "language": "en-GB",
        "inputCases": len(rows),
        "uniqueSourceTexts": len(chunks),
        "elapsedSeconds": seconds,
        "casesPerSecond": len(rows) / seconds,
        "peakRssBytes": peak_rss,
        "aggregateUtf16Units": sum(utf16_length(text) for text in batch_texts),
        "allMatches": sum(len(matches) for matches in batch_matches),
        "targetOutcomeCounts": status_counts,
        "outputSha256": hashlib.sha256(rendered.encode()).hexdigest(),
        "inputArchiveSha256": hashlib.sha256("\n\n---BATCH---\n\n".join(batch_texts).encode()).hexdigest(),
    }
    args.runtime_output.write_text(json.dumps(runtime, indent=2, sort_keys=True) + "\n")
    print(json.dumps(runtime, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
