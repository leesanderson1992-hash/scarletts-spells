#!/usr/bin/env python3
"""Propose complete morphology and lexical-family links for the 38 incoming words.

The earlier meaning and contrast approvals are retained as provenance. Newly
proposed morphology and family links remain unsigned review work.
"""

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data/adle/homophone/convergence-v1"
APPROVAL = "Content owner approval in Codex chat, 2026-10-23: Dictionary Review and Contrast Review"


def read(name):
    with (DIR / name).open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        return reader.fieldnames, list(reader)


def write(name, fields, rows):
    with (DIR / name).open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def family_key(base, pos):
    return re.sub(r"[^a-z0-9]+", "_", base.lower()).strip("_") + f"_{pos}_base_family"


def word_key(word):
    return re.sub(r"[^a-z0-9]+", "_", word.lower()).strip("_") + "_en_gb"


def part(kind, source, surface, gloss=""):
    return {"kind": kind, "sourceText": source, "surfaceText": surface, "gloss": gloss}


# Exceptions to a whole-word free-base analysis. Each has a visible suffix,
# irregular inflection, or contextual contraction. Historical etymologies are
# deliberately not guessed as productive English prefixes or suffixes.
SPECIAL = {
    "leased": ("lease", "verb", "regular_past", [part("base", "lease", "leas"), part("suffix", "ed", "ed")],
                ["plus"], [{"kind": "drop_final_e", "base": "lease", "surface": "leas"}], "lease + ed → leased",
                "Past form of lease; final e is dropped before -ed."),
    "lets": ("let", "verb", "third_person_present", [part("base", "let", "let"), part("suffix", "s", "s")],
             ["plus"], [], "let + s → lets", "Third-person present form of let."),
    "packed": ("pack", "verb", "regular_past", [part("base", "pack", "pack"), part("suffix", "ed", "ed")],
               ["plus"], [], "pack + ed → packed", "Past form of pack; -ed is pronounced /t/."),
    "sent": ("send", "verb", "irregular_past", [part("base", "send", "sent")], [],
             [{"kind": "irregular_past", "source": "send", "surface": "sent"}], "send → sent",
             "Irregular past form of send; do not analyse sent as send plus a suffix."),
    "least": ("little", "determiner", "irregular_superlative", [part("base", "little", "least")], [],
              [{"kind": "irregular_superlative", "source": "little", "surface": "least"}], "little → least",
              "Superlative determiner of little in the intended quantity sense."),
    "she'd": ("she", "pronoun", "contraction", [part("base", "she", "she"), part("auxiliary_contraction", "had|would", "'d")],
              ["contraction"], [{"kind": "contextual_expansion", "alternatives": ["had", "would"]}],
              "she + had/would → she'd", "The expansion is she had or she would according to sentence context; ’d is not a suffix."),
    "we'd": ("we", "pronoun", "contraction", [part("base", "we", "we"), part("auxiliary_contraction", "had|would", "'d")],
             ["contraction"], [{"kind": "contextual_expansion", "alternatives": ["had", "would"]}],
             "we + had/would → we'd", "The expansion is we had or we would according to sentence context; ’d is not a suffix."),
}
HISTORICAL_NOTES = {
    "bridal": "Treat as a whole lexical base for present-day teaching. Historically from bride + ale; the ending is not a productive -al suffix in this word. Review the historical relation separately.",
    "stationary": "Treat as a whole lexical base for present-day teaching. Historically related to Latin stationarius and station; do not present station + -ary as a productive modern English derivation.",
    "stationery": "Treat as a whole lexical base. Its writing-material sense developed through stationer; do not equate it with stationary despite the matching pronunciation.",
    "devise": "Treat as a whole lexical base; a visible spelling fragment is not enough to teach an English prefix or suffix.",
    "dissent": "Treat as a whole lexical base; its ending is unrelated to sent, the past form of send.",
}
BASE_MEANINGS = {
    "had": "used with a past participle to place an action before another past time",
    "lease": "allow someone to use property for payment over an agreed time",
    "let": "allow someone to do something",
    "little": "a small amount of something",
    "pack": "put things together into a bag or container",
    "send": "cause something to go to a person or place",
    "she": "a female person being referred to",
    "we": "the speaker together with one or more other people",
    "would": "used to describe an imagined action or a future action seen from the past",
}
MORPHOLOGY_SOURCES = {
    "bridal": "https://www.etymonline.com/word/bridal",
    "leased": "https://dictionary.cambridge.org/dictionary/english/leased",
    "least": "https://dictionary.cambridge.org/grammar/british-grammar/least-the-least-at-least",
    "lets": "https://dictionary.cambridge.org/dictionary/english/let",
    "packed": "https://dictionary.cambridge.org/dictionary/english/pack",
    "sent": "https://dictionary.cambridge.org/dictionary/english/send",
    "stationary": "https://www.oxfordlearnersdictionaries.com/definition/english/stationary",
    "stationery": "https://www.etymonline.com/word/stationary",
}

