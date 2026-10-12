"""Create an inactive homophone candidate from approved Balloon Pop sentences.

The workbook supplies authored prompts only. Teaching, Bin Sort, Cover Check,
dictation, images, and feedback reasons are copied from the previous candidate.
Run with the workspace Python bundle (which includes openpyxl).
"""

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import load_workbook

HEADERS = (
    "Microskill", "No.", "Very short sentence", "Sentence with gap",
    "Correct word", "Word choices", "Meaning tested", "micro_skill_key",
)
GAP = re.compile(r"(?<!_)___(?!_)")


def normalized(text):
    return text.strip().casefold().replace("’", "'")


def approved_prompts(path, lessons):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook["Sheet3"]
        rows = sheet.values
        assert tuple(next(rows)[:8]) == HEADERS, "Sheet3 columns changed"
        by_key = defaultdict(list)
        word_sets = {lesson["microSkillKey"]: {word["word"] for word in lesson["words"]} for lesson in lessons}
        for row_number, row in enumerate(rows, 2):
            if not any(value is not None for value in row):
                continue
            _, number, full, gap_text, answer, choices, _, key = row[:8]
            assert key in word_sets, f"Unknown micro-skill at Sheet3 row {row_number}: {key}"
            assert isinstance(number, int) and 1 <= number <= 20, f"Invalid prompt number at row {row_number}"
            assert all(isinstance(value, str) and value.strip() for value in (full, gap_text, answer, choices)), f"Missing prompt field at row {row_number}"
            assert len(GAP.findall(gap_text)) == 1 and "____" not in gap_text, f"Expected one three-underscore gap at row {row_number}"
            canonical = {normalized(word): word for word in word_sets[key]}
            assert normalized(answer) in canonical, f"Answer outside word set at row {row_number}"
            choice_words = {normalized(word) for word in choices.split("/")}
            assert choice_words == set(canonical), f"Word choices differ from lesson at row {row_number}"
            assert normalized(GAP.sub(answer, gap_text)) == normalized(full), f"Full sentence disagrees with gap at row {row_number}"
            by_key[key].append({"number": number, "sentence": GAP.sub("____", gap_text), "answer": canonical[normalized(answer)]})
        assert set(by_key) == set(word_sets), "Workbook and candidate micro-skills differ"
        for key, prompts in by_key.items():
            assert len(prompts) == 20 and [prompt["number"] for prompt in prompts] == list(range(1, 21)), f"Expected numbered prompts 1–20: {key}"
            assert len({normalized(prompt["sentence"]) for prompt in prompts}) == 20, f"Duplicate prompts: {key}"
            assert set(Counter(prompt["answer"] for prompt in prompts)) == word_sets[key], f"Missing answer word: {key}"
        return by_key
    finally:
        workbook.close()


def build(previous_path, workbook_path):
    previous = json.loads(previous_path.read_text())
    assert previous["contentVersion"] == "d4-hom-v2" and len(previous["lessons"]) == 14
    lessons = previous["lessons"]
    prompts = approved_prompts(workbook_path, lessons)
    for lesson in lessons:
        lesson["balloonPrompts"] = [
            {"sentence": prompt["sentence"], "answer": prompt["answer"]}
            for prompt in prompts[lesson["microSkillKey"]]
        ]
    content_hash = hashlib.sha256(json.dumps(lessons, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    return {
        **{key: value for key, value in previous.items() if key != "lessons"},
        "schemaVersion": 3,
        "contentVersion": "d4-hom-v3",
        "reviewStatus": "balloon_prompts_approved_candidate_inactive",
        "runtimeEnabled": False,
        "previousContentSha256": previous["contentSha256"],
        "balloonSourceSha256": hashlib.sha256(workbook_path.read_bytes()).hexdigest(),
        "balloonSourceSheet": "Sheet3",
        "contentSha256": content_hash,
        "lessons": lessons,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("previous_candidate", type=Path)
    parser.add_argument("approved_workbook", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    candidate = build(args.previous_candidate, args.approved_workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + "\n")
