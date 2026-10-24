#!/usr/bin/env python3
"""Build a review package from the bounded Production snapshot and prior drafts.

This does not change Production or mark new decisions approved.
"""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/adle/homophone/convergence-v1"
OUT = ROOT / "outputs/homophone-dictionary-family-package-2026-10-24"
PREVIOUS = ROOT / "outputs/homophone-dictionary-blocker-resolution-2026-10-24/homophone-word-proposals.csv"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(name: str, rows: list[dict], columns: list[str]) -> None:
    with (OUT / name).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def normalize_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def family_pos(pos: str) -> str:
    if pos.startswith("verb "):
        return "verb"
    if pos in {"determiner", "preposition", "conjunction", "interjection"}:
        return "function_word"
    if pos == "number":
        return "numeral"
    return pos.replace(" ", "_")


snapshot = json.loads((OUT / "production-snapshot.json").read_text())
proposals = {row["word"]: row for row in read_csv(PREVIOUS)}
root_decisions = {row["component"]: row for row in read_csv(DATA / "approved-root-family-decisions.csv")}
family_index = {row["family_key"]: row for row in snapshot["families"]}
by_lemma: dict[str, list[dict]] = {}
for family in snapshot["families"]:
    by_lemma.setdefault(family["base_lemma"].lower(), []).append(family)
anchor_by_word = {row["normalised_word"].lower(): row for row in snapshot["anchors"]}
word_by_word = {row["word"]: row for row in snapshot["words"]}
if len(word_by_word) != 173 or set(word_by_word) != set(proposals):
    raise SystemExit("173-word review roster does not match Production")

# These are proposed corrections to older whole-word analyses, not approved
# replacements. Each needs an explicit editorial decision before release.
irregular_bases = {"blew": "blow", "heard": "hear", "led": "lead", "threw": "throw", "won": "win"}
root_glosses = {"fect": "make or do", "ple": "fill"}
SERIES_DEFINITION = "A set of related things or events that come one after another."

word_rows: list[dict] = []
part_rows: list[dict] = []
member_rows: list[dict] = []
candidate_families: dict[str, dict] = {}
dependencies: list[dict] = []


def add_candidate_family(key: str, lemma: str, pos: str, kind: str,
                         meaning: str, anchor_word: str, decision: str,
                         note: str = "") -> None:
    if key in family_index:
        return
    existing = candidate_families.get(key)
    value = {
        "family_key": key, "base_lemma": lemma, "base_part_of_speech": pos,
        "base_kind": kind, "base_meaning": meaning,
        "definition_policy": "reuse_published_definition" if kind == "free_base" and (anchor_word in word_by_word or anchor_word in anchor_by_word) else "review_distinct_root_meaning",
        "canonical_anchor_word": anchor_word,
        "canonical_anchor_status": "not_applicable" if kind == "bound_root" else "active" if anchor_word in anchor_by_word or anchor_word in word_by_word else "missing_canonical_anchor",
        "decision_source": decision, "review_note": note, "review_status": "editorial_draft",
        "approval_decision": "", "reviewer_notes": "",
    }
    if existing and any(existing[k] != value[k] for k in ("base_lemma", "base_kind", "base_part_of_speech")):
        raise ValueError(f"Conflicting candidate family: {key}")
    candidate_families[key] = value