_, index = read("full-dictionary-canonical-base-index.csv")
approved = {row["word"].replace("’", "'"): row for row in index}
dictionary_fields, dictionary = read("dictionary-intake-review.csv")
contrast_fields, contrast = read("contrast-set-review.csv")
roles = defaultdict(set)
for row in contrast:
    roles[row["word"]].add(row["grammatical_role"])

structure = []
missing = {}
for row in dictionary:
    word = row["word"]
    role = next(iter(roles[word]))
    pos = role.split()[0]
    if pos == "contraction":
        pos = "pronoun"  # The family belongs to the pronoun base, not the whole contraction.
    assert pos in {"noun", "verb", "adjective", "determiner", "interjection", "pronoun"}, (word, pos)
    if word in SPECIAL:
        base, base_pos, analysis, parts, joins, transformations, word_sum, note = SPECIAL[word]
    else:
        base, base_pos, analysis = word, pos, "free_base"
        parts, joins, transformations = [part("base", word, word, row["reviewed_definition"])], [], []
        word_sum, note = word, "Whole free base for the intended sense; do not infer a productive affix from spelling."
        note = HISTORICAL_NOTES.get(word, note)
    assert "".join(item["surfaceText"] for item in parts) == word, word
    assert len(joins) == len(parts) - 1
    key = family_key(base, base_pos)
    existing = approved.get(base)
    is_self = base == word
    status = "incoming_word" if is_self else "approved_canonical" if existing else "missing_canonical_base"
    existing_families = existing["base_family_keys"].split(" | ") if existing and existing["base_family_keys"] else []
    action = "reuse_existing_family" if existing_families else "create_family_after_base_import" if status == "missing_canonical_base" \
        else "create_family_with_word_import" if is_self else "create_family_for_existing_base"
    structure.append({
        "word": word, "word_key": word_key(word), "part_of_speech": role,
        "analysis_kind": analysis, "base_or_root": base, "base_part_of_speech": base_pos,
        "base_family_key": key, "base_canonical_status": status,
        "base_word_key": existing["word_key"] if existing else word_key(base),
        "existing_family_keys": " | ".join(existing_families), "family_action": action,
        "word_sum": word_sum, "morphology_parts_json": json.dumps(parts, ensure_ascii=False),
        "morphology_joins_json": json.dumps(joins),
        "morphology_transformations_json": json.dumps(transformations, ensure_ascii=False),
        "morphology_notes": note, "child_friendly_meaning": row["reviewed_definition"],
        "morphology_source_reference": MORPHOLOGY_SOURCES.get(word, row["source_url_or_reference"]),
        "contextual_sentence": row["contextual_target_sentence"],
        "dictation_sentence": row["dictation_sentence"],
        "dictation_target_index": row["dictation_target_index"],
        "content_approval_reference": APPROVAL,
        "structure_review_status": "draft", "family_review_status": "draft",
    })
    if status == "missing_canonical_base":
        entry = missing.setdefault(base, {"word": base, "part_of_speech": base_pos,
            "dependency_type": "free_base", "needed_by": [], "canonical_status": "absent",
            "proposed_family_key": key, "proposed_action": "author_full_canonical_word_then_family",
            "review_status": "draft"})
        entry["needed_by"].append(word)

