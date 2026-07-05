#!/usr/bin/env python3
"""ADLE Slice 4 (4G): guarded authentic-use bridge + corpus preview scan.

Derives candidate correct authentic uses of canonical dictionary words from
the child's stored writing and bridges them into adle_authentic_use_events.
Semantics mirror lib/adle/authentic-use.ts authenticUseBridge (the canonical,
regression-covered pure model):

  - matching is by normalised word text only (no writing-engine record links
    to canonical word ids — verified 2026-07-05); no match -> reported, never
    guessed
  - pieces that passed parent review (writing_samples.review_completed_at)
    yield events directly under --apply
  - pieces never parent-reviewed are the CORPUS PREVIEW SCAN (owner-approved
    2026-07-05): report-only candidates that become events ONLY when listed
    in a --confirmations file — nothing is credited automatically from
    unreviewed text
  - a token flagged as a misspelling of that sample (misspelling_instances,
    not false-positive) is never a correct-use candidate
  - self-corrections bridge from writing_issue_correction_attempts
    (corrected_independently) joined to finalised, learning-relevant issues
  - homophone-family words are caveat-flagged on the report (spelled-right
    is not used-right); exact-form matching only — inflected forms of a
    dictionary word do not match it (report header notes this)

Dry-run is the default; --apply requires the confirmation token and the
localhost:54322 guard, and inserts under an advisory-lock transaction with
on-conflict-do-nothing (append-only, idempotent per piece guard).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CONFIRMATION_TOKEN = "ADLE-AUTHENTIC-USE-LOCAL-DEV"
ADVISORY_LOCK_NAME = "adle_authentic_use_bridge"
HOMOPHONE_FAMILY_KEY = "D4_HOM"
TOKEN_RE = re.compile(r"[a-z]+")


def require_local(db_url: str) -> None:
    parsed = urlparse(db_url)
    if parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("Refusing non-local database host. Expected localhost or 127.0.0.1.")
    if parsed.port != 54322:
        raise ValueError("Refusing non-local Supabase port. Expected local Postgres port 54322.")


def psql_base(db_url: str, psql_mode: str, docker_container: str | None) -> list[str]:
    # Same convention as adle-band-teaching-dictionary.py: in docker mode psql
    # runs inside the container against its local socket; the URL is only the
    # localhost guard.
    if psql_mode == "docker":
        if not docker_container:
            raise ValueError("--docker-container is required with --psql-mode docker.")
        return ["docker", "exec", "-i", docker_container, "psql", "-U", "postgres", "-d", "postgres",
                "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-qAt"]
    return ["psql", db_url, "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-qAt"]


def run_sql_json(base: list[str], sql: str):
    result = subprocess.run(base, input=f"select coalesce(json_agg(t), '[]'::json) from ({sql}) t;",
                            capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"psql failed: {result.stderr.strip()}")
    return json.loads(result.stdout.strip() or "[]")


def run_sql(base: list[str], sql: str) -> str:
    result = subprocess.run(base, input=sql, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"psql failed: {result.stderr.strip()}")
    return result.stdout


def normalise(word: str) -> str:
    return re.sub(r"[^a-z]", "", word.lower())


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def extract(base: list[str]) -> dict:
    samples = run_sql_json(base, """
        select id, child_id, sample_text,
               coalesce(written_at::date, created_at::date)::text as occurred_on,
               (review_completed_at is not null) as parent_reviewed
        from public.writing_samples
    """)
    flagged = run_sql_json(base, """
        select writing_sample_id, misspelled_word
        from public.misspelling_instances
        where is_false_positive = false
    """)
    dictionary = run_sql_json(base, """
        select id, normalised_word from public.canonical_teaching_dictionary_words
        where row_status = 'active'
    """)
    homophone_words = run_sql_json(base, f"""
        select distinct s.canonical_word_id as id
        from public.canonical_teaching_dictionary_word_support s
        join public.micro_skill_catalog c on c.micro_skill_key = s.micro_skill_key
        where c.skill_family_key = {quote(HOMOPHONE_FAMILY_KEY)} and s.row_status = 'active'
    """)
    self_corrections = run_sql_json(base, """
        select a.id as attempt_id, a.child_id, i.writing_sample_id,
               coalesce(i.approved_replacement, i.suggested_replacement) as corrected,
               coalesce(s.written_at::date, s.created_at::date)::text as occurred_on,
               (s.review_completed_at is not null) as parent_reviewed
        from public.writing_issue_correction_attempts a
        join public.writing_issues i on i.id = a.writing_issue_id
        join public.writing_samples s on s.id = i.writing_sample_id
        where a.corrected_independently = true
          and i.issue_status = 'finalised'
          and coalesce(i.final_classification, '') <> 'not_an_issue'
    """)
    existing = run_sql_json(base, """
        select child_id, canonical_word_id, piece_ref, use_kind
        from public.adle_authentic_use_events where row_status = 'active'
    """)
    return {
        "samples": samples,
        "flagged": flagged,
        "dictionary": dictionary,
        "homophone_word_ids": {row["id"] for row in homophone_words},
        "self_corrections": self_corrections,
        "existing": {(r["child_id"], r["canonical_word_id"], r["piece_ref"], r["use_kind"]) for r in existing},
    }


def build_candidates(data: dict) -> dict:
    word_id_by_normalised = {row["normalised_word"]: row["id"] for row in data["dictionary"]}
    flagged_by_sample: dict[str, set[str]] = {}
    for row in data["flagged"]:
        flagged_by_sample.setdefault(row["writing_sample_id"], set()).add(normalise(row["misspelled_word"] or ""))

    events, previews, unmatched_tokens = [], [], set()
    seen = set()

    def add(child_id: str, word_norm: str, occurred_on: str, piece_ref: str,
            source_ref: str, use_kind: str, parent_reviewed: bool):
        word_id = word_id_by_normalised.get(word_norm)
        if word_id is None:
            unmatched_tokens.add(word_norm)
            return
        key = (child_id, word_id, piece_ref, use_kind)
        if key in seen or key in data["existing"]:
            return
        seen.add(key)
        candidate = {
            "child_id": child_id,
            "canonical_word_id": word_id,
            "word": word_norm,
            "occurred_on": occurred_on,
            "piece_ref": piece_ref,
            "source_ref": source_ref,
            "use_kind": use_kind,
            "piece_parent_reviewed": parent_reviewed,
            "homophone_family_caveat": word_id in data["homophone_word_ids"],
        }
        (events if parent_reviewed else previews).append(candidate)

    for sample in data["samples"]:
        piece_ref = f"ws:{sample['id']}"
        flagged = flagged_by_sample.get(sample["id"], set())
        tokens = {t for t in TOKEN_RE.findall((sample["sample_text"] or "").lower())}
        for token in sorted(tokens):
            if token in flagged:
                continue  # a flagged misspelling is never a correct use
            add(sample["child_id"], token, sample["occurred_on"], piece_ref,
                piece_ref, "authentic_correct_use", bool(sample["parent_reviewed"]))
    for row in data["self_corrections"]:
        piece_ref = f"ws:{row['writing_sample_id']}"
        add(row["child_id"], normalise(row["corrected"] or ""), row["occurred_on"], piece_ref,
            f"wi-corr:{row['attempt_id']}", "self_correction_in_writing", bool(row["parent_reviewed"]))

    return {"events": events, "preview_candidates": previews,
            "unmatched_token_count": len(unmatched_tokens)}


def apply_events(base: list[str], rows: list[dict], confirmed: bool) -> str:
    if not rows:
        return "nothing to apply"
    del confirmed  # confirmed and reviewed rows insert identically; the
    # distinction lives in the report (confirmed_this_run) for audit
    values = []
    for row in rows:
        values.append(
            f"({quote(row['child_id'])}::uuid, {quote(row['canonical_word_id'])}::uuid, "
            f"{quote(row['occurred_on'])}::date, {quote(row['use_kind'])}, "
            f"{quote(row['piece_ref'])}, {quote(row['source_ref'])})"
        )
    sql = f"""
