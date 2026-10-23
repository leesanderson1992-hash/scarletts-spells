#!/usr/bin/env python3
"""Build a review-only convergence manifest from the owner-supplied microskill CSV.

The manifest is deliberately not a dictionary import or a release authority.
"""

import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data/adle/homophone/convergence-v1"
SOURCE = DIR / "source-microskills.csv"
OUT = DIR / "manifest.json"
PREFIX = "D4_HOM_"
RETAINED = {
    "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE",
    "D4_HOM_CONTENT_WORD_HOMOPHONES_THREW_THROUGH",
    "D4_HOM_CONTENT_WORD_HOMOPHONES_SEE_SEA",
    "D4_HOM_CONTENT_WORD_HOMOPHONES_RIGHT_WRITE",
    "D4_HOM_CONTENT_WORD_HOMOPHONES_FLOWER_FLOUR",
    "D4_HOM_CONTENT_WORD_HOMOPHONES_HERD_HEARD",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE",
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR",
    "D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE",
}
MULTI = {
    "D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY": [
        ["advice", "advise"], ["device", "devise"], ["practice", "practise"],
        ["licence", "license"], ["prophecy", "prophesy"],
    ],
    "D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T": [
        ["missed", "mist"], ["guessed", "guest"], ["past", "passed"],
        ["least", "leased"], ["packed", "pact"],
    ],
    "D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS": [
        ["it's", "its"], ["we're", "were"], ["I'll", "ill"],
        ["we'll", "well"], ["she'd", "shed"], ["we'd", "wed"],
        ["he'll", "hell"], ["she'll", "shell"], ["let's", "lets"],
    ],
}
OVERRIDE = {
    "D4_HOM_CONTENT_WORD_HOMOPHONES_SENT_CENT": (
        "D4_HOM_CONTENT_WORD_HOMOPHONES_SENT_CENT_SCENT", ["sent", "cent", "scent"]
    ),
    "D4_HOM_CONTENT_WORD_HOMOPHONES_PIECE_PEACE": (
        "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE", ["peace", "piece"]
    ),
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEY_RE": (
        "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE", ["there", "their", "they're"]
    ),
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_WHERE_WEAR_WE_RE": (
        "D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR", ["were", "where", "wear"]
    ),
}
ADDED = {
    "key": "D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE",
    "sourceKey": "D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE",
    "description": "Choose your or you're by meaning and context",
    "sets": [{"setKey": "YOUR_YOURE", "members": ["your", "you're"]}],
}
RETIRE = {
    "D4_HOM_CONTENT_WORD_HOMOPHONES_COMMON_VERB_NOUN_PAIRS": [
        "D4_HOM_CONTENT_WORD_HOMOPHONES_ALLOWED_ALOUD", "D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T"],
    "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF": [
        "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR", "D4_HOM_CONFUSABLE_WORDS_OF_OFF"],
    "D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS": ["D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS"],
    "D4_HOM_CONTRACTION_POSSESSIVE_WERE_WERE": ["D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS"],
    "D4_HOM_CONTRACTION_POSSESSIVE_WHOS_WHOSE": ["D4_HOM_FUNCTION_WORD_HOMOPHONES_WHO_S_WHOSE"],
    "D4_HOM_CONTENT_WORD_HOMOPHONES_PIECE_PEACE": ["D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE"],
}
ABSENT = {
    "devise", "dissent", "draught", "loose", "lose", "practise", "precede",
    "prophecy", "prophesy", "wary", "weary", "ascent", "assent", "bawl",
    "bridal", "bridle", "grate", "groan", "leased", "least", "mane",
    "meddle", "mist", "packed", "pact", "rein", "sent", "stationary",
    "stationery", "buy", "bye", "hell", "ill", "lets", "she'd", "shed",
    "we'd", "wed",
}


def normalize(word: str) -> str:
    return word.strip().lower().replace("’", "'")


def pair_from_description(description: str) -> list[str]:
    match = re.match(r"Choose (.+?) by meaning and context", description, re.I)
    if not match:
        raise ValueError(f"Cannot parse members: {description}")
    return [normalize(w) for w in re.split(r",\s*|\s+or\s+", match.group(1))]


