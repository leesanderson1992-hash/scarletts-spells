#!/usr/bin/env python3
"""Reuse Teaching Dictionary lexical sources for the 25 missing degree forms.

Emits review candidates only. No approval, canonical ID, package or DB write.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from typing import Any

from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parents[1]
SOURCE_INTAKE = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake"


def load_helper(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot_load_helper:{name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


batch = load_helper("next_dictionary_batch", ROOT / "scripts/build-next-teaching-dictionary-batch.py")
ipa_tool = load_helper("british_ipa_intake", SOURCE_INTAKE / "build_british_ipa_intake.py")

CONTEXTS = {
    "long": ("The long ribbon reached the floor.", "This ribbon is longer than the blue one.", "Of the three ribbons, the red one is the longest."),
    "old": ("The old toy was in the box.", "This toy is older than the wooden train.", "Of the three toys, the drum is the oldest."),
    "cold": ("The cold drink was in the fridge.", "This drink is colder than the water.", "Of the three drinks, the juice is the coldest."),
    "wide": ("The wide path crosses the park.", "This path is wider than the path by the lake.", "Of the three paths, this one is the widest."),
    "safe": ("The safe path goes through the park.", "This path is safer than the rocky one.", "Of the three paths, this one is the safest."),
    "close": ("The chair is close to the desk.", "This chair is closer to the desk than that one.", "Of the three chairs, this one is the closest to the desk."),
    "happy": ("The happy child smiled at her friend.", "Mia is happier than Amy today.", "Of her three friends, Phoebe is the happiest today."),
    "easy": ("The easy puzzle took one minute.", "This puzzle is easier than the blue one.", "Of the three puzzles, this one is the easiest."),
    "heavy": ("The heavy bag was hard to lift.", "This bag is heavier than the red one.", "Of the three bags, this one is the heaviest."),
    "pretty": ("The pretty flower grew by the wall.", "This flower is prettier than the yellow one.", "Of the three flowers, this one is the prettiest."),
    "thin": ("The thin ribbon fitted through the hole.", "This ribbon is thinner than the red one.", "Of the three ribbons, this one is the thinnest."),
    "wet": ("The wet towel hung by the sink.", "This towel is wetter than the blue one.", "Of the three towels, this one is the wettest."),
    "red": ("The red leaf fell from the tree.", "This leaf is redder than the one beside it.", "Of the three leaves, this one is the reddest."),
}
RULES = {
    "REGULAR": "regular",
    "DROP_E": "drop_e",
    "Y_TO_I": "y_to_i",
    "DOUBLE_FINAL_CONSONANT": "double_final_consonant",
}


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalised_token(text: str) -> str:
    return re.sub(r"^[^\w']+|[^\w']+$", "", text).lower()


def sentence_target(sentence: str, word: str) -> int:
    hits = [i for i, token in enumerate(sentence.split()) if normalised_token(token) == word]
    if len(hits) != 1:
        raise ValueError(f"dictation_target_not_unique:{word}:{sentence}")
    return hits[0]


def morphology(base: str, word: str, degree: str, rule: str) -> dict[str, Any]:
    if degree == "base":
        return {"parts": [{"text": base, "type": "base"}], "joins": [], "features": [f"base:{base}"], "wordSum": base, "transformation": "Base adjective."}
    ending = "er" if degree == "comparative" else "est"
    notes = {
        "regular": f"Keep {base} unchanged, then add -{ending}.",
        "drop_e": f"Drop the final e in {base}, then add -{ending}.",
        "y_to_i": f"Change final y to i in {base}, then add -{ending}.",
        "double_final_consonant": f"Double the final consonant in {base}, then add -{ending}.",
    }[rule]
    return {"parts": [{"text": base, "type": "base"}, {"text": ending, "type": "suffix"}], "joins": ["plus"], "features": [f"base:{base}", f"suffix:{ending}"], "wordSum": f"{base} + {ending} → {word}", "transformation": notes}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--families", type=Path, required=True)
    parser.add_argument("--production-inventory", type=Path, required=True)
    parser.add_argument("--staging-inventory", type=Path, required=True)
    parser.add_argument("--ipa", type=Path, required=True)
    parser.add_argument("--cmudict", type=Path, required=True)
    parser.add_argument("--morpholex", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    families = json.loads(args.families.read_text(encoding="utf-8"))["families"]
    if len(families) != 24:
        raise ValueError("expected_24_families")
    production = {row["word"]: row for row in rows(args.production_inventory)}
    staging = {row["word"]: row for row in rows(args.staging_inventory)}
    if len(production) != 72 or len(staging) != 72:
        raise ValueError("inventory_requires_72_forms")
    ipa = ipa_tool.parse_ipa_dict(args.ipa)
    cmu = batch.cmu_index(args.cmudict)
    morph = batch.morpholex_index(args.morpholex)
    aoa = batch.aoa_index()
    uk_ages = {row["Word"].lower(): int(row["Age"]) for row in batch.read_csv(batch.UK_AGES)}
    proposals = []
    all_forms = []
    for family in families:
        base = family["words"][0]
        skill = family["microSkillKey"]
        rule_name = next((value for suffix, value in RULES.items() if skill.endswith(suffix)), None)
        if not rule_name or base not in CONTEXTS:
            # Families with no missing members need no new canonical-word record.
            if any(production[word]["canonical_word_id"] in {"", "null"} for word in family["words"]):
                raise ValueError(f"missing_family_context_or_rule:{base}")
            continue
        for i, word in enumerate(family["words"]):
            p, s = production[word], staging[word]
            if p["canonical_word_id"] != s["canonical_word_id"]:
                raise ValueError(f"identity_drift:{word}")
            all_forms.append(word)
            if p["canonical_word_id"] not in {"", "null"}:
                continue
            degree = ("base", "comparative", "superlative")[i]
            ipa_variants = ipa.get(word, [])
            if word == "close" and not ipa_variants:
                ipa_variants = ["/kləʊs/"]
                ipa_source = "Cambridge Dictionary, close adjective pronunciation: https://dictionary.cambridge.org/us/pronunciation/english/close"
                ipa_status = "external_sense_specific_candidate"
            else:
                ipa_source = "open-dict-data ipa-dict en_UK"
                ipa_status = "exact_source_match" if len(ipa_variants) == 1 else "multiple_or_missing_variants"
            selected_ipa = ipa_variants[0] if ipa_variants else ""
            cmu_phones = cmu.get(word, "")
            cmu_syllables = len(re.findall(r"[012]", cmu_phones)) if cmu_phones else None
            ipa_syllables = ipa_tool.ipa_syllables(selected_ipa) if selected_ipa else None
            evidence_age = uk_ages.get(word) or aoa.get(word)
            if evidence_age:
                proposed_age = round(evidence_age)
                age_basis = "direct UK curriculum" if word in uk_ages else "direct AoA"
            else:
                proposed_age = round(uk_ages.get(base) or aoa.get(base) or 8)
                age_basis = "base-form proxy" if (base in uk_ages or base in aoa) else "heuristic fallback; review required"
            zipf = round(float(zipf_frequency(word, "en")), 3)
            mor = morph.get(word, {})
            complexity_score = len(word) + (ipa_syllables or cmu_syllables or 1) * 2 + int(mor.get("nmorph", 2 if degree != "base" else 1))
            parts = morphology(base, word, degree, rule_name)
            sentence = CONTEXTS[base][i]
            proposals.append({
                "microSkillKey": skill, "base": base, "degree": degree, "word": word, "wordKey": f"{word}_en_gb", "rule": rule_name,
                "frequencyBandCandidate": batch.frequency_band(zipf), "wordfreqZipf": zipf,
                "ageBandCandidate": batch.age_band(proposed_age), "ageEvidence": age_basis, "ageEvidenceValue": evidence_age or "",
                "complexityBandCandidate": "low" if complexity_score <= 9 else "medium" if complexity_score <= 15 else "high", "complexityScore": complexity_score,
                "britishIpaCandidate": selected_ipa, "ipaVariantCount": len(ipa_variants), "ipaMatchStatus": ipa_status, "ipaSource": ipa_source,
                "syllablesCandidate": ipa_syllables or cmu_syllables or "", "stressPatternCandidate": "primary" if word == "close" else (ipa_tool.ipa_stress_pattern(selected_ipa) if selected_ipa else ""),
                "hasSchwaCandidate": "FALSE" if word == "close" else (ipa_tool.bool_string(ipa_tool.ipa_has_schwa(selected_ipa)) if selected_ipa else ""),
                "cmudictPhones": cmu_phones, "cmudictSyllables": cmu_syllables or "", "syllableAgreement": "agree" if ipa_syllables and cmu_syllables and ipa_syllables == cmu_syllables else "review",
                "rawMorpholexSegmentation": mor.get("segmentation", ""), "rawMorpholexPos": mor.get("pos", ""),
                "adjectiveEvidenceStatus": "MorphoLex JJ" if "JJ" in mor.get("pos", "").split("|") else "no MorphoLex adjective tag; review sense",
                "morphologyPartsCandidate": parts["parts"], "morphologyJoinsCandidate": parts["joins"], "featureKeysCandidate": parts["features"], "childWordSumCandidate": parts["wordSum"], "transformationNotesCandidate": parts["transformation"],
                "dictationSentenceCandidate": sentence, "dictationTargetTokenIndexCandidate": sentence_target(sentence, word), "audioTextCandidate": sentence,
                "reviewStatus": "in_review", "reviewedBy": "", "reviewedAt": "",
            })
    if len(proposals) != 25 or len({row["word"] for row in proposals}) != 25:
        raise ValueError(f"expected_25_new_words_found_{len(proposals)}")
    if len(all_forms) != 3 * len(CONTEXTS):
        raise ValueError("context_family_form_count_mismatch")
    source_paths = {"ipa-dict en_UK": args.ipa, "CMUdict": args.cmudict, "MorphoLex-en": args.morpholex, "UK spelling age estimates": batch.UK_AGES, "AoA test-based source": batch.AOA}
    payload = {"schemaVersion": "comparative_dictionary_candidates_v1", "status": "in_review", "approvedScope": "72 comparative/superlative spellings only", "productionMutationAuthorisedByThisFile": False,
               "counts": {"approvedFamilies": 24, "approvedForms": 72, "existingCanonicalForms": 47, "newCanonicalCandidates": len(proposals)},
               "sources": [{"name": name, "path": str(path), "sha256": sha256(path)} for name, path in source_paths.items()], "rows": proposals}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    def matrix(records: list[dict[str, Any]]) -> list[list[Any]]:
        return [list(records[0])] + [[row.get(key, "") for key in records[0]] for row in records]

    canonical_review = [{
        "word_key": row["wordKey"], "word": row["word"], "base": row["base"], "degree": row["degree"], "micro_skill_key": row["microSkillKey"],
        "form_spelling_review": "approved", "frequency_band": row["frequencyBandCandidate"], "wordfreq_zipf": row["wordfreqZipf"],
        "age_band": row["ageBandCandidate"], "age_evidence": row["ageEvidence"], "age_evidence_value": row["ageEvidenceValue"],
        "complexity_band": row["complexityBandCandidate"], "british_ipa": row["britishIpaCandidate"], "ipa_match_status": row["ipaMatchStatus"],
        "ipa_source": row["ipaSource"], "syllables": row["syllablesCandidate"], "stress_pattern": row["stressPatternCandidate"],
        "has_schwa": row["hasSchwaCandidate"], "cmudict_syllables": row["cmudictSyllables"], "syllable_agreement": row["syllableAgreement"],
        "adjective_evidence": row["adjectiveEvidenceStatus"],
        "identity_review": "in_review", "selection_evidence_review": "in_review", "pronunciation_review": "in_review",
        "british_english_review": "in_review", "accessibility_review": "in_review", "source_licence_review": "in_review", "final_decision": "in_review",
        "reviewed_by": "", "reviewed_at": "", "review_notes": "",
    } for row in proposals]
    morphology_review = [{
        "word_key": row["wordKey"], "word": row["word"], "raw_morpholex_segmentation": row["rawMorpholexSegmentation"],
        "raw_morpholex_pos": row["rawMorpholexPos"], "adjective_evidence": row["adjectiveEvidenceStatus"],
        "morphology_parts": json.dumps(row["morphologyPartsCandidate"]), "feature_keys": json.dumps(row["featureKeysCandidate"]),
        "morphology_joins": json.dumps(row["morphologyJoinsCandidate"]), "transformation_notes": row["transformationNotesCandidate"],
        "word_sum": row["childWordSumCandidate"], "analysis_status": "in_review", "linguistic_analysis_review": "in_review",
        "word_sum_review": "in_review", "final_decision": "in_review", "reviewed_by": "", "reviewed_at": "", "review_notes": "",
    } for row in proposals]
    dictation_review = [{
        "word_key": row["wordKey"], "display_word": row["word"], "age_band": row["ageBandCandidate"],
        "complexity_band": row["complexityBandCandidate"], "dictation_sentence": row["dictationSentenceCandidate"],
        "dictation_target_token_index": row["dictationTargetTokenIndexCandidate"], "audio_text": row["audioTextCandidate"],
        "child_language_review": "in_review", "british_english_review": "in_review", "accessibility_review": "in_review",
        "final_decision": "in_review", "reviewed_by": "", "reviewed_at": "", "review_notes": "",
    } for row in proposals]
    source_review = [
        {"source_name": "open-dict-data ipa-dict en_UK", "source_url": "https://github.com/open-dict-data/ipa-dict/blob/43c3570eb3553bdd19fccd2bd0091534889af023/data/en_UK.txt", "source_licence": "UK data attributed to ipacards, GPL-3.0", "use": "24 direct British IPA candidates", "source_review": "in_review", "reviewed_by": "", "reviewed_at": ""},
        {"source_name": "Cambridge Dictionary close adjective", "source_url": "https://dictionary.cambridge.org/us/pronunciation/english/close", "source_licence": "Reference fact only; importability review required", "use": "Sense-specific British IPA candidate for close", "source_review": "in_review", "reviewed_by": "", "reviewed_at": ""},
        {"source_name": "CMUdict", "source_url": "https://github.com/cmusphinx/cmudict/blob/74790861f652b15e4ac49015a90074ad62a27690/cmudict.dict", "source_licence": "BSD-style", "use": "Pronunciation comparison", "source_review": "in_review", "reviewed_by": "", "reviewed_at": ""},
        {"source_name": "MorphoLex-en", "source_url": "https://github.com/hugomailhot/MorphoLex-en/blob/80bcff1bd70e311f2ec70fd64510e88eb059b0f2/MorphoLEX_en.xlsx", "source_licence": "CC BY-NC-SA 4.0", "use": "Raw morphology/POS evidence only", "source_review": "in_review", "reviewed_by": "", "reviewed_at": ""},
        {"source_name": "wordfreq 3.1.1", "source_url": "https://github.com/rspeer/wordfreq", "source_licence": "Apache-2.0 package; underlying data review required", "use": "Frequency-band proposal", "source_review": "in_review", "reviewed_by": "", "reviewed_at": ""},
        {"source_name": "UK spelling age estimates and AoA", "source_url": "Project-held source evidence", "source_licence": "Project source review required", "use": "Direct ages and base-form proxy proposals", "source_review": "in_review", "reviewed_by": "", "reviewed_at": ""},
    ]
    workbook_data = {
        "Overview & instructions": [["Topic", "Detail"], ["Scope", "25 new canonical word candidates; all 72 spellings owner-approved"], ["Existing words", "Reuse 47 existing canonical IDs; do not overwrite their factual rows"], ["Candidate status", "Factual fields and source use require named review"], ["Pronunciation", "Close needs adjective-sense review; six IPA/CMU syllable comparisons need checking"], ["Release", "Verified staging package precedes the identical production package"]],
        "Canonical word review": matrix(canonical_review),
        "Linguistic morphology & word sums": matrix(morphology_review),
        "Dictation review": matrix(dictation_review),
        "Sources & licence": matrix(source_review),
    }
    (args.output.parent / "dictionary-enrichment-review-data.json").write_text(json.dumps(workbook_data, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": payload["status"], "counts": payload["counts"], "ipaExact": sum(row["ipaMatchStatus"] == "exact_source_match" for row in proposals), "cmuSyllableAgreement": sum(row["syllableAgreement"] == "agree" for row in proposals), "morpholexExact": sum(bool(row["rawMorpholexSegmentation"]) for row in proposals), "ageDirect": sum(row["ageEvidence"].startswith("direct") for row in proposals)}))


if __name__ == "__main__":
    main()
