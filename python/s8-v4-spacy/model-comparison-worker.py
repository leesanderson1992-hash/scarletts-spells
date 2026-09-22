#!/usr/bin/env python3
"""Development-only JSONL persistent structural-feature worker for S8 V4."""
from __future__ import annotations
import hashlib, importlib, importlib.metadata, json, os, platform, resource, sys, time
from pathlib import Path
from typing import Any
import spacy
from adapter import (
    ADAPTER_VERSION,
    DEPENDENCY_PATTERNS,
    EXPECTED_SPACY,
    MAX_SOURCE_UTF16,
    MAX_TOKENS,
    SCHEMA_VERSION,
    analyse_variant,
    utf16_len,
    utf16_to_py,
)

MAX_REQUESTS = 2_000
MAX_BATCH = 25
# This is part of the semantic parser configuration.  The governed adapter
# parses counterfactual jobs in batches of 64; changing the neural pipeline's
# batch partition can change borderline tag/dependency predictions.
PARSER_BATCH_SIZE = 64
model_name = os.environ.get("S8_V4_EXPERIMENT_MODEL", "")
EXPECTED_MODELS = {"en_core_web_sm", "en_core_web_md", "en_core_web_lg", "en_core_web_trf"}
def model_tree_fingerprint(module: Any) -> str:
    root=Path(module.__file__).parent; digest=hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc": digest.update(path.relative_to(root).as_posix().encode()+b"\0"+path.read_bytes())
    return digest.hexdigest()
def tree_bytes(module: Any) -> int: return sum(p.stat().st_size for p in Path(module.__file__).parent.rglob("*") if p.is_file())

def max_rss_bytes() -> int:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if platform.system() == "Darwin" else value * 1024)

def emit(value: dict[str, Any]) -> None:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"))
    if len(raw.encode()) > 16 * 1024 * 1024: value = {"type":"error","reason":"RESULT_SIZE_LIMIT"}
    print(json.dumps(value, sort_keys=True, separators=(",", ":")), flush=True)

def main() -> None:
    if model_name not in EXPECTED_MODELS or spacy.__version__ != EXPECTED_SPACY: raise RuntimeError("WORKER_IDENTITY_INVALID")
    module = importlib.import_module(model_name)
    if importlib.metadata.version(model_name.replace("_", "-")) != "3.8.0": raise RuntimeError("MODEL_IDENTITY_INVALID")
    start = time.perf_counter(); nlp = spacy.load(model_name, exclude=["ner"] if os.environ.get("S8_V4_EXPERIMENT_EXCLUDE") == "ner" else [])
    adapter_path = Path(__file__).with_name("adapter.py")
    identity = {
        "adapterSchemaVersion": SCHEMA_VERSION,
        "adapterVersion": ADAPTER_VERSION,
        "adapterImplementationSha256": hashlib.sha256(adapter_path.read_bytes()).hexdigest(),
        "dependencyMatcherFingerprint": hashlib.sha256(
            json.dumps(DEPENDENCY_PATTERNS, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        "parserBatchSize": PARSER_BATCH_SIZE,
        "modelName":model_name,"modelVersion":"3.8.0","spacyVersion":spacy.__version__,"modelTreeSha256":model_tree_fingerprint(module),"modelTreeBytes":tree_bytes(module),"pipeline":list(nlp.pipe_names),"loadElapsedMs":round((time.perf_counter()-start)*1000,3),"rssAfterLoadBytes":max_rss_bytes()}
    emit({"type":"ready","identity":identity})
    count = 0
    for raw in sys.stdin:
        try:
            message=json.loads(raw); typ=message.get("type")
            if typ == "shutdown": emit({"type":"complete","processed":count}); return
            requests=message.get("requests")
            if typ != "parse" or not isinstance(requests,list) or not requests or len(requests)>MAX_BATCH or count+len(requests)>MAX_REQUESTS: raise ValueError("MALFORMED_OR_OVERSIZED_REQUEST")
            results=[]; jobs=[]
            for ri,r in enumerate(requests):
                text=r.get("sourceText"); members=r.get("familyMembers"); start=r.get("startUtf16"); end=r.get("endUtf16"); row={"requestId":r.get("requestId"),"status":"ready","variants":{}}
                results.append(row)
                try:
                    if not isinstance(text,str) or utf16_len(text)>MAX_SOURCE_UTF16 or not isinstance(members,list): raise ValueError("MALFORMED_OR_OVERSIZED_REQUEST")
                    ps=utf16_to_py(text,start); pe=utf16_to_py(text,end)
                    # Match the governed adapter's canonical family-member
                    # normalization exactly. U+02BC MODIFIER LETTER APOSTROPHE
                    # is present in frozen YOUR/ITS evidence as well as U+2019.
                    observed = text[ps:pe].lower().replace("’", "'").replace("ʼ", "'")
                    if observed not in members: raise ValueError("SOURCE_SPAN_OR_FAMILY_MISMATCH")
                    for m in members:
                        if not isinstance(m,str): raise ValueError("MALFORMED_FAMILY_MEMBER")
                        jobs.append((ri,m,text[:ps]+m+text[pe:],start,start+utf16_len(m)))
                except (TypeError, ValueError) as error:
                    row.update(status="blocked",reason=str(error)); continue
            elapsed=time.perf_counter()
            for job,doc in zip(jobs,nlp.pipe((x[2] for x in jobs),batch_size=PARSER_BATCH_SIZE),strict=True):
                ri,m,text,start,end=job
                if len(doc)>MAX_TOKENS: results[ri]["variants"][m]={"status":"blocked","reason":"PARSER_TOKEN_LIMIT"}
                else: results[ri]["variants"][m]=analyse_variant(doc,text,start,end)
            count += len(requests); emit({"type":"result","requestIds":[r.get("requestId") for r in requests],"results":results,"parseElapsedMs":round((time.perf_counter()-elapsed)*1000,3),"counterfactuals":len(jobs),"rssAfterParseBytes":max_rss_bytes()})
        except Exception as error: emit({"type":"error","reason":f"{type(error).__name__}:{error}"})
if __name__ == "__main__": main()
