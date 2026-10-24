#!/usr/bin/env python3
"""Reconcile approved lexical family drafts without mutating released packages."""

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/adle/homophone/convergence-v1"
RELEASE = ROOT / "docs/implementation/seed-data/teaching-dictionary/releases/2026-10-23-reviewed-root-homophone-words-v2"
CORRECTION_RELEASE = ROOT / "docs/implementation/seed-data/teaching-dictionary/releases/2026-10-23-family-prerequisite-canonical-v1"


def read(path):
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write(name, rows, columns):
    with (DATA / name).open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda r: tuple(r.get(c, "") for c in columns[:2])))


old_families = read(DATA / "approved-886-lexical-base-families.csv")
old_members = read(DATA / "approved-886-lexical-base-family-members.csv")
root_decisions = {r["component"]: r for r in read(DATA / "approved-root-family-decisions.csv")}
pos_corrections = {r["base_lemma"]: r for r in read(DATA / "family-pos-tag-corrections.csv")}
new_words = read(RELEASE / "approved-source.csv")
new_morph = {r["word_key"]: r for r in read(RELEASE / "package/canonical_word_morphology.csv")}
correction_words = read(CORRECTION_RELEASE / "approved-source.csv")
correction_morph = {r["word_key"]: r for r in read(CORRECTION_RELEASE / "package/canonical_word_morphology.csv")}
roster = {r["normalised_word"]: r["word_key"] for r in read(DATA / "canonical-word-roster-2026-10-23.csv")}
incoming_families = {r["base_family_key"]: r for r in read(DATA / "incoming-lexical-base-families-review.csv")}

assert len(old_families) == 720 and len(old_members) == 899
assert len(new_words) == 194 and len(root_decisions) == 128
assert len(roster) == 2190 and len(correction_words) == 6

old_by_key = {r["family_key"]: r for r in old_families}
old_by_lemma = defaultdict(list)
for row in old_families:
    old_by_lemma[row["base_lemma"]].append(row)


def mapped_old_family(row):
    lemma = row["base_lemma"]
    root = root_decisions.get(lemma)
    if row["base_kind"] == "bound_root" and root:
        assert root["decision"] != "HISTORY_ONLY"
        return root["approved_family_tag"], "approved_root_decision"
    correction = pos_corrections.get(lemma)
    if correction and correction["old_family_key"] == row["family_key"]:
        return correction["reconciled_family_key"], "base_part_of_speech_correction"
    if lemma == "we" and row["family_key"] == "we_function_word_base_family":
        return "we_pronoun_base_family", "pronoun_role_confirmed_by_approved_intake"
    return row["family_key"], "retained"


key_map = {r["family_key"]: mapped_old_family(r) for r in old_families}
members = []
changes = []
family_defs = {}


def add_family(key, lemma, pos, kind, meaning, origin, status):
    proposed = dict(family_key=key, base_lemma=lemma, base_part_of_speech=pos,
                    base_kind=kind, canonical_anchor_word_key=roster.get(lemma, lemma + "_en_gb") if kind == "free_base" else "",
                    base_meaning=meaning, source=origin, reconciliation_status=status)
    previous = family_defs.get(key)
    if previous:
        assert previous["base_lemma"] == lemma or kind == "bound_root" or previous["base_kind"] == "bound_root", (previous, proposed)
        if previous["base_meaning"].startswith("Editorial definition required") and not meaning.startswith("Editorial definition required"):
            previous["base_meaning"] = meaning
        return
    family_defs[key] = proposed