def build() -> dict:
    rows = []
    with SOURCE.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.reader(file):
            if len(row) > 3 and row[2].startswith(PREFIX):
                rows.append((row[2], row[3], row[4] if len(row) > 4 else ""))
    if len(rows) != 67:
        raise ValueError(f"Expected 67 source microskills, found {len(rows)}")
    skills = []
    for source_key, description, note in rows:
        key, members = OVERRIDE.get(source_key, (source_key, None))
        if key in MULTI:
            sets = [{"setKey": f"{key}:{normalize(pair[0]).replace(chr(39), '')}-{normalize(pair[1]).replace(chr(39), '')}",
                     "members": [normalize(w) for w in pair]}
                    for pair in MULTI[key]]
        else:
            members = members or pair_from_description(description)
            sets = [{"setKey": key.removeprefix(PREFIX), "members": members}]
        if source_key.endswith("_SENT_CENT"):
            description = "Choose sent, cent or scent by meaning and context"
        skills.append({"key": key, "sourceKey": source_key, "description": description,
                       "sourceNote": note, "sets": sets})
    skills.append(ADDED)
    keys = [skill["key"] for skill in skills]
    words = sorted({word for skill in skills for group in skill["sets"] for word in group["members"]})
    groups = [group for skill in skills for group in skill["sets"]]
    if len(skills) != 68 or len(set(keys)) != 68 or len(words) != 173 or len(ABSENT) != 38 or not ABSENT <= set(words):
        raise ValueError(f"Convergence cardinality mismatch: skills={len(skills)} keys={len(set(keys))} "
                         f"words={len(words)} missing_subset={len(ABSENT & set(words))}")
    if len(groups) != 84 or len({group["setKey"] for group in groups}) != 84 or sum(len(group["members"]) for group in groups) != 175:
        raise ValueError("Contrast-set cardinality mismatch")
    for skill in skills:
        skill["routeStatus"] = "retain_v2" if skill["key"] in RETAINED else "needs_contextual_choice_v1"
        skill["reviewStatus"] = "draft_requires_editorial_review"
    if sum(skill["routeStatus"] == "retain_v2" for skill in skills) != 10:
        raise ValueError("Retained lesson count changed")
    return {
        "schemaVersion": 1, "status": "draft_requires_editorial_review",
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "targetSkillCount": 68, "retainedV2Count": 10, "newLessonCount": 58,
        "distinctWordCount": 173, "absentDictionaryWords": sorted(ABSENT),
        "sourceRetirements": RETIRE, "skills": skills,
    }


def write_review_files(manifest: dict) -> None:
    with (DIR / "dictionary-intake-review.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        headers = ["word", "target_micro_skills", "en_gb_pronunciation", "syllables",
                   "stress_pattern", "has_schwa", "grapheme_notes", "frequency_band", "age_band", "complexity_band",
                   "morphemes", "morphology_notes", "morphology_parts_json", "child_facing_word_sum",
                   "reviewed_definition", "contextual_target_sentence", "dictation_sentence",
                   "dictation_target_index", "dictation_audio_text", "source_category", "source_name",
                   "source_url_or_reference", "source_licence", "source_importability_status",
                   "source_legal_review_status", "reviewed_by", "reviewed_at", "review_status"]
        writer.writerow(headers)
        for word in manifest["absentDictionaryWords"]:
            keys = sorted(skill["key"] for skill in manifest["skills"]
                          if any(word in group["members"] for group in skill["sets"]))
            writer.writerow([word, ";".join(keys), *([""] * (len(headers) - 3)), "draft"])
    with (DIR / "contrast-set-review.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["micro_skill_key", "set_key", "member_ordinal", "word",
                         "proposed_relation_kind", "reviewed_relation_kind", "intended_sense",
                         "grammatical_role", "target_sentence", "sense_source_reference",
                         "reviewed_by", "approval_reference", "review_status"])
        for skill in manifest["skills"]:
            key = skill["key"]
            proposed = ("morphological_contrast" if key.endswith("SE_SY_CE_CY") else
                        "contraction_real_word" if key.endswith("HOMOPHONES_PAIRS") else
                        "confusable" if key.startswith("D4_HOM_CONFUSABLE_WORDS") else
                        "homophone")
            for group in skill["sets"]:
                for ordinal, word in enumerate(group["members"], 1):
                    writer.writerow([key, group["setKey"], ordinal, word, proposed,
                                     "", "", "", "", "", "", "", "draft"])
    with (DIR / "lesson-content-review.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["micro_skill_key", "source_description", "teaching_explanation",
                         "common_misconception", "sentence_choice_items_reference",
                         "reviewed_by", "approval_reference", "review_status"])
        for skill in manifest["skills"]:
            if skill["routeStatus"] == "needs_contextual_choice_v1":
                writer.writerow([skill["key"], skill["description"], "", "", "", "", "", "draft"])
    with (DIR / "redirect-review.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["source_skill_key", "destination_skill_key", "intake_redirect_status",
                         "evidence_migration_rule", "reviewed_by", "approval_reference"])
        for source, destinations in manifest["sourceRetirements"].items():
            for destination in destinations:
                writer.writerow([source, destination, "draft", "requires_case_review", "", ""])


if __name__ == "__main__":
    manifest = build()
    if OUT.exists():
        if json.loads(OUT.read_text()) != manifest:
            raise ValueError("Frozen convergence manifest differs; create a new version instead of rewriting v1")
    else:
        OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    review_names = ["dictionary-intake-review.csv", "contrast-set-review.csv",
                    "lesson-content-review.csv", "redirect-review.csv"]
    existing = [(DIR / name).exists() for name in review_names]
    if any(existing) and not all(existing):
        raise ValueError("Incomplete review packet; do not regenerate over reviewer edits")
    if not any(existing):
        write_review_files(manifest)
    # The Phase 1 SQL files are already in the migration ledger and are immutable.
    print(f"Verified {OUT}: {manifest['targetSkillCount']} skills, {manifest['distinctWordCount']} words")