for word, current in sorted(word_by_word.items()):
    proposed = proposals[word]
    parts = json.loads(proposed["proposed_parts_json"])
    joins = json.loads(proposed["proposed_joins_json"])
    transforms = json.loads(proposed["proposed_transformations_json"])
    pos = proposed["proposed_part_of_speech"]
    flags = [x.strip() for x in proposed["review_flags"].split("|") if x.strip()]
    if not current["written_syllable_breakdown"]:
        flags.append("review proposed written syllable split")
    if current["raw_morpholex_pos"] in (None, ""):
        flags.append("record reviewed part of speech in canonical morphology")
    if word in irregular_bases:
        flags.append(f"review irregular inflection link to {irregular_bases[word]}; current approved part is whole word")
    if word == "descent":
        flags.append("do not link scent to the smell family; review historical descent analysis")
    if word == "serial":
        flags.append("series anchor absent; review seri to series relation")
    if word == "practice":
        flags.append("approved root decision rebases pract to the whole free base practice")
    if word == "except":
        flags.append("approved cept to ceive variant needs explicit registry relation")
    if any(not str(part.get("gloss") or "").strip() for part in parts):
        flags.append("part meaning missing in editorial proposal")
    flags = list(dict.fromkeys(flags))
    proposed_written = current["written_syllable_breakdown"] or proposed["proposed_written_syllables"]
    part_summary = " + ".join(str(part.get("sourceText") or part.get("surfaceText") or "") for part in parts)
    reviewed_meaning = current["definition"] or proposed["approved_context_sense"]
    for index, part in enumerate(parts, 1):
        part_rows.append({
            "word": word, "word_key": current["word_key"], "part_order": index,
            "part_id": part.get("id") or f"part_{index}", "kind": part.get("kind", ""),
            "underlying_form": part.get("sourceText", ""), "visible_form": part.get("surfaceText", ""),
            "part_meaning": part.get("gloss", ""), "review_status": "approved_source_normalized_draft" if not flags else "editorial_review_required",
            "source": "approved canonical word sum and prior editorial normalization proposal",
        })

    lexical = current["lexical_memberships"]
    memberships: list[dict] = []
    if lexical:
        for member in lexical:
            memberships.append({
                "family_key": member["familyKey"], "base_lemma": member["baseLemma"],
                "base_kind": member["baseKind"], "relationship_kind": member["relationshipKind"],
                "base_meaning": member["baseMeaning"], "status": "approved_production",
                "decision_source": "Production lexical family registry", "review_note": "",
            })
    else:
        base_parts = [part for part in parts if part.get("kind") in {"base", "root"}]
        if len(base_parts) != 1:
            raise ValueError(f"Unexpected base count for {word}: {base_parts}")
        part = base_parts[0]
        base = str(part["sourceText"]).lower()
        kind = part["kind"]
        family_key = ""
        relation = ""
        reason = ""
        if word in irregular_bases:
            base = irregular_bases[word]
            families = by_lemma.get(base, [])
            family_key = next((f["family_key"] for f in families if f["base_part_of_speech"] == "verb"), f"{base}_verb_base_family")
            relation = "irregular_inflection"
            reason = "Proposed irregular-family correction; requires approved canonical morphology revision."
            add_candidate_family(family_key, base, "verb", "free_base",
                                 anchor_by_word.get(base, {}).get("definition") or "", base,
                                 "irregular inflection review", reason)
        elif word == "descent":
            base = word
            family_key = "descent_noun_base_family"
            relation = "free_base"
            reason = "Conservative standalone base pending historical root decision; canonical morphology must be revised for this relationship."
            add_candidate_family(family_key, base, "noun", "free_base", reviewed_meaning, word, "homophone family gap review", reason)
        elif kind == "root" and base in root_decisions:
            decision = root_decisions[base]
            family_key = decision["approved_family_tag"]
            relation = "derived"
            reason = decision["decision_reason"]
            if family_key not in family_index:
                if decision["decision"] == "REBASE_TO_FREE_WORD":
                    anchor = decision["canonical_root_or_free_anchor"].lower()
                    family_base = anchor
                    family_kind = "free_base"
                    family_part_of_speech = family_key.removeprefix(anchor + "_").removesuffix("_base_family")
                    family_meaning = reviewed_meaning if anchor == word else SERIES_DEFINITION if anchor == "series" else decision["base_meaning"]
                else:
                    anchor = ""
                    family_base = family_key.split("_bound_root_base_family")[0]
                    family_kind = "bound_root"
                    family_part_of_speech = "bound_root"
                    family_meaning = root_glosses.get(base, decision["base_meaning"])
                add_candidate_family(family_key, family_base, family_part_of_speech,
                                     family_kind, family_meaning, anchor, "approved root-family decision", reason)
        elif kind == "root":
            family_key = f"{normalize_key(base)}_bound_root_base_family"
            relation = "derived"
            reason = "Unreviewed root family candidate; confirm etymology and teaching value."
            add_candidate_family(family_key, base, "bound_root", "bound_root", part.get("gloss", ""), "", "canonical morphology review", reason)
        else:
            candidates = by_lemma.get(base, [])
            match = next((f for f in candidates if f["base_part_of_speech"] == family_pos(pos)), None)
            if match is None and len(candidates) == 1:
                match = candidates[0]
            if match is not None:
                family_key = match["family_key"]
            else:
                tag_pos = family_pos(pos)
                family_key = f"{normalize_key(base)}_{tag_pos}_base_family"
                anchor_meaning = word_by_word.get(base, {}).get("definition") or anchor_by_word.get(base, {}).get("definition") or (reviewed_meaning if base == word else "")
                add_candidate_family(family_key, base, tag_pos, "free_base", anchor_meaning, base,
                                     "approved canonical morphology + dictionary definition")
            relation = "free_base" if base == word else "contraction" if "'" in word else "derived"
            reason = "Whole base uses the published dictionary definition." if base == word else "Approved canonical base component."
        if not family_key:
            raise ValueError(f"No family proposal for {word}")
        memberships.append({"family_key": family_key, "base_lemma": base,
                            "base_kind": "bound_root" if kind == "root" and word not in {"practice", "serial", "descent"} else "free_base",
                            "relationship_kind": relation, "base_meaning": family_index.get(family_key, {}).get("base_meaning") or candidate_families.get(family_key, {}).get("base_meaning", ""),
                            "status": "editorial_draft", "decision_source": "approved root decision" if kind == "root" else "approved canonical analysis + editorial family proposal",
                            "review_note": reason})
    for member in memberships:
        family_key = member["family_key"]
        family = family_index.get(family_key) or candidate_families.get(family_key, {})
        anchor = family.get("base_lemma") or member["base_lemma"]
        if family.get("base_kind") == "free_base" and anchor not in anchor_by_word and anchor not in word_by_word:
            dependencies.append({"dependency": anchor, "family_key": family_key, "reason": "missing canonical free-base anchor",
                                 "source_word": word, "required_action": "prepare and approve full Teaching Dictionary entry", "status": "editorial_draft"})
        member_rows.append({"word": word, "word_key": current["word_key"],
                            "family_key": family_key, "family_status": member["status"],
                            "base_lemma": member["base_lemma"], "base_kind": member["base_kind"],
                            "relationship_kind": member["relationship_kind"], "word_part_of_speech": pos,
                            "intended_meaning": proposed["approved_context_sense"] or reviewed_meaning,
                            "base_meaning": member["base_meaning"], "word_sum": current["word_sum"],
                            "morphology_source_id": current["morphology_id"],
                            "canonical_parts_match_family": "yes" if any(str(p.get("sourceText", "")).casefold() == str(family.get("base_lemma", "")).casefold() for p in parts if p.get("kind") in {"base", "root"}) else "requires_reviewed_variant_or_reanalysis",
                            "decision_source": member["decision_source"], "review_note": member["review_note"],
                            "approval_decision": ""})
    word_rows.append({
        "word": word, "word_key": current["word_key"], "canonical_word_id": current["word_id"],
        "part_of_speech": pos, "dictionary_definition": current["definition"],
        "approved_context_sense": proposed["approved_context_sense"],
        "dictation_sentence": current["dictation_sentence"], "dictation_target_index": current["dictation_target_token_index"],
        "spoken_syllables": current["syllables"], "written_syllable_breakdown": proposed_written,
        "written_split_status": "approved_production" if current["written_syllable_breakdown"] else "editorial_draft",
        "en_gb_pronunciation": current["phoneme_hint"], "stress_pattern": current["stress_pattern"],
        "frequency_band": current["frequency_band"], "age_band": current["age_band"],
        "complexity_band": current["complexity_band"], "has_schwa": current["has_schwa"],
        "grapheme_notes": current["grapheme_notes"], "morphemes": current["morphemes"],
        "morphology_notes": current["morphology_notes"], "irregularity_notes": current["irregularity_notes"],
        "approved_word_sum": current["word_sum"], "proposed_parts_summary": part_summary,
        "proposed_parts_json": json.dumps(parts, ensure_ascii=False),
        "proposed_joins_json": json.dumps(joins, ensure_ascii=False),
        "proposed_transformations_json": json.dumps(transforms, ensure_ascii=False),
        "raw_morpholex_segmentation": current["raw_morpholex_segmentation"],
        "current_morphology_parts_json": json.dumps(current["morphology_parts"], ensure_ascii=False),
        "family_keys": " | ".join(m["family_key"] for m in memberships),
        "word_fact_status": "approved_production", "morphology_proposal_status": "editorial_draft_for_review",
        "review_flags": " | ".join(flags), "approval_decision": "", "reviewer_notes": "",
        "source_reference": "Production canonical facts; approved homophone contrast review; prior morphology editorial proposal",
    })

