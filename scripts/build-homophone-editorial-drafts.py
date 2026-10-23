#!/usr/bin/env python3
"""Fill unsigned homophone review sheets from original editorial sentence seeds.

This never sets approval, writes to Production, or changes existing reviewed rows.
"""

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data/adle/homophone/convergence-v1"
MANIFEST = json.loads((DIR / "manifest.json").read_text(encoding="utf-8"))
REFERENCE = {row["word"]: row for row in json.loads(
    (DIR / "pronunciation-reference.json").read_text(encoding="utf-8"))["rows"]}
SEED_LINES = [line for line in (DIR / "editorial-seeds.txt").read_text(encoding="utf-8").splitlines()
              if line.strip() and not line.startswith("#")]
NEW = [skill for skill in MANIFEST["skills"] if skill["routeStatus"] != "retain_v2"]
RETAINED = [skill for skill in MANIFEST["skills"] if skill["routeStatus"] == "retain_v2"]
RETAINED_LINES = [line for line in (DIR / "retained-set-editorial-seeds.txt").read_text(encoding="utf-8").splitlines()
                  if line.strip() and not line.startswith("#")]
NEW_EXPECTED = [(skill, group) for skill in NEW for group in skill["sets"]]
RETAINED_EXPECTED = [(skill, group) for skill in RETAINED for group in skill["sets"]]
assert len(NEW) == 58 and len(NEW_EXPECTED) == len(SEED_LINES) == 74
assert len(RETAINED) == len(RETAINED_EXPECTED) == len(RETAINED_LINES) == 10


def csv_rows(name):
    with (DIR / name).open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        return reader.fieldnames, list(reader)


def write_csv(name, fields, rows):
    with (DIR / name).open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def set_candidates(row, **values):
    """Never silently replace a reviewer's edit to an unsigned candidate."""
    for field, value in values.items():
        if row[field] and row[field] != value:
            raise ValueError(f"Existing draft field differs: {field} in {row.get('word', row.get('set_key', row.get('micro_skill_key')))}")
        row[field] = value


def target_count(sentence, word):
    return len(re.findall(r"(?<![\w’'])" + re.escape(word) + r"(?![\w’'])", sentence, re.I))


def relation(skill, members):
    key = skill["key"]
    if key.endswith("SE_SY_CE_CY") or key.endswith("ED_FOR_T"):
        return "morphological_contrast"
    if key.endswith("HOMOPHONES_PAIRS") or {"heel", "he'll", "heal"} == set(members):
        return "contraction_real_word"
    if key.endswith("WERE_WHERE_WEAR"):
        return "near_homophone"
    if key.startswith("D4_HOM_CONFUSABLE_WORDS"):
        return "confusable"
    return "homophone"


set_drafts = {}
for (skill, group), line in [*zip(NEW_EXPECTED, SEED_LINES), *zip(RETAINED_EXPECTED, RETAINED_LINES)]:
    parts = [segment.split("|", 3) for segment in line.split(";")]
    assert all(len(part) == 4 for part in parts), group["setKey"]
    assert [part[0] for part in parts] == group["members"], group["setKey"]
    members = []
    for word, role, sense, sentence in parts:
        assert target_count(sentence, word) == 1 and len(sentence.split()) >= 4
        assert sentence[-1] in ".!?", (word, sentence)
        members.append({"word": word, "grammaticalRole": role, "intendedSense": sense,
                        "teachingSentence": sentence,
                        "sentenceWithBlank": re.sub(r"(?<![\w’'])" + re.escape(word) + r"(?![\w’'])",
                                                    "____", sentence, count=1, flags=re.I)})
    set_drafts[group["setKey"]] = {"setKey": group["setKey"],
                                   "relationKindCandidate": relation(skill, group["members"]),
                                   "members": members}

fields, rows = csv_rows("contrast-set-review.csv")
for row in rows:
    assert row["review_status"] == "draft" and not row["reviewed_by"] and not row["approval_reference"]
    draft = set_drafts[row["set_key"]]
    member = draft["members"][int(row["member_ordinal"]) - 1]
    assert row["word"] == member["word"]
    set_candidates(row, proposed_relation_kind=draft["relationKindCandidate"],
               intended_sense=member["intendedSense"], grammatical_role=member["grammaticalRole"],
               target_sentence=member["teachingSentence"],
               sense_source_reference="Original ADLE editorial draft; pronunciation reference in dictionary intake")
write_csv("contrast-set-review.csv", fields, rows)

lessons = []
for skill in NEW:
    sets = [set_drafts[group["setKey"]] for group in skill["sets"]]
    glosses = [" / ".join(f"{m['word']} ({m['intendedSense']})" for m in item["members"])
               for item in sets]
    explanation = "Choose by meaning in the whole sentence. Compare " + "; ".join(glosses) + "."
    questions = [{"questionId": f"{item['setKey']}:{member['word']}",
                  "setKey": item["setKey"], "sentenceWithBlank": member["sentenceWithBlank"],
                  "correctWord": member["word"],
                  "optionWords": [m["word"] for m in item["members"]],
                  "evidenceMode": "independent_sentence"}
                 for item in sets for member in item["members"]]
    lessons.append({"microSkillKey": skill["key"], "contentVersion": "editorial-draft-1",
                    "reviewStatus": "draft", "teachingExplanation": explanation,
                    "commonMisconception": "Choosing a word because it looks or sounds familiar without checking its meaning and grammatical role in the sentence.",
                    "sets": sets, "questions": questions})
