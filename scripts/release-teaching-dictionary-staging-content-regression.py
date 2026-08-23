#!/usr/bin/env python3
"""Focused static regression checks for the staging-only content release adapter."""

from __future__ import annotations

import importlib.util
import shutil
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADAPTER = ROOT / "scripts/release-teaching-dictionary-staging-content.py"
FIXTURE = ROOT / "scripts/fixtures/teaching-dictionary-csv/valid_reflection_prompt"


def load_adapter():
    spec = importlib.util.spec_from_file_location("staging_content_release", ADAPTER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    adapter = load_adapter()
    importer = adapter.load_importer()
    with tempfile.TemporaryDirectory() as tmp:
        release_fixture = Path(tmp) / "release-package"
        shutil.copytree(FIXTURE, release_fixture)
        content = release_fixture / "teaching_content_versions.csv"
        content.write_text(
            content.read_text(encoding="utf-8")
            .replace(",v1,active,TRUE,", ",v2,active,TRUE,", 1)
            .replace(",high,,signed_off,", ",high,v1,signed_off,", 1),
            encoding="utf-8",
        )
        reviews = release_fixture / "teaching_content_field_reviews.csv"
        reviews.write_text(reviews.read_text(encoding="utf-8").replace(",v1,", ",v2,"), encoding="utf-8")
        manifest = importer.build_manifest(release_fixture, include_planned_rows=True)
    sql = adapter.release_transaction_sql(importer, manifest)
    assert "jlhotktspjvffslvuyfz" in sql
    assert "wwohrqtunajrbwxyssjf" not in sql
    assert "pg_advisory_xact_lock" in sql
    assert "canonical_teaching_dictionary_content_versions" in sql
    assert "canonical_teaching_dictionary_field_reviews" in sql
    assert "canonical_teaching_dictionary_readiness_reports" in sql
    assert "canonical_teaching_dictionary_words" not in sql
    assert "learning_items" not in sql
    assert "reflection_prompt_key" in sql and "reflection_prompt_text" in sql
    assert "teaching_content_row_v2_reflection" in sql

    with tempfile.TemporaryDirectory() as tmp:
        copied = Path(tmp) / "package"
        shutil.copytree(FIXTURE, copied)
        content = copied / "teaching_content_versions.csv"
        content.write_text(content.read_text(encoding="utf-8").replace("generic-noticing-v1", "", 1), encoding="utf-8")
        bad = importer.build_manifest(copied, include_planned_rows=True)
        try:
            adapter.release_transaction_sql(importer, bad)
        except ValueError:
            pass
        else:
            raise AssertionError("Missing Reflection authority was accepted.")

    print("release-teaching-dictionary-staging-content-regression: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
