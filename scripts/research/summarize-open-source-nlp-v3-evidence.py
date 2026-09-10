#!/usr/bin/env python3
"""Compact and classify parser evidence for exposed S8 V3 failure cases."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def member(value: str | None) -> str | None:
    return None if value is None else value.lower().replace("’", "'").replace("ʼ", "'")


def spacy_signature(features: dict[str, Any], construction: str, subtype: str) -> bool:
    focus = features["focusTokens"]
    local = features["localTokens"]
    if construction == "existential":
        return any(token["dep"] == "expl" for token in focus)
    if construction == "locative":
        return any(token["pos"] == "ADV" and token["dep"] in {"advmod", "oprd", "attr"} for token in focus)
    if construction == "possessive":
        return any(token["dep"] == "poss" and token["pos"] in {"PRON", "DET"} and "Poss=Yes" in token["morph"] for token in focus)
    if construction == "they_are_contraction":
        aux = next((token for token in focus if token["lemma"] == "be" and token["pos"] == "AUX"), None)
        subject = any(token["lemma"] == "they" and token["dep"] in {"nsubj", "nsubjpass"} for token in focus)
        if not aux or not subject:
            return False
        head = next((token for token in local if token["start"] == aux["headStart"]), None)
        if subtype == "progressive_contraction":
            return aux["dep"] == "aux" and bool(head and head["tag"] == "VBG")
        if subtype == "passive_contraction":
            return aux["dep"] in {"auxpass", "aux:pass"} or bool(head and head["tag"] == "VBN" and aux["dep"] == "auxpass")
        if subtype == "adjectival_contraction":
            return (head is not None and head["pos"] == "ADJ") or any(child["pos"] == "ADJ" for child in aux["children"])
        return True
    if construction == "preposition":
        return any(token["pos"] == "ADP" and token["dep"] in {"prep", "dative"} for token in focus)
    if construction == "infinitive":
        return any(token["pos"] == "PART" and token["dep"] == "aux" for token in focus)
    if construction in {"additive", "degree"}:
        return any(token["pos"] == "ADV" and token["dep"] == "advmod" for token in focus)
    if construction == "numeral":
        return any(token["pos"] == "NUM" and token["dep"] == "nummod" for token in focus)
    return False


def stanza_signature(features: dict[str, Any], construction: str, subtype: str) -> bool:
    focus = features["focusTokens"]
    local = features["localTokens"]
    if construction == "existential":
        return any(token["deprel"] == "expl" for token in focus)
    if construction == "locative":
        return any(token["upos"] == "ADV" and token["deprel"] == "advmod" for token in focus)
    if construction == "possessive":
        return any(token["deprel"] == "nmod:poss" and token["upos"] in {"PRON", "DET"} and "Poss=Yes" in (token["feats"] or "") for token in focus)
    if construction == "they_are_contraction":
        aux = next((token for token in focus if token["lemma"] == "be" and token["upos"] == "AUX"), None)
        subject = any(token["lemma"] == "they" and token["deprel"] in {"nsubj", "nsubj:pass"} for token in focus)
        if not aux or not subject:
            return False
        heads = [token for token in local if token["text"] == aux["head"]]
        if subtype == "progressive_contraction":
            return aux["deprel"] == "aux" and any(token["xpos"] == "VBG" for token in heads)
        if subtype == "passive_contraction":
            return aux["deprel"] == "aux:pass" or (aux["deprel"] == "aux" and any(token["xpos"] == "VBN" for token in heads))
        if subtype == "adjectival_contraction":
            return aux["deprel"] == "cop" and any(token["upos"] == "ADJ" for token in heads)
        return True
    if construction == "preposition":
        return any(token["upos"] == "ADP" and token["deprel"] == "case" for token in focus)
    if construction == "infinitive":
        return any(token["upos"] == "PART" and token["deprel"] == "mark" for token in focus)
    if construction in {"additive", "degree"}:
        return any(token["upos"] == "ADV" and token["deprel"] == "advmod" for token in focus)
    if construction == "numeral":
        return any(token["upos"] == "NUM" and token["deprel"] == "nummod" for token in focus)
    return False


def assess(row: dict[str, Any], tool: str) -> dict[str, Any]:
    candidate = row["candidate"]
    construction = candidate["declaredConstruction"]
    subtype = candidate["declaredSubtype"]
    expected = member(candidate["focusSurface"]) if row["gold"]["classification"] == "VALID" else member(row["gold"]["intendedAlternative"])
    signature = spacy_signature if tool == "spacy" else stanza_signature
    signatures = {
        variant_member: signature(features[tool], construction, subtype)
        for variant_member, features in row["parserVariants"].items()
    }
    policy_gate = bool(candidate["protectedSetTags"]) or construction == "not_applicable" or row["gold"]["classification"] == "UNCERTAIN"
    if policy_gate:
        outcome = "insufficient_without_adle_policy_gate"
    elif expected is None or not signatures.get(expected, False):
        outcome = "missing_or_misleading_structural_signal"
    elif any(value for key, value in signatures.items() if key != expected):
        outcome = "ambiguous_structural_signal"
    else:
        outcome = "sufficient_structural_signal_candidate"
    observed = member(candidate["focusSurface"])
    return {
        "outcome": outcome,
        "expectedMember": expected,
        "variantSignatures": signatures,
        "observedSurfaceAcceptedAsConstruction": signatures.get(observed, False),
        "competingVariantFalsePositive": expected is not None and any(value for key, value in signatures.items() if key != expected),
    }


def compact_features(features: dict[str, Any]) -> dict[str, Any]:
    return {
        "focusTokens": features["focusTokens"],
        "sentence": None if features["sentence"] is None else {"start": features["sentence"]["start"], "end": features["sentence"]["end"]},
    }


def normalized_requirements(row: dict[str, Any]) -> list[str]:
    requirements = set(row["rootRequirements"])
    if row["family"] == "THERE_THEIR_THEYRE" and "gerund" in row["candidate"]["protectedSetTags"]:
        requirements.discard("preposition_governing_gerund")
        requirements |= {
            "genuine_semantic_ambiguity",
            "possessive_relation",
            "subject_copular_auxiliary_relation",
            "passive_progressive_adjectival_distinction",
        }
    return sorted(requirements)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("case_output", type=Path)
    parser.add_argument("summary_output", type=Path)
    args = parser.parse_args()
    rows = read_jsonl(args.input)
    compact: list[dict[str, Any]] = []
    for row in rows:
        candidate = row["candidate"]
        parser_variants = {
            variant_member: {
                "spacy": compact_features(features["spacy"]),
                "stanza": compact_features(features["stanza"]),
            }
            for variant_member, features in row["parserVariants"].items()
        }
        compact.append({
            "schemaVersion": 1,
            "purpose": "development_regression_only_not_approval_evidence",
            "family": row["family"],
            "caseId": candidate["caseId"],
            "passageId": candidate["passageId"],
            "sourceText": candidate["sourceText"],
            "focusSurface": candidate["focusSurface"],
            "startUtf16": candidate["startUtf16"],
            "endUtf16": candidate["endUtf16"],
            "declaredConstruction": candidate["declaredConstruction"],
            "declaredSubtype": candidate["declaredSubtype"],
            "protectedSetTags": candidate["protectedSetTags"],
            "goldClassification": row["gold"]["classification"],
            "goldIntendedAlternative": row["gold"]["intendedAlternative"],
            "goldSupportedConstruction": row["gold"]["supportedConstruction"],
            "candidateFingerprint": candidate["candidateFingerprint"],
            "goldFingerprint": row["gold"]["goldFingerprint"],
            "releaseFingerprint": row["releaseFingerprint"],
            "reportFingerprint": row["reportFingerprint"],
            "failureModes": row["evaluatorReasons"],
            "rootRequirements": normalized_requirements(row),
            "frozenV3Decision": row["frozenV3"]["decision"],
            "toolAssessment": {"spacy": assess(row, "spacy"), "stanza": assess(row, "stanza"), "languageTool": row["languageTool"]},
            "parserVariants": parser_variants,
        })

    rendered = "".join(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n" for row in compact)
    args.case_output.parent.mkdir(parents=True, exist_ok=True)
    args.case_output.write_text(rendered)

    group_counts: dict[tuple[str, str, str], Counter[str]] = defaultdict(Counter)
    requirement_counts: dict[str, Counter[str]] = defaultdict(Counter)
    failure_counts: dict[str, Counter[str]] = defaultdict(Counter)
    protected_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for row in compact:
        family = row["family"]
        key = (family, row["declaredConstruction"], row["declaredSubtype"])
        group_counts[key]["cases"] += 1
        for tool in ("spacy", "stanza"):
            group_counts[key][f"{tool}:{row['toolAssessment'][tool]['outcome']}"] += 1
            if row["toolAssessment"][tool]["competingVariantFalsePositive"]:
                group_counts[key][f"{tool}:competing_variant_false_positive"] += 1
        group_counts[key][f"languagetool:{row['toolAssessment']['languageTool']['comparatorOutcome']}"] += 1
        for requirement in row["rootRequirements"]:
            requirement_counts[family][requirement] += 1
        for failure in row["failureModes"]:
            failure_counts[family][failure] += 1
        for tag in row["protectedSetTags"]:
            protected_counts[family][tag] += 1

    summary = {
        "schemaVersion": 1,
        "purpose": "development_regression_only_not_approval_evidence",
        "totalCases": len(compact),
        "caseEvidenceSha256": hashlib.sha256(rendered.encode()).hexdigest(),
        "casesByFamily": dict(Counter(row["family"] for row in compact)),
        "failureModesByFamily": {family: dict(sorted(counts.items())) for family, counts in sorted(failure_counts.items())},
        "rootRequirementsByFamily": {family: dict(sorted(counts.items())) for family, counts in sorted(requirement_counts.items())},
        "protectedTagsByFamily": {family: dict(sorted(counts.items())) for family, counts in sorted(protected_counts.items())},
        "constructionComparison": [
            {"family": key[0], "construction": key[1], "subtype": key[2], **dict(sorted(counts.items()))}
            for key, counts in sorted(group_counts.items())
        ],
        "requestedStructures": [row["caseId"] for row in compact if "REQUESTED_STRUCTURE_DIAGNOSTIC" in row["failureModes"]],
    }
    args.summary_output.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