lesson_path = "editorial-draft-lessons.json"
(DIR / lesson_path).write_text(json.dumps({"schemaVersion": 1, "reviewStatus": "draft",
                                          "lessons": lessons}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
fields, rows = csv_rows("lesson-content-review.csv")
by_key = {lesson["microSkillKey"]: lesson for lesson in lessons}
for row in rows:
    assert row["review_status"] == "draft" and not row["reviewed_by"] and not row["approval_reference"]
    lesson = by_key[row["micro_skill_key"]]
    set_candidates(row, teaching_explanation=lesson["teachingExplanation"],
               common_misconception=lesson["commonMisconception"],
               sentence_choice_items_reference=f"{lesson_path}#{lesson['microSkillKey']}")
write_csv("lesson-content-review.csv", fields, rows)

# Candidate metadata is intentionally reviewable, not importable. The original
# definitions and sentences are ours; Cambridge URLs are factual IPA references.
MORPHOLOGY = {
    "leased": ("lease", "ed", "Drop final e before -ed."),
    "packed": ("pack", "ed", "Regular past-tense suffix -ed pronounced /t/."),
    "sent": ("send", "", "Irregular past tense of send; no productive suffix."),
    "lets": ("let", "s", "Third-person singular present-tense suffix -s."),
    "she'd": ("she", "'d", "Contraction of she had or she would; expansion depends on context."),
    "we'd": ("we", "'d", "Contraction of we had or we would; expansion depends on context."),
}
HIGH = {"buy", "bye", "ill", "lets", "sent", "shed", "wed", "lose"}
EARLY = HIGH | {"hell", "least", "mist", "loose", "rein", "bawl", "mane", "groan"}
INFERRED_IPA = {"leased": "liːst", "lets": "lets"}
SET_MEMBERS = {member["word"]: member for item in set_drafts.values() for member in item["members"]}
fields, rows = csv_rows("dictionary-intake-review.csv")
for row in rows:
    word = row["word"]
    assert row["review_status"] == "draft" and not row["reviewed_by"] and not row["reviewed_at"]
    member = SET_MEMBERS[word]
    ref = REFERENCE[word]
    ipa = INFERRED_IPA.get(word, ref["ukIpaCandidate"])
    assert ipa, word
    syllables = ipa.count(".") + (1 if ipa.startswith("ˈ") or "ˈ" not in ipa else 2)
    # A stress mark inside an undotted IPA form (e.g. /əˈsent/) opens a syllable.
    if syllables == 1:
        stress = "primary"
    else:
        stressed = ["unstressed"] * syllables
        stressed[0 if ipa.startswith("ˈ") else 1] = "primary"
        stress = "-".join(stressed)
    base, suffix, note = MORPHOLOGY.get(word, (word, "", "Treat as a whole lexical base for this contrast; verify any derivation separately."))
    parts = [{"text": base, "type": "base"}]
    if suffix:
        parts.append({"text": suffix, "type": "suffix"})
    word_sum = f"{base} + {suffix} → {word}" if suffix else (f"{base} → {word}" if base != word else word)
    sentence = member["teachingSentence"]
    tokens = re.findall(r"[\w]+(?:['’][\w]+)?", sentence)
    token_index = next(i for i, token in enumerate(tokens) if token.lower() == word)
    source_note = "Cambridge Dictionary UK pronunciation reference"
    if word in INFERRED_IPA:
        source_note += "; inflected form inferred from lemma and requires direct review"
    if word == "she'd":
        ipa = "ʃiːd"  # Cambridge lists both /ʃiːd/ (strong) and /ʃid/ (weak).
    set_candidates(row, en_gb_pronunciation=f"/{ipa}/", syllables=str(syllables), stress_pattern=stress,
               has_schwa="TRUE" if "ə" in ipa else "FALSE",
               grapheme_notes=f"Contrast spelling with {', '.join(m['word'] for item in set_drafts.values() for m in item['members'] if m['word'] != word and word in [x['word'] for x in item['members']])}; verify sound mapping.",
               frequency_band="high" if word in HIGH else "medium",
               age_band="early_primary" if word in EARLY else "middle_primary",
               complexity_band="high" if syllables >= 3 or "'" in word else "medium",
               morphemes=f"{base} + {suffix}" if suffix else base,
               morphology_notes=note, morphology_parts_json=json.dumps(parts, ensure_ascii=False),
               child_facing_word_sum=word_sum, reviewed_definition=member["intendedSense"],
               contextual_target_sentence=sentence, dictation_sentence=sentence,
               dictation_target_index=str(token_index), dictation_audio_text=sentence,
               source_category="ai_assisted_editorial_draft", source_name=source_note,
               source_url_or_reference=ref["url"], source_licence="reference_only; no Cambridge wording copied",
               source_importability_status="requires_editorial_review",
               source_legal_review_status="required")
write_csv("dictionary-intake-review.csv", fields, rows)

assert len(lessons) == 58 and len(rows) == 38
assert sum(len(item["members"]) for item in set_drafts.values()) == 175
print(json.dumps({"draftDictionaryWords": 38, "draftLessons": len(lessons),
                  "draftSets": len(set_drafts), "draftMemberRelationships": 175,
                  "questions": sum(len(lesson["questions"]) for lesson in lessons),
                  "approvalFieldsWritten": 0}, indent=2))