for candidate in candidate_families.values():
    if candidate["base_kind"] == "free_base" and not candidate["base_meaning"]:
        candidate["review_note"] += " Base anchor definition must be read and reused before release."
    if candidate["canonical_anchor_status"] == "missing_canonical_anchor":
        dependencies.append({"dependency": candidate["canonical_anchor_word"], "family_key": candidate["family_key"],
                             "reason": "missing canonical free-base anchor", "source_word": "",
                             "required_action": "prepare and approve full Teaching Dictionary entry", "status": "editorial_draft"})

family_rows = []
for key in sorted({row["family_key"] for row in member_rows}):
    if key in family_index:
        f = family_index[key]
        anchor = next((w for w in snapshot["words"] if w["word_id"] == f.get("canonical_base_word_id")), None)
        definition = anchor["definition"] if anchor else anchor_by_word.get(f["base_lemma"].lower(), {}).get("definition") or ""
        family_rows.append({
            "family_key": key, "base_lemma": f["base_lemma"], "base_part_of_speech": f["base_part_of_speech"],
            "base_kind": f["base_kind"], "base_meaning": f["base_meaning"],
            "definition_policy": "reuse_published_definition" if definition and definition.strip().casefold() == f["base_meaning"].strip().casefold() else "retain_reviewed_distinct_sense",
            "canonical_anchor_word": f["base_lemma"] if f["base_kind"] == "free_base" else "",
            "canonical_anchor_status": "active" if f["base_kind"] == "bound_root" or f["base_lemma"] in anchor_by_word or anchor else "verify_anchor",
            "decision_source": "approved Production lexical registry", "review_note": "", "review_status": "approved_production",
            "approval_decision": "", "reviewer_notes": "",
        })
    else:
        family_rows.append(candidate_families[key])