for family in old_families:
    key, reason = key_map[family["family_key"]]
    root = root_decisions.get(family["base_lemma"]) if family["base_kind"] == "bound_root" else None
    if root and root["decision"] == "REBASE_TO_FREE_WORD":
        lemma = key.split("_", 1)[0]
        pos = key[len(lemma) + 1:-len("_base_family")]
        kind = "free_base"
        meaning = root["base_meaning"]
    elif root and root["decision"] == "MERGE_ROOT_VARIANT":
        lemma = key.split("_bound_root_base_family")[0]
        pos = "bound_root"
        kind = "bound_root"
        meaning = root["base_meaning"]
    elif root:
        lemma = family["base_lemma"]
        pos = "bound_root"
        kind = "bound_root"
        meaning = root["base_meaning"]
    else:
        lemma = family["base_lemma"]
        pos = key[len(lemma) + 1:-len("_base_family")]
        kind = family["base_kind"]
        meaning = family["base_meaning"]
    if key == "fix_verb_base_family":
        meaning = "To repair something or make it stay in place."
    elif key == "view_noun_base_family":
        meaning = "What can be seen from a place, or an opinion about something."
    elif key == "lead_verb_base_family":
        meaning = "To guide someone or show the way."
    elif key == "tense_adjective_base_family":
        meaning = "Feeling nervous, tight, or strained."
    add_family(key, lemma, pos, kind, meaning, "886_review_and_root_decisions", "reviewed_tag_reconciliation")
    if key != family["family_key"]:
        changes.append(dict(word_key="", word="", old_family_key=family["family_key"],
                            reconciled_family_key=key, reason=reason, action="retag_family_and_members"))


for m in old_members:
    key, reason = key_map[m["family_key"]]
    if m["word"] == "shelves":
        key, reason = "shelf_noun_base_family", "plural_shelf_not_verb_shelve"
        add_family(key, "shelf", "noun", "free_base", "A flat surface fixed to a wall or inside furniture for holding things.",
                   "word_meaning_and_editorial_reconciliation", "reviewed_tag_reconciliation")
    elif m["word"] == "scissors":
        key, reason = "scissors_noun_base_family", "lexicalised_plural_noun_not_scissor_verb"
        add_family(key, "scissors", "noun", "free_base", m["intended_meaning"],
                   "word_meaning_and_editorial_reconciliation", "reviewed_tag_reconciliation")
    needs_variant_mapping = reason == "approved_root_decision" and family_defs[key]["base_lemma"] not in [
        p["sourceText"].lower() for p in json.loads(m["morphology_parts_json"]) if p["kind"] == "base"
    ]
    status = ("variant_or_rebase_mapping_required" if needs_variant_mapping else
              "case_aware_registry_validation_required" if m["word"].lower() in ("i'd", "i'm", "i've") else
              "separator_aware_registry_validation_required" if m["word"] in ("ice cream", "twenty-one", "well-being") else
              "ready_after_registry_validation")
    morphology = correction_morph.get(m["word_key"])
    word_sum = morphology["word_sum"] if morphology else m["word_sum"]
    parts_json = morphology["morphology_parts"] if morphology else m["morphology_parts_json"]
    joins_json = morphology["morphology_joins"] if morphology else m["morphology_joins_json"]
    # The v2 canonical importer stores these reviewed transformations in its
    # transformation_notes text column; its structured JSONB field is [].
    transforms_json = "[]" if morphology else m["morphology_transformations_json"]
    editorial_transforms_json = morphology["transformation_notes"] if morphology else m["morphology_transformations_json"]
    row = dict(word_key=m["word_key"], word=m["word"], family_key=key,
               original_family_key=m["family_key"], family_base=family_defs[key]["base_lemma"],
               family_kind=family_defs[key]["base_kind"],
               word_part_of_speech="noun" if m["word"] in ("shelves", "scissors") else m["word_part_of_speech"],
               relationship_kind="irregular_inflection" if m["word"] == "shelves" else "free_base" if m["word"] == "scissors" else m["relationship_kind"],
               word_sum=word_sum, morphology_parts_json=parts_json,
               morphology_joins_json=joins_json, morphology_transformations_json=transforms_json,
               editorial_transformation_notes_json=editorial_transforms_json,
               intended_meaning=m["intended_meaning"], source="886_review",
               reconciliation_reason=reason, publication_status=status,
               corrected_word_sum_candidate="")
    members.append(row)
    if key != m["family_key"]:
        changes.append(dict(word_key=m["word_key"], word=m["word"], old_family_key=m["family_key"],
                            reconciled_family_key=key, reason=reason, action="retag_membership"))


