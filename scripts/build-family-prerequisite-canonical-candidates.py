#!/usr/bin/env python3
"""Build bounded, reviewed canonical facts for the lexical-family prerequisites."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/adle/homophone/convergence-v1/family-prerequisite-canonical-candidates"
SOURCE = OUT.parent / "family-prerequisite-approved-source.csv"
TEMPLATE = ROOT / "docs/implementation/seed-data/teaching-dictionary/releases/2026-10-23-reviewed-root-homophone-words-v2/package"
OUT.mkdir(parents=True, exist_ok=True)

APPROVAL = "Katie Sanderson approval in Codex chat, 2026-10-23: agreed family-tag reconciliation prerequisites"
SOURCE_NAME = "Katie Sanderson approved lexical-family prerequisites"
SOURCE_URL = "local:data/adle/homophone/convergence-v1/FAMILY_TAG_RECONCILIATION_2026-10-23.md"
SOURCE_NOTE = "Original teaching wording; Cambridge en-GB entries used to verify word class, inflection and pronunciation."

FACTS = [
    dict(word="did", key="did_en_gb", definition="The past form of do, used to ask questions or give emphasis.",
         sentence="Did you remember your coat?", target=0, family="do_verb_base_family",
         frequency="high", age="early_primary", complexity="low", syllables="1", ipa="/dɪd/",
         stress="primary", schwa="FALSE", morphemes="did: irregular past of do",
         morphology_note="Irregular past form of the free base do.", irregularity="do changes to did in the past tense.",
         parts=[{"kind":"base","sourceText":"do","surfaceText":"did"}],
         transforms=[{"kind":"irregular_past","sourceText":"do","surfaceText":"did"}],
         word_sum="do → did", pronunciation_url="https://dictionary.cambridge.org/dictionary/english/did"),
    dict(word="essence", key="essence_en_gb", definition="The basic or most important quality of something.",
         sentence="The essence of her idea was to help everyone learn.", target=1, family="essence_noun_base_family",
         frequency="low", age="upper_primary", complexity="high", syllables="2", ipa="/ˈesəns/",
         stress="primary-unstressed", schwa="TRUE", morphemes="essence: base:essence",
         morphology_note="Single free noun base; essential retains a historical variant.", irregularity="",
         parts=[{"kind":"base","sourceText":"essence","surfaceText":"essence"}], transforms=[],
         word_sum="essence", pronunciation_url="https://dictionary.cambridge.org/dictionary/english/essence"),
    dict(word="respond", key="respond_en_gb", definition="To answer or react to something that someone says or does.",
         sentence="Mia will respond to the teacher's question.", target=2, family="respond_verb_base_family",
         frequency="medium", age="upper_primary", complexity="medium", syllables="2", ipa="/rɪˈspɒnd/",
         stress="unstressed-primary", schwa="FALSE", morphemes="respond: base:respond",
         morphology_note="Single free verb base; respons is a reviewed historical variant in irresponsible.", irregularity="",
         parts=[{"kind":"base","sourceText":"respond","surfaceText":"respond"}], transforms=[],
         word_sum="respond", pronunciation_url="https://dictionary.cambridge.org/dictionary/english/respond"),
    dict(word="scissors", key="scissors_en_gb", definition="A tool with two sharp blades used for cutting.",
         sentence="Use scissors to cut the paper carefully.", target=1, family="scissors_noun_base_family",
         frequency="medium", age="early_primary", complexity="medium", syllables="2", ipa="/ˈsɪzəz/",
         stress="primary-unstressed", schwa="TRUE", morphemes="scissors: lexicalised plural noun base:scissors",
         morphology_note="Plural-only noun retained as a whole-word lexical base, distinct from the verb scissor.", irregularity="Used as a plural noun.",
         parts=[{"kind":"base","sourceText":"scissors","surfaceText":"scissors"}], transforms=[],
         word_sum="scissors", pronunciation_url="https://dictionary.cambridge.org/dictionary/english/scissors"),
    dict(word="shelf", key="shelf_en_gb", definition="A flat surface on a wall or in furniture for holding things.",
         sentence="The book is on the top shelf.", target=6, family="shelf_noun_base_family",
         frequency="high", age="early_primary", complexity="low", syllables="1", ipa="/ʃelf/",
         stress="primary", schwa="FALSE", morphemes="shelf: base:shelf",
         morphology_note="Single free noun base; plural shelves changes f to ves.", irregularity="Plural: shelves.",
         parts=[{"kind":"base","sourceText":"shelf","surfaceText":"shelf"}], transforms=[],
         word_sum="shelf", pronunciation_url="https://dictionary.cambridge.org/dictionary/english/shelf"),
    dict(word="shelves", key="shelves_en_gb", definition="More than one shelf, a flat surface used to hold things.",
         sentence="The library shelves held hundreds of books.", target=2, family="shelf_noun_base_family",
         frequency="medium", age="early_primary", complexity="medium", syllables="1", ipa="/ʃelvz/",
         stress="primary", schwa="FALSE", morphemes="shelves: irregular plural of shelf",
         morphology_note="Irregular plural of the noun shelf; not an inflection of the verb shelve.", irregularity="shelf changes f to ves in the plural.",
         parts=[{"kind":"base","sourceText":"shelf","surfaceText":"shelves"}],
         transforms=[{"kind":"irregular_plural","sourceText":"shelf","surfaceText":"shelves"}],
         word_sum="shelf → shelves", pronunciation_url="https://dictionary.cambridge.org/dictionary/english/shelf"),
]


def template(name):
    with (TEMPLATE / name).open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return reader.fieldnames, next(reader)


def write(name, fields, rows):
    with (OUT / name).open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


source_fields, source_template = template("teaching_content_sources.csv")
source = {**source_template, "source_key":"reviewed_family_prerequisites_20261023", "source_category":"internal_authored",
          "source_name":SOURCE_NAME, "source_url":SOURCE_URL, "source_licence":"internal/project-authored",
          "source_use_note":SOURCE_NOTE, "importability_status":"importable", "legal_review_status":"not_required"}
write("teaching_content_sources.csv", source_fields, [source])

for name in ("canonical_words.csv", "canonical_word_metadata.csv", "canonical_word_morphology.csv", "dictation_sentences.csv"):
    fields, template_row = template(name)
    rows = []
    for fact in FACTS:
        row = {key:"" for key in fields}
        row.update({key:template_row.get(key, "") for key in fields if key in (
            "dialect_code", "source_category", "source_name", "source_url", "source_licence",
            "source_use_note", "confidence", "review_status", "row_status", "analysis_status",
            "feature_keys", "morphology_joins")})
        row.update(word_key=fact["key"], source_category="internal_authored", source_name=SOURCE_NAME,
                   source_url=SOURCE_URL, source_licence="internal/project-authored", source_use_note=SOURCE_NOTE,
                   confidence="high", review_status="approved_for_first_exposure")
        if name == "canonical_words.csv":
            row.update(normalised_word=fact["word"], display_word=fact["word"], dialect_code="en-GB",
                       frequency_band=fact["frequency"], age_band=fact["age"], complexity_band=fact["complexity"], row_status="active")
        elif name == "canonical_word_metadata.csv":
            row.update(syllables=fact["syllables"], phoneme_hint=fact["ipa"], grapheme_notes="",
                       stress_pattern=fact["stress"], has_schwa=fact["schwa"], morphemes=fact["morphemes"],
                       morphology_notes=fact["morphology_note"], irregularity_notes=fact["irregularity"],
                       reviewed_by="Katie Sanderson", reviewed_at="2026-10-23")
        elif name == "canonical_word_morphology.csv":
            row.update(raw_morpholex_segmentation="", raw_morpholex_pos="",
                       morphology_parts=json.dumps(fact["parts"], separators=(",",":")),
                       feature_keys="[]", morphology_joins="[]",
                       transformation_notes=json.dumps(fact["transforms"], separators=(",",":")),
                       word_sum=fact["word_sum"], analysis_status="approved",
                       reviewed_by="Katie Sanderson", reviewed_at="2026-10-23", review_notes=APPROVAL)
        else:
            row.update(display_word=fact["word"], age_band=fact["age"], complexity_band=fact["complexity"],
                       dictation_sentence=fact["sentence"], dictation_target_token_index=str(fact["target"]),
                       audio_text=fact["sentence"], reviewed_by="Katie Sanderson", reviewed_at="2026-10-23", review_notes=APPROVAL)
        rows.append(row)
    write(name, fields, rows)

with SOURCE.open("w", newline="", encoding="utf-8") as f:
    fields = ["word_key", "word", "definition", "dictation_sentence", "family_key", "pronunciation_reference", "approval_reference"]
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    writer.writerows({"word_key":f["key"], "word":f["word"], "definition":f["definition"],
                      "dictation_sentence":f["sentence"], "family_key":f["family"],
                      "pronunciation_reference":f["pronunciation_url"], "approval_reference":APPROVAL} for f in FACTS)

print(f"Prepared {len(FACTS)} reviewed canonical prerequisite rows in {OUT}")
