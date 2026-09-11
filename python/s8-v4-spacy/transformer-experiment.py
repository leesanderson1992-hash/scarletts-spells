#!/usr/bin/env python3
"""Offline-only en_core_web_trf structural-feature experiment for S8 V4.

This deliberately reuses the production adapter's normalisation routines but
is never called by the production adapter, package lock, or release dispatch.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import platform
import resource
import sys
import time
from pathlib import Path
from typing import Any

import spacy

from adapter import (
    EXPECTED_SPACY,
    MAX_BATCH,
    MAX_SOURCE_UTF16,
    SCHEMA_VERSION,
    analyse_variant,
    utf16_len,
    utf16_to_py,
)

MODEL_NAME = "en_core_web_trf"
MODEL_VERSION = "3.8.0"


def model_tree_fingerprint(module: Any) -> str:
    root = Path(module.__file__).parent
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


def max_rss_bytes() -> int:
    # macOS reports ru_maxrss in bytes; Linux reports KiB. This task executes
    # on macOS, and retaining the platform label prevents ambiguous reuse.
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return value if sys.platform == "darwin" else value * 1024


def main() -> None:
    if spacy.__version__ != EXPECTED_SPACY:
        raise RuntimeError(f"SPACY_IDENTITY_MISMATCH:{spacy.__version__}")
    payload = json.load(sys.stdin)
    requests = payload.get("requests")
    if payload.get("schemaVersion") != SCHEMA_VERSION or not isinstance(requests, list) or len(requests) > MAX_BATCH:
        raise ValueError("MALFORMED_OR_OVERSIZED_REQUEST")
    model_module = importlib.import_module(MODEL_NAME)
    model_version = importlib.metadata.version("en-core-web-trf")
    if model_version != MODEL_VERSION:
        raise RuntimeError(f"MODEL_IDENTITY_MISMATCH:{model_version}")
    tree_sha = model_tree_fingerprint(model_module)
    before_load_rss = max_rss_bytes()
    load_start = time.perf_counter()
    nlp = spacy.load(MODEL_NAME)
    load_elapsed = time.perf_counter() - load_start
    after_load_rss = max_rss_bytes()
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
            if not isinstance(text, str) or utf16_len(text) > MAX_SOURCE_UTF16 or not isinstance(members, list) or not (1 <= len(members) <= 4):
                raise ValueError("MALFORMED_OR_OVERSIZED_REQUEST")
            py_start = utf16_to_py(text, start)
            py_end = utf16_to_py(text, end)
            observed = text[py_start:py_end].lower().replace("’", "'").replace("ʼ", "'")
            if not observed or observed not in members:
                raise ValueError("SOURCE_SPAN_OR_FAMILY_MISMATCH")
            for member in members:
                if not isinstance(member, str):
                    raise ValueError("MALFORMED_FAMILY_MEMBER")
                changed = text[:py_start] + member + text[py_end:]
                jobs.append((request_index, member, changed, start, start + utf16_len(member)))
        except ValueError as error:
            row["status"] = "blocked"
            row["reason"] = str(error)
    parse_start = time.perf_counter()
    for job, doc in zip(jobs, nlp.pipe((job[2] for job in jobs), batch_size=8), strict=True):
        request_index, member, text, start, end = job
        prepared[request_index]["variants"][member] = analyse_variant(doc, text, start, end)
    parse_elapsed = time.perf_counter() - parse_start
    identity = {
        "adapterSchemaVersion": SCHEMA_VERSION,
        "experimentalAdapter": "ADLE_S8_SPACY_TRANSFORMER_EXPERIMENT_V1",
        "pythonVersion": platform.python_version(),
        "spacyVersion": spacy.__version__,
        "modelName": MODEL_NAME, "modelVersion": model_version,
        "modelTreeSha256": tree_sha, "cpuOnly": True,
        "platform": platform.platform(),
        "loadElapsedMs": round(load_elapsed * 1000, 3),
        "parseElapsedMs": round(parse_elapsed * 1000, 3),
        "documents": len(jobs),
        "throughputDocumentsPerSecond": 0 if not jobs else round(len(jobs) / parse_elapsed, 3),
        "rssBeforeLoadBytes": before_load_rss,
        "rssAfterLoadBytes": after_load_rss,
        "rssAfterParseBytes": max_rss_bytes(),
    }
    json.dump({"schemaVersion": SCHEMA_VERSION, "identity": identity, "results": prepared}, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"S8_V4_TRANSFORMER_EXPERIMENT_ERROR:{type(error).__name__}:{error}", file=sys.stderr)
        raise