for word in new_words:
    morphology = correction_morph.get(word["word_key"], new_morph[word["word_key"]])
    parts = json.loads(morphology["morphology_parts"])
    base_parts = [p for p in parts if p["kind"] == "base"]
    assert len(base_parts) == 1, word["word"]
    base = base_parts[0]["sourceText"].lower()
    old_key = word["family_key"]
    key = old_key
    reason = "retained_approved_intake"
    if word["word"] == "did":
        key, base, reason = "do_verb_base_family", "do", "did_irregular_form_of_do"
    elif word["word"] in ("fix", "fun", "least"):
        # Keep the owner-approved sense/POS for these words. A related form may
        # have a different role without changing the word's approved definition.
        reason = "retain_approved_word_sense_and_part_of_speech"
    elif base in old_by_lemma:
        possible = [key_map[r["family_key"]][0] for r in old_by_lemma[base] if r["base_kind"] == "free_base"]
        if len(set(possible)) == 1:
            key = possible[0]
            reason = "reuse_reconciled_existing_base_family" if key != old_key else reason
        elif old_key in possible:
            key = old_key
        elif base == "little":
            key = "little_determiner_base_family"
    if base == "scissor":
        key = "scissor_verb_base_family"
    if key not in family_defs:
        incoming = incoming_families.get(key) or incoming_families.get(old_key)
        if incoming:
            pos = incoming["base_part_of_speech"]
            meaning = incoming["base_meaning"]
        else:
            pos = key[len(base) + 1:-len("_base_family")]
            meaning = word["definition"] if word["word"] == base else "Editorial definition required for base."
        add_family(key, base, pos, "free_base", meaning, "approved_194_word_intake", "reviewed_tag_reconciliation")
    if word["word"] == base and (family_defs[key]["base_meaning"].startswith("Editorial definition required") or reason == "retain_approved_word_sense_and_part_of_speech"):
        family_defs[key]["base_meaning"] = word["definition"]
    status = "ready_after_registry_validation"
    relationship = ("irregular_inflection" if word["word"] in ("did", "had", "least", "sent") else
                    "regular_inflection" if word["word"] in ("leased", "lets", "packed") else
                    "contraction" if word["word"] in ("she'd", "we'd") else
                    "free_base" if word["word"] == base else "derived")
    word_pos = ("auxiliary_verb" if word["word"] in ("did", "had") else
                "contraction" if word["word"] in ("she'd", "we'd") else
                "determiner" if word["word"] == "least" else
                family_defs[key]["base_part_of_speech"])
    members.append(dict(word_key=word["word_key"], word=word["word"], family_key=key,
                        original_family_key=old_key, family_base=family_defs[key]["base_lemma"],
                        family_kind=family_defs[key]["base_kind"], word_part_of_speech=word_pos,
                        relationship_kind=relationship,
                        word_sum=morphology["word_sum"], morphology_parts_json=morphology["morphology_parts"],
                        morphology_joins_json=morphology["morphology_joins"],
                        morphology_transformations_json="[]",
                        editorial_transformation_notes_json=morphology["transformation_notes"],
                        intended_meaning=word["definition"], source="approved_194_word_intake",
                        reconciliation_reason=reason, publication_status=status,
                        corrected_word_sum_candidate=""))
    if key != old_key:
        changes.append(dict(word_key=word["word_key"], word=word["word"], old_family_key=old_key,
                            reconciled_family_key=key, reason=reason, action="retag_membership"))

for word in correction_words:
    if word["word"] not in ("essence", "respond", "shelf"):
        continue
    key = word["family_key"]
    fact = correction_morph[word["word_key"]]
    assert key in family_defs
    family_defs[key]["base_meaning"] = word["definition"]
    members.append(dict(word_key=word["word_key"], word=word["word"], family_key=key,
                        original_family_key="", family_base=word["word"], family_kind="free_base",
                        word_part_of_speech=family_defs[key]["base_part_of_speech"], relationship_kind="free_base",
                        word_sum=fact["word_sum"], morphology_parts_json=fact["morphology_parts"],
                        morphology_joins_json=fact["morphology_joins"],
                        morphology_transformations_json="[]",
                        editorial_transformation_notes_json=fact["transformation_notes"],
                        intended_meaning=word["definition"], source="approved_canonical_prerequisite_release",
                        reconciliation_reason="new_canonical_anchor", publication_status="ready_after_registry_validation",
                        corrected_word_sum_candidate=""))


