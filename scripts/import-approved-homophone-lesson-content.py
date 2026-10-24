#!/usr/bin/env python3
"""Freeze the owner-approved homophone workbook as deterministic lesson data."""

import csv
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "data/adle/homophone/convergence-v1"
OUTPUT = DIRECTORY / "approved-lesson-content.json"


def sheet_rows(workbook, name):
    values = workbook[name].values
    headers = next(values)
    return [dict(zip(headers, row)) for row in values if row and row[0]]


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: import-approved-homophone-lesson-content.py <approved workbook.xlsx>")
    source = Path(sys.argv[1]).resolve()
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    original = sheet_rows(workbook, "Original lessons")
    shorts = sheet_rows(workbook, "Short sentences")
    passages = sheet_rows(workbook, "Two-sentence passages")
    checks = sheet_rows(workbook, "Coverage checks")
    if (len(original), len(shorts), len(passages), len(checks)) != (152, 1510, 203, 74):
        raise ValueError("approved workbook cardinality changed")
    if any(row["review_status"] != "approved" for row in original + shorts + passages):
        raise ValueError("workbook has unapproved lesson content")
    if any(row[field] != "PASS" for row in checks for field in
           ("passage_members_balanced", "distinct_member_each_passage", "target_member_verified")):
        raise ValueError("workbook coverage check failed")
    contrast_source = DIRECTORY / "contrast-set-review.csv"
    with contrast_source.open(encoding="utf-8", newline="") as stream:
        reviewed = list(csv.DictReader(stream))
    if len(reviewed) != 175 or any(row["review_status"] != "approved" for row in reviewed):
        raise ValueError("contrast sets are not approved")
    grouped = {name: defaultdict(list) for name in ("original", "shorts", "passages", "members")}
    for name, rows in (("original", original), ("shorts", shorts), ("passages", passages)):
        for row in rows:
            grouped[name][(row["micro_skill_key"], row["set_key"])].append(row)
    for row in reviewed:
        grouped["members"][(row["micro_skill_key"], row["set_key"])].append(row)
    expected = set(grouped["original"])
    if len(expected) != 74 or not expected <= set(grouped["members"]) or any(
            set(grouped[name]) != expected for name in ("shorts", "passages")):
        raise ValueError("workbook/contrast set keys differ")
    by_skill = defaultdict(list)
    for key in sorted(expected):
        skill_key, set_key = key
        members = sorted(grouped["members"][key], key=lambda row: int(row["member_ordinal"]))
        words = [row["word"] for row in members]
        short_rows = grouped["shorts"][key]
        passage_rows = grouped["passages"][key]
        if any(row["set_members"].split(" | ") != words for row in short_rows + grouped["original"][key]):
            raise ValueError(f"set membership differs from approved contrast review: {set_key}")
        if any(row["sentence_1_member"] not in words for row in short_rows):
            raise ValueError(f"unknown short-sentence member: {set_key}")
        if any(row["sentence_1_member"] not in words or row["sentence_2_member"] not in words
               or row["sentence_1_member"] == row["sentence_2_member"] for row in passage_rows):
            raise ValueError(f"invalid passage membership: {set_key}")
        if any(row["correct_answer"] not in words or row["sentence_with_blank"].count("____") != 1
               for row in grouped["original"][key]):
            raise ValueError(f"invalid sentence-choice question: {set_key}")
        by_skill[skill_key].append({
            "setKey": set_key,
            "relationKind": members[0]["reviewed_relation_kind"],
            "members": [{"word": row["word"], "intendedSense": row["intended_sense"],
                         "grammaticalRole": row["grammatical_role"], "teachingSentence": row["target_sentence"]}
                        for row in members],
            "shortSentences": [{"id": row["item_id"], "word": row["sentence_1_member"],
                                "sentence": row["sentence_1"], "intendedSense": row["sentence_1_intended_sense"]}
                               for row in short_rows],
            "passages": [{"id": row["item_id"], "firstWord": row["sentence_1_member"],
                          "firstSentence": row["sentence_1"], "secondWord": row["sentence_2_member"],
                          "secondSentence": row["sentence_2"]} for row in passage_rows],
            "choiceQuestions": [{"id": row["question_id"], "word": row["correct_answer"],
                                 "sentenceWithBlank": row["sentence_with_blank"]}
                                for row in grouped["original"][key]],
        })
    if len(by_skill) != 58:
        raise ValueError("expected 58 lessons")
    lessons = []
    for skill_key in sorted(by_skill):
        first = next(row for row in original if row["micro_skill_key"] == skill_key)
        lessons.append({"microSkillKey": skill_key, "teachingExplanation": first["teaching_explanation"],
                        "commonMisconception": first["common_misconception"], "sets": by_skill[skill_key]})
    result = {"schemaVersion": 1, "contentVersion": "homophone-convergence-approved-2026-10-23-v1",
              "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "contrastSourceSha256": hashlib.sha256(contrast_source.read_bytes()).hexdigest(),
              "approvalReference": "Owner approval in Codex chat, 2026-10-23; approved workbook statuses",
              "lessons": lessons}
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "lessons": len(lessons), "sets": len(expected),
                      "shortSentences": len(shorts), "passages": len(passages),
                      "choiceQuestions": len(original)}))


if __name__ == "__main__":
    main()
