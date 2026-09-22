#!/usr/bin/env python3
"""Pinned transformer -> the existing ADLE normalized structural contract.

This optional fallback emits structural facts only.  It deliberately imports
the shared normalization implementation from adapter.py so the two parser
models cannot acquire separate family-decision semantics.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import json
import platform
import sys
from pathlib import Path
from typing import Any

import en_core_web_trf
import spacy

_COMMON_PATH = Path(__file__).with_name("adapter.py")
_SPEC = importlib.util.spec_from_file_location("s8_v4_spacy_adapter_common", _COMMON_PATH)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError("ADAPTER_COMMON_IMPORT_FAILED")
common = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(common)

EXPECTED_SPACY = "3.8.16"
EXPECTED_MODEL = "en_core_web_trf"
EXPECTED_MODEL_VERSION = "3.8.0"
EXPECTED_MODEL_TREE_SHA256 = "0f6894e257827c6ad731b5cb9d1162bffd308fd0e99444d51b822890c4bb9d6e"
EXPECTED_MODEL_WHEEL_SHA256 = "272a31e9d8530d1e075351d30a462d7e80e31da23574f1b274e200f3fff35bf5"
MAX_BATCH = 512


def model_tree_fingerprint() -> str:
    root = Path(en_core_web_trf.__file__).parent
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


def installed_wheel_fingerprint() -> str:
    distribution = importlib.metadata.distribution("en-core-web-trf")
    direct_url_entry = next((entry for entry in distribution.files or [] if str(entry).endswith(".dist-info/direct_url.json")), None)
    if direct_url_entry is None:
        raise RuntimeError("MODEL_WHEEL_PROVENANCE_MISSING")
    direct_url = Path(distribution.locate_file(direct_url_entry))
    if not direct_url.is_file():
        raise RuntimeError("MODEL_WHEEL_PROVENANCE_MISSING")
    metadata = json.loads(direct_url.read_text(encoding="utf-8"))
    observed = metadata.get("archive_info", {}).get("hashes", {}).get("sha256")
    if not isinstance(observed, str):
        raise RuntimeError("MODEL_WHEEL_PROVENANCE_MALFORMED")
    return observed


def main() -> None:
    if spacy.__version__ != EXPECTED_SPACY:
        raise RuntimeError(f"SPACY_IDENTITY_MISMATCH:{spacy.__version__}")
    model_version = importlib.metadata.version("en-core-web-trf")
    tree_sha = model_tree_fingerprint()
    wheel_sha = installed_wheel_fingerprint()
    if model_version != EXPECTED_MODEL_VERSION or tree_sha != EXPECTED_MODEL_TREE_SHA256 or wheel_sha != EXPECTED_MODEL_WHEEL_SHA256:
        raise RuntimeError(f"MODEL_IDENTITY_MISMATCH:{model_version}:{tree_sha}:{wheel_sha}")
    payload = json.load(sys.stdin)
    requests = payload.get("requests")
    if payload.get("schemaVersion") != common.SCHEMA_VERSION or not isinstance(requests, list) or len(requests) > MAX_BATCH:
        raise ValueError("MALFORMED_OR_OVERSIZED_REQUEST")

    nlp = spacy.load(EXPECTED_MODEL)
    jobs: list[tuple[int, str, str, int, int]] = []
    prepared: list[dict[str, Any]] = []
    for request_index, request in enumerate(requests):
        text = request.get("sourceText")
        members = request.get("familyMembers")
        start = request.get("startUtf16")
        end = request.get("endUtf16")
        row: dict[str, Any] = {"requestId": request.get("requestId"), "status": "ready", "variants": {}}
        prepared.append(row)
        try:
            if not isinstance(text, str) or common.utf16_len(text) > common.MAX_SOURCE_UTF16 or not isinstance(members, list) or not (1 <= len(members) <= 4):
                raise ValueError("MALFORMED_OR_OVERSIZED_REQUEST")
            py_start = common.utf16_to_py(text, start)
            py_end = common.utf16_to_py(text, end)
            observed = text[py_start:py_end].lower().replace("’", "'").replace("ʼ", "'")
            if not observed or observed not in members:
                raise ValueError("SOURCE_SPAN_OR_FAMILY_MISMATCH")
            for member in members:
                if not isinstance(member, str):
                    raise ValueError("MALFORMED_FAMILY_MEMBER")
                changed = text[:py_start] + member + text[py_end:]
                jobs.append((request_index, member, changed, start, start + common.utf16_len(member)))
        except ValueError as error:
            row["status"] = "blocked"
            row["reason"] = str(error)

    for job, doc in zip(jobs, nlp.pipe((job[2] for job in jobs), batch_size=64), strict=True):
        request_index, member, text, start, end = job
        prepared[request_index]["variants"][member] = common.analyse_variant(doc, text, start, end)

    identity = {
        "adapterSchemaVersion": common.SCHEMA_VERSION,
        "adapterVersion": common.ADAPTER_VERSION,
        "pythonVersion": platform.python_version(),
        "spacyVersion": spacy.__version__,
        "modelName": EXPECTED_MODEL,
        "modelVersion": model_version,
        "modelTreeSha256": tree_sha,
        "modelWheelSha256": wheel_sha,
        "parserBatchSize": 64,
        "pipeline": nlp.pipe_names,
        "cpuOnly": True,
    }
    json.dump({"schemaVersion": common.SCHEMA_VERSION, "identity": identity, "results": prepared}, sys.stdout, sort_keys=True, separators=(",", ":"))


if __name__ == "__main__":
    main()