dependency_unique = {(row["dependency"], row["family_key"], row["reason"]): row for row in dependencies if row["dependency"]}
for word in ("affect", "effect", "complement", "except", "practice", "serial", "descent", "blew", "heard", "led", "threw", "won"):
    row = next(r for r in member_rows if r["word"] == word)
    dependency_unique[(word, row["family_key"], "reviewed morphology/family relation decision")] = {
        "dependency": word, "family_key": row["family_key"],
        "reason": "reviewed morphology/family relation decision", "source_word": word,
        "required_action": row["review_note"] or "confirm canonical parts and family relation",
        "status": "editorial_review_required",
    }

blow = anchor_by_word["blow"]
anchor_rows = [
    {"word": "blow", "word_key": blow["word_key"], "canonical_word_id": blow["id"],
     "production_status": "approved_canonical_word", "part_of_speech": "verb",
     "definition": blow["definition"], "dictation_sentence": blow["dictation_sentence"],
     "dictation_target_index": blow["dictation_target_token_index"],
     "spoken_syllables": blow["syllables"], "written_syllable_breakdown": blow["written_syllable_breakdown"],
     "en_gb_pronunciation": blow["phoneme_hint"], "stress_pattern": blow["stress_pattern"],
     "frequency_band": blow["frequency_band"], "age_band": blow["age_band"],
     "complexity_band": blow["complexity_band"], "word_sum": blow["word_sum"],
     "has_schwa": blow["has_schwa"], "grapheme_notes": blow["grapheme_notes"],
     "morphemes": blow["morphemes"], "morphology_notes": blow["morphology_notes"],
     "irregularity_notes": blow["irregularity_notes"],
     "proposed_parts_json": json.dumps([{"id": "part_1", "kind": "base", "sourceText": "blow",
       "surfaceText": "blow", "gloss": blow["definition"]}], ensure_ascii=False),
     "proposed_joins_json": "[]", "family_key": "blow_verb_base_family",
     "family_relationship": "free_base", "source_reference": "Production canonical word and definition",
     "source_url": blow["source_url"] or "",
     "review_status": "family_membership_and_part_normalization_draft", "approval_decision": "", "reviewer_notes": ""},
    {"word": "series", "word_key": "series_en_gb", "canonical_word_id": "",
     "production_status": "missing_canonical_word", "part_of_speech": "noun",
     "definition": SERIES_DEFINITION,
     "dictation_sentence": "We read a series of stories about the same family.",
     "dictation_target_index": 3, "spoken_syllables": 2,
     "written_syllable_breakdown": "se·ries", "en_gb_pronunciation": "/ˈsɪə.riːz/",
     "stress_pattern": "primary-unstressed", "frequency_band": "medium",
     "age_band": "middle_primary", "complexity_band": "medium", "word_sum": "series",
     "has_schwa": "no", "grapheme_notes": "Final s is pronounced /z/; review the first-vowel correspondence against UK audio.",
     "morphemes": "series", "morphology_notes": "Whole free base for the intended sequence sense; keep historical seri relation in family provenance.",
     "irregularity_notes": "The plural is also series.",
     "proposed_parts_json": json.dumps([{"id": "part_1", "kind": "base", "sourceText": "series",
       "surfaceText": "series", "gloss": SERIES_DEFINITION}], ensure_ascii=False),
     "proposed_joins_json": "[]", "family_key": "series_noun_base_family",
     "family_relationship": "free_base", "source_reference": "Cambridge English Dictionary, series noun and UK pronunciation; approved root decision for seri",
     "source_url": "https://dictionary.cambridge.org/dictionary/essential-british-english/series",
     "review_status": "new_canonical_word_editorial_draft", "approval_decision": "", "reviewer_notes": ""},
]
bound_root_rows = []
for component, pronunciation, example in [("fect", "/fɛkt/", "affect, effect"),
                                         ("ple", "/pliː/", "complement")]:
    decision = root_decisions[component]
    bound_root_rows.append({
        "root": component, "family_key": decision["approved_family_tag"],
        "root_meaning": root_glosses[component], "root_definition": decision["root_definition"],
        "origin_language": decision["root_origin_language"],
        "pronunciation_attempt": pronunciation, "pronunciation_review": "editorial_estimate_needs_review",
        "syllables": "not_applicable", "written_syllable_breakdown": "not_applicable",
        "frequency_band": "not_applicable", "difficulty_band": "not_applicable",
        "dictation_sentence": "", "linked_words": example,
        "decision_source": decision["approval_reference"],
        "review_status": "family_approved_decision_canonical_root_intake_draft",
        "approval_decision": "", "reviewer_notes": "",
    })