for auxiliary in ["had", "would"]:
    if auxiliary not in approved:
        missing[auxiliary] = {"word": auxiliary, "part_of_speech": "auxiliary_verb",
            "dependency_type": "contraction_expansion", "needed_by": ["she'd", "we'd"],
            "canonical_status": "absent", "proposed_family_key": family_key(auxiliary, "verb"),
            "proposed_action": "author_full_canonical_word_for_expansion",
            "review_status": "draft"}

assert len(structure) == 38
assert {row["word"] for row in dictionary} == {row["word"] for row in structure}
family_rows = []
member_rows = []
for item in structure:
    base = item["base_or_root"]
    family_rows.append({"base_family_key": item["base_family_key"], "base_lemma": base,
                        "base_part_of_speech": item["base_part_of_speech"], "base_kind": "free_base",
                        "base_word_key": item["base_word_key"],
                        "base_canonical_status": item["base_canonical_status"],
                        "base_meaning": BASE_MEANINGS.get(base, item["child_friendly_meaning"]),
                        "existing_family_keys": item["existing_family_keys"],
                        "proposed_action": item["family_action"],
                        "source_reference": item["content_approval_reference"],
                        "morphology_source_reference": item["morphology_source_reference"],
                        "structure_review_status": "draft", "reviewed_by": "", "approval_reference": ""})
    member_rows.append({"base_family_key": item["base_family_key"], "word_key": item["word_key"],
                        "word": item["word"], "word_part_of_speech": item["part_of_speech"],
                        "relationship_kind": ({"regular_past": "regular_inflection",
                            "third_person_present": "regular_inflection",
                            "irregular_past": "irregular_inflection",
                            "irregular_superlative": "irregular_inflection"}
                            .get(item["analysis_kind"], item["analysis_kind"])),
                        "word_sum": item["word_sum"],
                        "morphology_parts_json": item["morphology_parts_json"],
                        "morphology_joins_json": item["morphology_joins_json"],
                        "morphology_transformations_json": item["morphology_transformations_json"],
                        "intended_meaning": item["child_friendly_meaning"],
                        "contextual_sentence": item["contextual_sentence"],
                        "source_reference": item["content_approval_reference"],
                        "structure_review_status": "draft", "reviewed_by": "", "approval_reference": ""})
write("incoming-lexical-base-families-review.csv", list(family_rows[0]), family_rows)
write("incoming-lexical-base-family-members-review.csv", list(member_rows[0]), member_rows)
for entry in missing.values():
    entry["needed_by"] = " | ".join(sorted(entry["needed_by"]))
write("incoming-canonical-structure-review.csv", list(structure[0]), structure)
write("incoming-missing-base-and-expansion-words-review.csv", list(next(iter(missing.values()))),
      sorted(missing.values(), key=lambda row: row["word"]))
_, current_gaps = read("full-dictionary-missing-base-root-review.csv")
backlog = [{"component": row["component"], "component_kind": row["component_kind"],
            "canonical_word_present": row["canonical_word_present"],
            "canonical_word_key": row["canonical_word_key"],
            "canonical_word_required": "REVIEW_BOUND_ROOT" if row["component_kind"] == "root"
                else "FALSE" if row["canonical_word_present"] == "TRUE" else "TRUE",
            "source_scope": "current_dictionary", "source_word_examples": row["source_word_examples"],
            "proposed_action": row["proposed_action"], "part_of_speech_review": "",
            "base_meaning_review": "", "proposed_family_key": "",
            "en_gb_pronunciation_review": "", "syllables_review": "", "stress_pattern_review": "",
            "morphology_parts_review": "", "word_sum_review": "", "context_sentence_review": "",
            "source_reference_review": "", "reviewed_by": "", "approval_reference": "",
            "review_status": "draft"} for row in current_gaps]
