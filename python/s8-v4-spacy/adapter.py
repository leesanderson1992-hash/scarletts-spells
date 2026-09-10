#!/usr/bin/env python3
"""Pinned spaCy -> ADLE normalized structural facts (no public decisions)."""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import platform
import sys
from pathlib import Path
from typing import Any

import en_core_web_sm
import spacy

SCHEMA_VERSION = "ADLE_S8_STRUCTURAL_FEATURES_V1"
ADAPTER_VERSION = "ADLE_S8_SPACY_ADAPTER_V1"
EXPECTED_SPACY = "3.8.16"
EXPECTED_MODEL = "en_core_web_sm"
EXPECTED_MODEL_VERSION = "3.8.0"
EXPECTED_MODEL_TREE_SHA256 = "a07424822a13ad5bd9cb7a021e219c77279a907c58171c52846448b832107ed4"
MAX_BATCH = 2_000
MAX_SOURCE_UTF16 = 16_384
MAX_TOKENS = 512
MAX_RELATIONS = 16

DEPENDENCY = {
    "ROOT": "ROOT", "expl": "EXPLETIVE", "advmod": "ADVERBIAL_MODIFIER",
    "poss": "POSSESSIVE_MODIFIER", "nsubj": "SUBJECT", "nsubjpass": "PASSIVE_SUBJECT",
    "aux": "AUXILIARY", "auxpass": "PASSIVE_AUXILIARY", "cop": "COPULA",
    "prep": "PREPOSITIONAL_MODIFIER", "pcomp": "PREPOSITIONAL_COMPLEMENT",
    "pobj": "PREPOSITIONAL_OBJECT", "dative": "RECIPIENT", "nummod": "NUMERIC_MODIFIER",
    "mark": "MARKER", "amod": "ADJECTIVAL_MODIFIER", "attr": "ATTRIBUTE",
    "dobj": "OBJECT", "obj": "OBJECT", "iobj": "INDIRECT_OBJECT",
    "acomp": "ADJECTIVAL_COMPLEMENT", "oprd": "OBJECT_PREDICATE",
    "xcomp": "OPEN_CLAUSAL_COMPLEMENT", "ccomp": "CLAUSAL_COMPLEMENT",
    "conj": "COORDINATE", "parataxis": "PARATAXIS",
}