begin;
select pg_advisory_xact_lock(hashtext({quote(ADVISORY_LOCK_NAME)}));
insert into public.adle_authentic_use_events
  (child_id, canonical_word_id, occurred_on, use_kind, piece_ref, source_ref,
   parent_verified, verified_at)
select v.child_id, v.canonical_word_id, v.occurred_on, v.use_kind, v.piece_ref, v.source_ref,
       true, timezone('utc', now())
from (values {', '.join(values)})
  as v(child_id, canonical_word_id, occurred_on, use_kind, piece_ref, source_ref)
on conflict do nothing;
commit;
"""
    return run_sql(base, sql)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local-db-url", required=True)
    parser.add_argument("--psql-mode", choices=("host", "docker"), default="host")
    parser.add_argument("--docker-container")
    parser.add_argument("--report", default=str(ROOT / "tmp" / "adle-authentic-use-bridge-report.json"))
    parser.add_argument("--confirmations",
                        help="JSON file: list of {child_id, canonical_word_id, piece_ref} preview candidates the owner confirms (corpus preview scan).")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-local-dev-authentic-use",
                        help=f"Required with --apply. Must equal {CONFIRMATION_TOKEN!r}.")
    args = parser.parse_args()

    require_local(args.local_db_url)
    base = psql_base(args.local_db_url, args.psql_mode, args.docker_container)
    data = extract(base)
    result = build_candidates(data)

    confirmed_rows: list[dict] = []
    if args.confirmations:
        confirmations = json.loads(Path(args.confirmations).read_text())
        wanted = {(c["child_id"], c["canonical_word_id"], c["piece_ref"]) for c in confirmations}
        confirmed_rows = [row for row in result["preview_candidates"]
                          if (row["child_id"], row["canonical_word_id"], row["piece_ref"]) in wanted]

    report = {
        "note": "exact-form matching only; inflected forms of a dictionary word do not match it; homophone-family candidates are caveat-flagged (spelled-right is not used-right)",
        "reviewed_piece_events": result["events"],
        "preview_candidates_requiring_owner_confirmation": result["preview_candidates"],
        "confirmed_this_run": confirmed_rows,
        "unmatched_token_count": result["unmatched_token_count"],
        "counts": {
            "reviewed_piece_events": len(result["events"]),
            "preview_candidates": len(result["preview_candidates"]),
            "confirmed": len(confirmed_rows),
        },
        "applied": False,
    }

    if args.apply:
        if args.confirm_local_dev_authentic_use != CONFIRMATION_TOKEN:
            print(f"Refusing --apply without --confirm-local-dev-authentic-use {CONFIRMATION_TOKEN!r}.", file=sys.stderr)
            return 2
        apply_events(base, result["events"], confirmed=False)
        apply_events(base, confirmed_rows, confirmed=True)
        report["applied"] = True

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, default=str) + "\n")
    print(json.dumps(report["counts"] | {"applied": report["applied"], "report": str(report_path)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
