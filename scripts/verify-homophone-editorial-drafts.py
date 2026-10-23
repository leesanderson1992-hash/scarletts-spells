#!/usr/bin/env python3
"""Check that unsigned homophone drafts cover every required word and set."""

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data/adle/homophone/convergence-v1"


def rows(name):
    with (DIR / name).open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


def target_count(sentence, word):
    return len(re.findall(r"(?<![\w’'])" + re.escape(word) + r"(?![\w’'])", sentence, re.I))


manifest = json.loads((DIR / "manifest.json").read_text(encoding="utf-8"))
package = json.loads((DIR / "editorial-draft-lessons.json").read_text(encoding="utf-8"))
dictionary = rows("dictionary-intake-review.csv")
members = rows("contrast-set-review.csv")
lesson_review = rows("lesson-content-review.csv")
expected = {(skill["key"], group["setKey"], str(i), word)
            for skill in manifest["skills"] for group in skill["sets"]
            for i, word in enumerate(group["members"], 1)}
actual = {(row["micro_skill_key"], row["set_key"], row["member_ordinal"], row["word"])
          for row in members}
assert actual == expected and len(members) == len(expected) == 175
for row in members:
    assert row["review_status"] == "approved" and row["reviewed_by"] and row["approval_reference"]
    assert row["proposed_relation_kind"] in {"homophone", "near_homophone", "confusable",
                                             "morphological_contrast", "contraction_real_word"}
    assert row["reviewed_relation_kind"] == row["proposed_relation_kind"]
    assert row["intended_sense"] and row["grammatical_role"] and row["sense_source_reference"]
    assert target_count(row["target_sentence"], row["word"]) == 1
    assert len(row["target_sentence"].split()) >= 4 and row["target_sentence"][-1] in ".!?"

assert {row["word"] for row in dictionary} == set(manifest["absentDictionaryWords"])
assert len(dictionary) == 38
for row in dictionary:
    assert row["review_status"] == "draft" and not row["reviewed_by"] and not row["reviewed_at"]
    assert row["source_importability_status"] == "requires_editorial_review"
    assert row["source_legal_review_status"] == "required"
    assert row["en_gb_pronunciation"].startswith("/") and row["en_gb_pronunciation"].endswith("/")
    assert int(row["syllables"]) >= 1 and len(row["stress_pattern"].split("-")) == int(row["syllables"])
    assert row["frequency_band"] in {"high", "medium", "low"}
    assert row["age_band"] in {"early_primary", "middle_primary", "upper_primary"}
    assert row["complexity_band"] in {"low", "medium", "high"}
    assert isinstance(json.loads(row["morphology_parts_json"]), list)
    assert target_count(row["dictation_sentence"], row["word"]) == 1
    tokens = re.findall(r"[\w]+(?:['’][\w]+)?", row["dictation_sentence"])
    assert tokens[int(row["dictation_target_index"])].lower() == row["word"]
    assert row["dictation_audio_text"] == row["dictation_sentence"]

new = [skill for skill in manifest["skills"] if skill["routeStatus"] != "retain_v2"]
assert len(new) == len(package["lessons"]) == len(lesson_review) == 58
by_key = {lesson["microSkillKey"]: lesson for lesson in package["lessons"]}
assert set(by_key) == {skill["key"] for skill in new}
question_count = 0
exported = rows("lesson-drafts.csv")
assert len(exported) == 152
exported_by_question = {(row["micro_skill_key"], row["question_id"]): row for row in exported}
assert len(exported_by_question) == 152
for skill in new:
    lesson = by_key[skill["key"]]
    assert lesson["reviewStatus"] == "draft" and lesson["teachingExplanation"]
    assert lesson["commonMisconception"]
    sets = {item["setKey"]: item for item in lesson["sets"]}
    assert set(sets) == {group["setKey"] for group in skill["sets"]}
    assert len(sets) == len(lesson["sets"])
    questions = lesson["questions"]
    assert len(questions) == sum(len(item["members"]) for item in sets.values())
    assert len({question["questionId"] for question in questions}) == len(questions)
    for question in questions:
        item = sets[question["setKey"]]
        options = [member["word"] for member in item["members"]]
        assert question["optionWords"] == options and question["correctWord"] in options
        assert question["evidenceMode"] == "independent_sentence"
        assert question["sentenceWithBlank"].count("____") == 1
        assert len(question["sentenceWithBlank"].split()) >= 4
        assert question["sentenceWithBlank"][-1] in ".!?"
        member = next(m for m in item["members"] if m["word"] == question["correctWord"])
        assert question["sentenceWithBlank"] == member["sentenceWithBlank"]
        flat = exported_by_question[(skill["key"], question["questionId"])]
        assert flat["review_status"] == "draft"
        assert flat["set_key"] == item["setKey"]
        assert flat["sentence_with_blank"] == question["sentenceWithBlank"]
        assert flat["choice_options"] == " | ".join(question["optionWords"])
        assert flat["correct_answer"] == question["correctWord"]
        assert flat["intended_sense"] == member["intendedSense"]
    for item in sets.values():
        assert {q["correctWord"] for q in questions if q["setKey"] == item["setKey"]} == {
            m["word"] for m in item["members"]}
    question_count += len(questions)
for row in lesson_review:
    assert row["review_status"] == "draft" and not row["reviewed_by"] and not row["approval_reference"]
    assert row["teaching_explanation"] == by_key[row["micro_skill_key"]]["teachingExplanation"]
    assert row["sentence_choice_items_reference"] == f"editorial-draft-lessons.json#{row['micro_skill_key']}"

assert question_count == 152
print(json.dumps({"valid": True, "dictionaryWords": 38, "contrastSets": 84,
                  "memberRelationships": 175, "draftLessons": 58,
                  "independentSentenceQuestions": 152,
                  "approvedContrastSets": 84, "dictionaryImportApprovals": 0,
                  "lessonApprovals": 0}, indent=2))
