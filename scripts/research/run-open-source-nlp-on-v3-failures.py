#!/usr/bin/env python3
"""Run isolated open-source parsers over already-exposed S8 V3 failure cases.

This is development/regression research only. It never writes holdout candidates,
gold, governed reports, manifests, releases, or operational state.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import resource
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import psutil
import spacy
import stanza


MEMBERS = {
    "THERE_THEIR_THEYRE": ["there", "their", "they're"],
    "TO_TOO_TWO": ["to", "too", "two"],
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def utf16_to_python_index(text: str, offset: int) -> int:
    encoded = text.encode("utf-16-le")
    return len(encoded[: offset * 2].decode("utf-16-le"))


def variant(row: dict[str, Any], member: str) -> tuple[str, int, int]:
    candidate = row["candidate"]
    text = candidate["sourceText"]
    start = utf16_to_python_index(text, candidate["startUtf16"])
    end = utf16_to_python_index(text, candidate["endUtf16"])
    changed = text[:start] + member + text[end:]
    return changed, start, start + len(member)


def root_requirements(row: dict[str, Any]) -> list[str]:
    candidate = row["candidate"]
    family = row["family"]
    construction = candidate["declaredConstruction"]
    subtype = candidate["declaredSubtype"]
    tags = set(candidate["protectedSetTags"])
    requirements: set[str] = {"POS", "syntactic_head", "dependency_relation"}

    if family == "THERE_THEIR_THEYRE":
        if construction == "possessive":
            requirements |= {"morphology", "possessive_relation"}
        elif construction == "existential":
            requirements |= {"subject_copular_auxiliary_relation", "locative_existential_distinction"}
        elif construction == "locative":
            requirements |= {"locative_existential_distinction", "lexical_governance_information"}
        elif construction == "they_are_contraction":
            requirements |= {"morphology", "subject_copular_auxiliary_relation"}
            if subtype in {"progressive_contraction", "passive_contraction", "adjectival_contraction"}:
                requirements.add("passive_progressive_adjectival_distinction")
        else:
            requirements |= {"genuine_semantic_ambiguity", "family_specific_policy"}
    else:
        if construction == "preposition":
            requirements |= {"infinitive_prepositional_to_distinction", "lexical_governance_information"}
        elif construction == "infinitive":
            requirements |= {"morphology", "infinitive_prepositional_to_distinction", "lexical_governance_information"}
        elif construction in {"additive", "degree", "numeral"}:
            requirements.add("additive_degree_numeral_distinction")
            if construction == "numeral":
                requirements.add("morphology")
        else:
            requirements |= {"genuine_semantic_ambiguity", "family_specific_policy"}

    if "fragment" in tags:
        requirements |= {"sentence_clause_boundary", "family_specific_policy"}
    if "quotation" in tags:
        requirements |= {"quotation_protected_boundary_recognition", "family_specific_policy"}
    if "run_on" in tags:
        requirements |= {"sentence_clause_boundary", "family_specific_policy"}
    if "task_dependent" in tags:
        requirements |= {"genuine_semantic_ambiguity", "family_specific_policy"}
    if "gerund" in tags:
        requirements |= {"morphology", "preposition_governing_gerund", "lexical_governance_information", "family_specific_policy"}
    if "PROTECTED_ABSTENTION_CHANGED" in row["evaluatorReasons"]:
        requirements.add("family_specific_policy")
    if "EVALUATOR_POLICY_CONFLICT_PROTECTED_VALID" in row["evaluatorReasons"]:
        requirements.add("evaluator_policy_contract_issue")
    return sorted(requirements)


def sentence_for_span(sentences: Iterable[Any], start: int, end: int) -> Any | None:
    for sentence in sentences:
        token_starts = [token.start_char for token in sentence.tokens if token.start_char is not None]
        token_ends = [token.end_char for token in sentence.tokens if token.end_char is not None]
        sent_start = min(token_starts) if token_starts else None
        sent_end = max(token_ends) if token_ends else None
        if sent_start is not None and sent_end is not None and sent_start <= start and end <= sent_end:
            return sentence
    return None


def spacy_features(doc: Any, text: str, start: int, end: int) -> dict[str, Any]:
    overlaps = [token for token in doc if token.idx < end and token.idx + len(token.text) > start]
    sentence = next((sent for sent in doc.sents if sent.start_char <= start and end <= sent.end_char), None)

    def token_record(token: Any) -> dict[str, Any]:
        return {
            "text": token.text,
            "start": token.idx,
            "end": token.idx + len(token.text),
            "lemma": token.lemma_,
            "pos": token.pos_,
            "tag": token.tag_,
            "morph": str(token.morph),
            "dep": token.dep_,
            "head": token.head.text,
            "headStart": token.head.idx,
            "children": [{"text": child.text, "dep": child.dep_, "pos": child.pos_} for child in token.children],
        }

    return {
        "focusTokens": [token_record(token) for token in overlaps],
        "sentence": None if sentence is None else {"start": sentence.start_char, "end": sentence.end_char, "text": sentence.text},
        "localTokens": [token_record(token) for token in doc if max(0, start - 35) <= token.idx < min(len(text), end + 35)],
    }


def stanza_features(doc: Any, text: str, start: int, end: int) -> dict[str, Any]:
    sentence = sentence_for_span(doc.sentences, start, end)
    overlaps: list[Any] = []
    for sent in doc.sentences:
        for token in sent.tokens:
            if token.start_char < end and token.end_char > start:
                overlaps.extend(token.words)

    def word_record(word: Any, sent: Any) -> dict[str, Any]:
        token = next((token for token in sent.tokens if word in token.words), None)
        head = next((candidate for candidate in sent.words if candidate.id == word.head), None)
        return {
            "text": word.text,
            "start": None if token is None else token.start_char,
            "end": None if token is None else token.end_char,
            "lemma": word.lemma,
            "upos": word.upos,
            "xpos": word.xpos,
            "feats": word.feats,
            "deprel": word.deprel,
            "head": "ROOT" if head is None else head.text,
            "headId": word.head,
            "children": [
                {"text": child.text, "deprel": child.deprel, "upos": child.upos}
                for child in sent.words if child.head == word.id
            ],
        }

    focus_records: list[dict[str, Any]] = []
    for sent in doc.sentences:
        for word in overlaps:
            if word in sent.words:
                focus_records.append(word_record(word, sent))
    local_records = [] if sentence is None else [word_record(word, sentence) for word in sentence.words]
    sentence_starts = [] if sentence is None else [token.start_char for token in sentence.tokens if token.start_char is not None]
    sentence_ends = [] if sentence is None else [token.end_char for token in sentence.tokens if token.end_char is not None]
    return {
        "focusTokens": focus_records,
        "sentence": None if sentence is None else {"start": min(sentence_starts), "end": max(sentence_ends), "text": sentence.text},
        "localTokens": local_records,
    }


def sha256_json(value: Any) -> str:
    return hashlib.sha256((json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("runtime_output", type=Path)
    parser.add_argument("--stanza-resources", type=Path, required=True)
    parser.add_argument("--stanza-package", default="ewt")
    args = parser.parse_args()
    rows = read_jsonl(args.input)
    process = psutil.Process()
    initial_rss = process.memory_info().rss

    load_start = time.perf_counter()
    spacy_nlp = spacy.load("en_core_web_sm")
    spacy_load_seconds = time.perf_counter() - load_start
    spacy_loaded_rss = process.memory_info().rss

    load_start = time.perf_counter()
    stanza_nlp = stanza.Pipeline(
        "en",
        dir=str(args.stanza_resources),
        processors="tokenize,mwt,pos,lemma,depparse",
        package=args.stanza_package,
        download_method=None,
        use_gpu=False,
        verbose=False,
    )
    stanza_load_seconds = time.perf_counter() - load_start
    stanza_loaded_rss = process.memory_info().rss

    tasks: list[tuple[int, str, str, int, int]] = []
    for row_index, row in enumerate(rows):
        for member in MEMBERS[row["family"]]:
            text, start, end = variant(row, member)
            tasks.append((row_index, member, text, start, end))
    variant_count = len(tasks)
    parsed: list[dict[str, Any]] = [{} for _ in tasks]

    started = time.perf_counter()
    for index, doc in enumerate(spacy_nlp.pipe((task[2] for task in tasks), batch_size=64)):
        _, _, text, start, end = tasks[index]
        parsed[index]["spacy"] = spacy_features(doc, text, start, end)
    spacy_seconds = time.perf_counter() - started

    started = time.perf_counter()
    batch_size = 64
    for batch_start in range(0, len(tasks), batch_size):
        batch = tasks[batch_start: batch_start + batch_size]
        documents = [stanza.Document([], text=task[2]) for task in batch]
        for offset, doc in enumerate(stanza_nlp.bulk_process(documents)):
            _, _, text, start, end = batch[offset]
            parsed[batch_start + offset]["stanza"] = stanza_features(doc, text, start, end)
        print(f"processed {min(batch_start + batch_size, len(tasks))}/{len(tasks)} variants", file=sys.stderr, flush=True)
    stanza_seconds = time.perf_counter() - started

    tool_variants_by_row: list[dict[str, Any]] = [{} for _ in rows]
    for task, features in zip(tasks, parsed, strict=True):
        row_index, member, _, _, _ = task
        tool_variants_by_row[row_index][member] = features
    results = [{
        **row,
        "rootRequirements": root_requirements(row),
        "parserVariants": tool_variants_by_row[index],
    } for index, row in enumerate(rows)]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    rendered = "".join(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n" for row in results)
    args.output.write_text(rendered)
    counts = Counter(requirement for row in results for requirement in row["rootRequirements"])
    runtime = {
        "schemaVersion": 1,
        "purpose": "development_regression_only",
        "inputCases": len(rows),
        "parsedVariants": variant_count,
        "platform": platform.platform(),
        "python": platform.python_version(),
        "spacy": {
            "version": spacy.__version__,
            "model": "en_core_web_sm",
            "modelVersion": spacy_nlp.meta.get("version"),
            "loadSeconds": spacy_load_seconds,
            "parseSeconds": spacy_seconds,
            "variantsPerSecond": variant_count / spacy_seconds,
            "rssAfterLoadBytes": spacy_loaded_rss,
        },
        "stanza": {
            "version": stanza.__version__,
            "package": f"en_{args.stanza_package}",
            "processors": ["tokenize", "mwt", "pos", "lemma", "depparse"],
            "loadSeconds": stanza_load_seconds,
            "parseSeconds": stanza_seconds,
            "variantsPerSecond": variant_count / stanza_seconds,
            "rssAfterBothModelsLoadedBytes": stanza_loaded_rss,
        },
        "initialRssBytes": initial_rss,
        "maxRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "requirementCounts": dict(sorted(counts.items())),
        "outputSha256": hashlib.sha256(rendered.encode()).hexdigest(),
        "normalizedFeatureFingerprint": sha256_json(results),
    }
    args.runtime_output.parent.mkdir(parents=True, exist_ok=True)
    args.runtime_output.write_text(json.dumps(runtime, indent=2, sort_keys=True) + "\n")
    print(json.dumps(runtime, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