backlog.extend({"component": row["word"],
                "component_kind": "base" if row["dependency_type"] == "free_base" else "auxiliary_expansion",
                "canonical_word_present": "FALSE", "canonical_word_key": word_key(row["word"]),
                "canonical_word_required": "TRUE", "source_scope": "incoming_homophone_words",
                "source_word_examples": row["needed_by"], "proposed_action": row["proposed_action"],
                "part_of_speech_review": row["part_of_speech"],
                "base_meaning_review": BASE_MEANINGS.get(row["word"], ""),
                "proposed_family_key": row["proposed_family_key"],
                "en_gb_pronunciation_review": "", "syllables_review": "", "stress_pattern_review": "",
                "morphology_parts_review": "", "word_sum_review": "", "context_sentence_review": "",
                "source_reference_review": "", "reviewed_by": "", "approval_reference": "",
                "review_status": "draft"} for row in missing.values())
backlog.sort(key=lambda row: (row["component"], row["component_kind"]))
write("base-root-population-backlog.csv", list(backlog[0]), backlog)

# Keep the original dictionary review sheet's complete canonical morphology in
# sync while preserving its approval gate until the new structure is reviewed.
extra = ["part_of_speech", "analysis_kind", "base_family_key", "base_word",
         "base_part_of_speech", "base_canonical_status", "base_word_key", "family_action",
         "morphology_joins_json", "morphology_transformations_json", "morphology_source_reference",
         "content_approval_reference", "structure_review_status", "family_review_status"]
dictionary_fields = [*dictionary_fields, *(field for field in extra if field not in dictionary_fields)]
by_word = {row["word"]: row for row in structure}
for row in dictionary:
    item = by_word[row["word"]]
    row.update(part_of_speech=item["part_of_speech"], analysis_kind=item["analysis_kind"],
               base_family_key=item["base_family_key"], base_word=item["base_or_root"],
               base_part_of_speech=item["base_part_of_speech"],
               base_canonical_status=item["base_canonical_status"],
               base_word_key=item["base_word_key"], family_action=item["family_action"],
               morphology_joins_json=item["morphology_joins_json"],
               morphology_transformations_json=item["morphology_transformations_json"],
               morphology_source_reference=item["morphology_source_reference"],
               content_approval_reference=APPROVAL, structure_review_status="draft",
               family_review_status="draft",
               morphemes=" + ".join(part["sourceText"] for part in json.loads(item["morphology_parts_json"])),
               morphology_notes=item["morphology_notes"],
               morphology_parts_json=item["morphology_parts_json"],
               child_facing_word_sum=item["word_sum"],
               source_category="ai_assisted_draft")
write("dictionary-intake-review.csv", dictionary_fields, dictionary)

# The content owner approved the contrast review. Record that exact approval;
# no dictionary or morphology approval is forged by this step.
for row in contrast:
    if row["review_status"] == "draft":
        row.update(reviewed_relation_kind=row["proposed_relation_kind"],
                   reviewed_by="Katie Sanderson", approval_reference=APPROVAL,
                   review_status="approved")
    else:
        assert row["review_status"] == "approved" and row["approval_reference"] == APPROVAL
write("contrast-set-review.csv", contrast_fields, contrast)

print(json.dumps({"incomingWords": len(structure), "approvedContrastMembers": len(contrast),
                  "newStructuralReviews": len(structure), "proposedFamilies": len(family_rows),
                  "proposedFamilyMemberships": len(member_rows),
                  "missingBaseOrExpansionWords": len(missing),
                  "wholeDictionaryBacklogCandidates": len(backlog),
                  "canonicalDatabaseWrites": 0}, indent=2))