by_word = defaultdict(set)
for m in members:
    by_word[m["word_key"]].add(m["family_key"])
assert len(members) == len({(m["word_key"], m["family_key"]) for m in members})
assert len(by_word) == 1083
assert len([m for m in members if m["source"] == "approved_194_word_intake"]) == 194
assert all(len(v) >= 1 for v in by_word.values())
assert sum(len(v) == 2 for v in by_word.values()) == 13
assert all(m["family_key"] in family_defs for m in members)

usage = Counter(m["family_key"] for m in members)
for key, row in family_defs.items():
    row["member_count"] = usage[key]
    row["anchor_present_in_canonical_roster"] = "not_applicable" if row["base_kind"] == "bound_root" else ("yes" if row["base_lemma"] in roster else "no")
    if row["base_kind"] == "free_base" and row["base_lemma"] not in roster:
        row["reconciliation_status"] = "requires_canonical_anchor"
    if not usage[key]:
        row["reconciliation_status"] = "retire_unused_draft"

coverage = []
for key in sorted(by_word):
    rows = [m for m in members if m["word_key"] == key]
    needs_review = any(r["publication_status"] != "ready_after_registry_validation" or
                       family_defs[r["family_key"]]["reconciliation_status"] in
                       ("requires_canonical_anchor", "requires_canonical_sense_enrichment", "requires_morphology_correction")
                       for r in rows)
    coverage.append(dict(word_key=key, word=rows[0]["word"], membership_count=len(rows),
                         reconciled_family_tags=" | ".join(sorted(by_word[key])),
                         source=rows[0]["source"], status="review_required" if needs_review else "covered"))

dependencies = []
for row in family_defs.values():
    if row["base_kind"] == "free_base" and row["anchor_present_in_canonical_roster"] == "no" and row["member_count"]:
        dependencies.append(dict(component=row["base_lemma"], family_key=row["family_key"],
                                 dependency="missing_canonical_anchor", decision="add_canonical_word_before_family_approval", member_count=row["member_count"]))
for m in members:
    if m["publication_status"] in ("variant_or_rebase_mapping_required", "case_aware_registry_validation_required", "separator_aware_registry_validation_required"):
        dependencies.append(dict(component=m["word"], family_key=m["family_key"],
                                 dependency=m["publication_status"], decision="extend_family_membership_validator_without_changing_approved_word_sum", member_count=1))

write("reconciled-lexical-family-members.csv", members,
      ["word_key", "word", "family_key", "original_family_key", "family_base", "family_kind", "word_part_of_speech", "relationship_kind", "word_sum", "corrected_word_sum_candidate", "morphology_parts_json", "morphology_joins_json", "morphology_transformations_json", "editorial_transformation_notes_json", "intended_meaning", "source", "reconciliation_reason", "publication_status"])
write("reconciled-lexical-families.csv", [r for r in family_defs.values() if r["member_count"]],
      ["family_key", "base_lemma", "base_part_of_speech", "base_kind", "canonical_anchor_word_key", "base_meaning", "member_count", "anchor_present_in_canonical_roster", "source", "reconciliation_status"])
write("reconciled-word-family-coverage.csv", coverage,
      ["word_key", "word", "membership_count", "reconciled_family_tags", "source", "status"])
write("family-tag-change-audit.csv", changes,
      ["word_key", "word", "old_family_key", "reconciled_family_key", "reason", "action"])
write("family-reconciliation-dependencies.csv", dependencies,
      ["component", "family_key", "dependency", "decision", "member_count"])
print(json.dumps(dict(families=sum(bool(r["member_count"]) for r in family_defs.values()), members=len(members), words=len(by_word),
                      family_changes=len(changes), dependencies=len(dependencies),
                      missing_anchors=sum(d["dependency"] == "missing_canonical_anchor" for d in dependencies)), indent=2))