write_csv("homophone-words-review.csv", word_rows, list(word_rows[0]))
write_csv("homophone-morphology-parts-review.csv", part_rows, list(part_rows[0]))
write_csv("homophone-family-memberships-review.csv", member_rows, list(member_rows[0]))
write_csv("homophone-family-definitions-review.csv", family_rows, list(family_rows[0]))
write_csv("homophone-family-dependencies-review.csv", list(dependency_unique.values()),
          ["dependency", "family_key", "reason", "source_word", "required_action", "status"])
write_csv("homophone-additional-family-anchors-review.csv", anchor_rows, list(anchor_rows[0]))
write_csv("homophone-new-bound-roots-review.csv", bound_root_rows, list(bound_root_rows[0]))

summary = {
    "as_of": snapshot["asOf"], "target_words": len(word_rows), "morphology_parts": len(part_rows),
    "memberships": len(member_rows), "approved_memberships": sum(r["family_status"] == "approved_production" for r in member_rows),
    "proposed_memberships": sum(r["family_status"] != "approved_production" for r in member_rows),
    "families_in_scope": len(family_rows), "proposed_new_families": sum(r["review_status"] == "editorial_draft" for r in family_rows),
    "written_splits_for_review": sum(r["written_split_status"] == "editorial_draft" for r in word_rows),
    "dependency_decisions": len(dependency_unique),
    "additional_anchor_words": len(anchor_rows),
    "new_bound_root_entries": len(bound_root_rows),
    "word_review_flags": Counter(flag for row in word_rows for flag in row["review_flags"].split(" | ") if flag),
}
(OUT / "package-summary.json").write_text(json.dumps(summary, indent=2, default=dict) + "\n")
(OUT / "README.md").write_text(f"""# Homophone Teaching Dictionary resolution package

Production snapshot: {snapshot['asOf']} (project `wwohrqtunajrbwxyssjf`). This is a review package; it has not changed Production.

## Scope

- {len(word_rows)} homophone words; all have existing approved definitions, dictation sentences, pronunciations, spoken syllable counts, frequency, age and complexity bands, and word sums.
- {len(part_rows)} proposed normalized morphology parts with meanings, preserving the approved word sums and prior editorial proposals.
- {len(member_rows)} word–family assignments: {sum(r['family_status'] == 'approved_production' for r in member_rows)} already approved in the lexical registry and {sum(r['family_status'] != 'approved_production' for r in member_rows)} proposed for editorial review.
- {len(family_rows)} families in scope, including {sum(r['review_status'] == 'editorial_draft' for r in family_rows)} proposed new definitions. Whole free bases reuse the published dictionary definition when the sense matches.
- {sum(r['written_split_status'] == 'editorial_draft' for r in word_rows)} proposed written syllable splits need approval.
- Two extra anchors: existing `blow` needs membership in its proposed family; absent `series` has a complete intake draft for the approved `seri` rebase decision.
- Two bound root intake drafts (`fect`, `ple`) carry the approved meanings and editorial pronunciation attempts. Syllables, frequency and difficulty are marked not applicable for bound roots.

## Files

- `homophone-words-review.csv`: all canonical facts and proposed normalized morphology for each target word.
- `homophone-morphology-parts-review.csv`: one row per part, including underlying and visible forms and part meaning.
- `homophone-family-memberships-review.csv`: approved and proposed word–family links.
- `homophone-family-definitions-review.csv`: families, base meanings, anchors and definition reuse policy.
- `homophone-additional-family-anchors-review.csv`: full metadata and proposed membership for `blow` and `series`.
- `homophone-new-bound-roots-review.csv`: approved root decisions with pronunciation attempts and root intake metadata.
- `homophone-family-dependencies-review.csv`: remaining sense, variant and anchor decisions.
- `homophone-teaching-dictionary-package.xlsx`: review workbook containing the same tables.

## Release boundary

Approval of the older 886-word morphology set does not itself approve the 87 homophone memberships that were outside its publication roster. The 38 absent written syllable splits and proposed normalized legacy parts are also drafts. Preserve current canonical IDs and immutable release history. After decisions are recorded, validate exact part spelling, base/root variants, anchor presence, definition sense and one or more family memberships for every word before a governed Production release.

The Teaching Dictionary family display currently reads older ADLE family tables. After the lexical registry is completed, connect that display to approved lexical memberships; do not duplicate lexical families as lesson-scoped Base Word Lab families merely to make them visible.

## Source provenance

Canonical word facts and approved lexical memberships: read-only Production snapshot. Family/root decisions: `data/adle/homophone/convergence-v1/approved-root-family-decisions.csv`. Morphology normalization and written syllable proposals: `outputs/homophone-dictionary-blocker-resolution-2026-10-24/homophone-word-proposals.csv`. The `series` pronunciation and noun sense were checked against Cambridge English Dictionary: https://dictionary.cambridge.org/pronunciation/english/series and https://dictionary.cambridge.org/dictionary/essential-british-english/series .
""", encoding="utf-8")
print(json.dumps({k: v for k, v in summary.items() if k != "word_review_flags"}, indent=2))
