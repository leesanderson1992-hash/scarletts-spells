#!/usr/bin/env python3
"""Project owner-approved word analyses into lexical-family intake sheets."""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data/adle/homophone/convergence-v1"
REVIEW = DIR / "full-dictionary-unanalysed-words-review.csv"
SOURCE = Path("/tmp/scarlett-family-source.json")
BOUND = set("bio ceive chem combust commune dict electr essence geo initi ject meter phon picto politic popul pose poten respons sci separ socio stat struct tele tend thermo un veget vent vis".split())
POS_OVERRIDES = {
    "behave": "verb", "equal": "adjective", "govern": "verb", "head": "noun",
    "hero": "noun", "ingredient": "noun", "lead": "verb", "mystery": "noun",
    "necessary": "adjective", "patient": "adjective", "respons": "root",
    "responsible": "adjective", "satisfy": "verb", "season": "noun",
    "tall": "adjective", "tidy": "adjective", "yoghurt": "noun",
}

def write_csv(name, rows, fields):
    with (DIR / name).open("w", encoding="utf-8", newline="") as stream:
        out = csv.DictWriter(stream, fieldnames=fields)
        out.writeheader()
        out.writerows(rows)

review = list(csv.DictReader(REVIEW.open(encoding="utf-8", newline="")))
assert len(review) == 886 and all(r["review_status"] == "approved" for r in review)
source = json.loads(SOURCE.read_text(encoding="utf-8"))
words = {r["word_key"]: r for r in source["words"]}
by_display = {r["normalised_word"]: r for r in source["words"]}
legacy = defaultdict(list)
for row in source["legacy"]:
    legacy[row["normalised_word"]].append(row)
review_by_word = {r["word"]: r for r in review}
by_component = defaultdict(list)
for row in review:
    for link in json.loads(row["base_family_links_json"]):
        by_component[link["component"]].append((row, link))

families = []
members = []
missing = []
for component in sorted(by_component):
    links = by_component[component]
    proposals = {link["proposedFamilyKey"] for _, link in links if link["proposedFamilyKey"]}
    assert len(proposals) <= 1, (component, proposals)
    base_review = review_by_word.get(component)
    base_word = by_display.get(component)
    if proposals:
        family_key = next(iter(proposals))
        pos = family_key[len(re.sub(r"[^a-z0-9]+", "_", component.lower())) + 1:-len("_base_family")]
        pos_source = "approved_morphology_family_key"
    else:
        candidates = (base_review or links[0][0])["lexical_class_candidates"].split(" | ")
        pos = POS_OVERRIDES.get(component) or next((x for x in candidates if x), "unresolved")
        pos_source = "editorial_pos_draft" if component in POS_OVERRIDES else "base_word_lexical_candidates" if base_review else "member_lexical_candidates"
        family_key = f"{re.sub(r'[^a-z0-9]+', '_', component.lower())}_{pos}_base_family"
    assert re.fullmatch(r"[a-z0-9_]+_base_family", family_key), family_key
    kind = "free_base" if base_word or component not in BOUND else "bound_root"
    existing_meaning = next((r["base_meaning"] for r in legacy[component] if r["base_meaning"]), "")
    meaning = existing_meaning or (base_word or {}).get("definition", "")
    meaning_source = "legacy_reviewed_family" if existing_meaning else "published_canonical_definition" if meaning else "missing_base_or_root_definition"
    if not meaning:
        meaning = f"Editorial definition required for {component}."
    family = dict(family_key=family_key, revision=1, base_lemma=component,
                  base_part_of_speech=pos, base_kind=kind,
                  canonical_base_word_key=base_word["word_key"] if base_word else "",
                  base_meaning=meaning, meaning_source=meaning_source,
                  pos_source=pos_source, source_reference=str(REVIEW.relative_to(ROOT)),
                  review_status="draft", member_count=len(links),
                  prerequisite="import_canonical_base_word" if kind == "free_base" and not base_word
                  else "review_bound_root_meaning" if kind == "bound_root" and meaning_source == "missing_base_or_root_definition"
                  else "review_family_semantics_and_pos")
    families.append(family)
    if not base_word:
        missing.append(dict(component=component, proposed_family_key=family_key,
                            base_kind_candidate=kind, dictionary_action="add_canonical_base_word" if kind == "free_base" else "review_bound_root_meaning",
                            example_words=" | ".join(dict.fromkeys(r["word"] for r, _ in links)),
                            member_count=len(links), meaning_draft=meaning, status="pending"))
    for row, link in links:
        parts = json.loads(row["morphology_parts_json"])
        base_parts = [p["sourceText"].lower() for p in parts if p["kind"] == "base"]
        assert component in base_parts
        analysis = row["analysis_kind_candidate"]
        relationship = ("free_base" if analysis == "free_base" else
                        "historical_relative" if analysis == "historical_or_bound_root_review" else
                        "derived" if analysis in ("derived", "compound", "compound_or_combining_forms") else
                        analysis)
        assert relationship in {"free_base", "regular_inflection", "irregular_inflection", "derived", "contraction", "historical_relative"}
        word = words[row["word_key"]]
        members.append(dict(family_key=family_key, revision=1, word_key=row["word_key"],
                            word=row["word"], word_part_of_speech=row["lexical_class_candidates"] or "unresolved",
                            relationship_kind=relationship, word_sum=row["word_sum_candidate"],
                            morphology_parts_json=row["morphology_parts_json"],
                            morphology_joins_json=row["morphology_joins_json"],
                            morphology_transformations_json=row["morphology_transformations_json"],
                            intended_meaning=word["definition"],
                            source_reference=str(REVIEW.relative_to(ROOT)),
                            review_status="draft", owner_morphology_status=row["review_status"]))

assert len(families) == 720 and len(members) == 899 and len(missing) == 74
assert len({(r["family_key"], r["word_key"], r["word_part_of_speech"]) for r in members}) == len(members)
lemma_by_family = {f["family_key"]: f["base_lemma"] for f in families}
members_by_word = defaultdict(set)
for member in members:
    members_by_word[member["word_key"]].add(lemma_by_family[member["family_key"]])
for row in review:
    expected = {p["sourceText"].lower() for p in json.loads(row["morphology_parts_json"]) if p["kind"] == "base"}
    actual = members_by_word[row["word_key"]]
    assert actual == expected, (row["word"], actual, expected)
write_csv("approved-886-lexical-base-families.csv", families, list(families[0]))
write_csv("approved-886-lexical-base-family-members.csv", members, list(members[0]))
write_csv("approved-886-missing-base-root-dependencies.csv", missing, list(missing[0]))
print(json.dumps({"words": len(review), "families": len(families), "members": len(members),
                  "twoBaseWords": sum(len(json.loads(r["base_family_links_json"])) == 2 for r in review),
                  "missing": len(missing), "missingFreeBases": sum(r["base_kind_candidate"] == "free_base" for r in missing),
                  "missingBoundRoots": sum(r["base_kind_candidate"] == "bound_root" for r in missing)}))
