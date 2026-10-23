#!/usr/bin/env python3
"""Flatten unsigned contextual-choice lesson drafts into a reviewable CSV."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data/adle/homophone/convergence-v1"
SOURCE = DIR / "editorial-draft-lessons.json"
OUTPUT = DIR / "lesson-drafts.csv"

FIELDS = [
    "micro_skill_key", "content_version", "review_status", "teaching_explanation",
    "common_misconception", "lesson_set_count", "lesson_question_count",
    "set_key", "proposed_relation_kind", "set_members", "question_id",
    "target_word", "grammatical_role", "intended_sense", "teaching_sentence",
    "sentence_with_blank", "choice_options", "correct_answer", "evidence_mode",
]

package = json.loads(SOURCE.read_text(encoding="utf-8"))
assert package["reviewStatus"] == "draft" and len(package["lessons"]) == 58
result = []
for lesson in package["lessons"]:
    assert lesson["reviewStatus"] == "draft"
    sets = {item["setKey"]: item for item in lesson["sets"]}
    assert len(sets) == len(lesson["sets"])
    for question in lesson["questions"]:
        item = sets[question["setKey"]]
        members = {member["word"]: member for member in item["members"]}
        member = members[question["correctWord"]]
        assert question["optionWords"] == list(members)
        assert question["sentenceWithBlank"] == member["sentenceWithBlank"]
        result.append({
            "micro_skill_key": lesson["microSkillKey"],
            "content_version": lesson["contentVersion"],
            "review_status": lesson["reviewStatus"],
            "teaching_explanation": lesson["teachingExplanation"],
            "common_misconception": lesson["commonMisconception"],
            "lesson_set_count": len(sets),
            "lesson_question_count": len(lesson["questions"]),
            "set_key": item["setKey"],
            "proposed_relation_kind": item["relationKindCandidate"],
            "set_members": " | ".join(members),
            "question_id": question["questionId"],
            "target_word": member["word"],
            "grammatical_role": member["grammaticalRole"],
            "intended_sense": member["intendedSense"],
            "teaching_sentence": member["teachingSentence"],
            "sentence_with_blank": question["sentenceWithBlank"],
            "choice_options": " | ".join(question["optionWords"]),
            "correct_answer": question["correctWord"],
            "evidence_mode": question["evidenceMode"],
        })

assert len(result) == 152 and len({row["micro_skill_key"] for row in result}) == 58
with OUTPUT.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(result)
print(f"Wrote {len(result)} question rows across 58 lesson drafts to {OUTPUT}")