def utf16_len(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def utf16_to_py(value: str, offset: int) -> int:
    if not isinstance(offset, int) or offset < 0:
        raise ValueError("SOURCE_SPAN_MISMATCH")
    raw = value.encode("utf-16-le")
    if offset * 2 > len(raw):
        raise ValueError("SOURCE_SPAN_MISMATCH")
    try:
        return len(raw[: offset * 2].decode("utf-16-le"))
    except UnicodeDecodeError as error:
        raise ValueError("SOURCE_SPAN_SPLITS_SURROGATE") from error


def py_to_utf16(value: str, offset: int) -> int:
    return utf16_len(value[:offset])


def model_tree_fingerprint() -> str:
    root = Path(en_core_web_sm.__file__).parent
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        data = path.read_bytes()
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(b"\0")
        digest.update(str(len(data)).encode())
        digest.update(b"\0")
        digest.update(data)
    return digest.hexdigest()


def relation(dep: str) -> str:
    return DEPENDENCY.get(dep, f"OTHER:{dep}")


def token_record(token: Any, text: str) -> dict[str, Any]:
    return {
        "index": token.i, "surface": token.text, "normalized": token.norm_.lower(),
        "startUtf16": py_to_utf16(text, token.idx),
        "endUtf16": py_to_utf16(text, token.idx + len(token.text)),
        "lemma": token.lemma_.lower(), "coarsePos": token.pos_, "fineTag": token.tag_,
        "morphology": sorted(str(token.morph).split("|")) if str(token.morph) else [],
        "headIndex": token.head.i,
        "headStartUtf16": py_to_utf16(text, token.head.idx),
        "headEndUtf16": py_to_utf16(text, token.head.idx + len(token.head.text)),
        "dependency": relation(token.dep_), "sourceDependency": token.dep_,
    }


def bounded_relation(token: Any, text: str) -> dict[str, Any]:
    return {
        "index": token.i, "surface": token.text, "lemma": token.lemma_.lower(),
        "coarsePos": token.pos_, "fineTag": token.tag_,
        "startUtf16": py_to_utf16(text, token.idx),
        "endUtf16": py_to_utf16(text, token.idx + len(token.text)),
        "dependency": relation(token.dep_), "sourceDependency": token.dep_,
    }


def analyse_variant(doc: Any, text: str, start: int, end: int) -> dict[str, Any]:
    overlaps = [token for token in doc if py_to_utf16(text, token.idx) < end and py_to_utf16(text, token.idx + len(token.text)) > start]
    aligned = bool(overlaps) and min(py_to_utf16(text, token.idx) for token in overlaps) == start and max(py_to_utf16(text, token.idx + len(token.text)) for token in overlaps) == end
    sentence = next((sent for sent in doc.sents if py_to_utf16(text, sent.start_char) <= start and end <= py_to_utf16(text, sent.end_char)), None)
    if not aligned or sentence is None:
        return {"status": "blocked", "reason": "PARSER_FOCUS_ALIGNMENT_FAILED"}
    if len(doc) > MAX_TOKENS:
        return {"status": "blocked", "reason": "PARSER_TOKEN_LIMIT"}
    ancestors: list[Any] = []
    children: list[Any] = []
    seen_ancestors: set[int] = set()
    seen_children: set[int] = set()
    for token in overlaps:
        for ancestor in token.ancestors:
            if ancestor.i not in seen_ancestors and len(ancestors) < MAX_RELATIONS:
                seen_ancestors.add(ancestor.i); ancestors.append(ancestor)
        for child in token.children:
            if child.i not in seen_children and len(children) < MAX_RELATIONS:
                seen_children.add(child.i); children.append(child)
    related: list[Any] = []
    seen_related: set[int] = set()
    for token in [*overlaps, *(token.head for token in overlaps), *children]:
        if token.i not in seen_related and len(related) < MAX_RELATIONS:
            seen_related.add(token.i); related.append(token)
    def relations(names: set[str]) -> list[dict[str, Any]]:
        return [bounded_relation(token, text) for token in related if relation(token.dep_) in names]
    nominal_head = next((token.head for token in overlaps if token.head.pos_ in {"NOUN", "PROPN"}), None)
    return {
        "status": "ready", "variantTextUtf16Length": utf16_len(text),
        "focusStartUtf16": start, "focusEndUtf16": end,
        "focusTokenIndices": sorted(token.i for token in overlaps),
        "sentenceStartUtf16": py_to_utf16(text, sentence.start_char),
        "sentenceEndUtf16": py_to_utf16(text, sentence.end_char),
        "tokens": [token_record(token, text) for token in sentence],
        "ancestors": [bounded_relation(token, text) for token in ancestors],
        "children": [bounded_relation(token, text) for token in children],
        "facts": {
            "nominalHead": None if nominal_head is None else bounded_relation(nominal_head, text),
            "subjectRelations": relations({"SUBJECT", "PASSIVE_SUBJECT"}),
            "possessiveRelations": relations({"POSSESSIVE_MODIFIER"}),
            "auxiliaryRelations": relations({"AUXILIARY", "PASSIVE_AUXILIARY"}),
            "copularRelations": relations({"COPULA"}),
            "passiveRelations": relations({"PASSIVE_SUBJECT", "PASSIVE_AUXILIARY"}),
            "verbalForms": [bounded_relation(token, text) for token in related if token.pos_ in {"VERB", "AUX"}],
            "numeralRelations": relations({"NUMERIC_MODIFIER"}),
            "modifierRelations": relations({"ADVERBIAL_MODIFIER", "ADJECTIVAL_MODIFIER"}),
            "prepositionMarkerRelations": relations({"PREPOSITIONAL_MODIFIER", "PREPOSITIONAL_COMPLEMENT", "PREPOSITIONAL_OBJECT", "MARKER"}),
        },
    }


def main() -> None:
    if spacy.__version__ != EXPECTED_SPACY:
        raise RuntimeError(f"SPACY_IDENTITY_MISMATCH:{spacy.__version__}")
    model_version = importlib.metadata.version("en-core-web-sm")
    tree_sha = model_tree_fingerprint()
    if model_version != EXPECTED_MODEL_VERSION or tree_sha != EXPECTED_MODEL_TREE_SHA256:
        raise RuntimeError(f"MODEL_IDENTITY_MISMATCH:{model_version}:{tree_sha}")
    payload = json.load(sys.stdin)
    requests = payload.get("requests")
    if payload.get("schemaVersion") != SCHEMA_VERSION or not isinstance(requests, list) or len(requests) > MAX_BATCH:
        raise ValueError("MALFORMED_OR_OVERSIZED_REQUEST")
    nlp = spacy.load(EXPECTED_MODEL)
    jobs: list[tuple[int, str, str, int, int]] = []
    prepared: list[dict[str, Any]] = []
    for request_index, request in enumerate(requests):
        text = request.get("sourceText"); members = request.get("familyMembers")
        start = request.get("startUtf16"); end = request.get("endUtf16")
        row: dict[str, Any] = {"requestId": request.get("requestId"), "status": "ready", "variants": {}}
        prepared.append(row)
        try:
            if not isinstance(text, str) or utf16_len(text) > MAX_SOURCE_UTF16 or not isinstance(members, list) or not (1 <= len(members) <= 4):
                raise ValueError("MALFORMED_OR_OVERSIZED_REQUEST")
            py_start = utf16_to_py(text, start); py_end = utf16_to_py(text, end)
            observed = text[py_start:py_end].lower().replace("’", "'").replace("ʼ", "'")
            if not observed or observed not in members:
                raise ValueError("SOURCE_SPAN_OR_FAMILY_MISMATCH")
            for member in members:
                if not isinstance(member, str):
                    raise ValueError("MALFORMED_FAMILY_MEMBER")
                changed = text[:py_start] + member + text[py_end:]
                jobs.append((request_index, member, changed, start, start + utf16_len(member)))
        except ValueError as error:
            row["status"] = "blocked"; row["reason"] = str(error)
    for job, doc in zip(jobs, nlp.pipe((job[2] for job in jobs), batch_size=64), strict=True):
        request_index, member, text, start, end = job
        prepared[request_index]["variants"][member] = analyse_variant(doc, text, start, end)
    identity = {
        "adapterSchemaVersion": SCHEMA_VERSION, "adapterVersion": ADAPTER_VERSION,
        "pythonVersion": platform.python_version(), "spacyVersion": spacy.__version__,
        "modelName": EXPECTED_MODEL, "modelVersion": model_version,
        "modelTreeSha256": tree_sha, "cpuOnly": True,
    }
    json.dump({"schemaVersion": SCHEMA_VERSION, "identity": identity, "results": prepared}, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"S8_V4_ADAPTER_ERROR:{type(error).__name__}:{error}", file=sys.stderr)
        raise
