#!/usr/bin/env python3
"""Convert the existing PR-10 candidate set to canonical-word readiness.

This intentionally preserves the selected 1,000 identities while deleting the
generated word-to-skill proposals.  It does not invent child-facing word sums.
"""
from __future__ import annotations

import csv, json, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-next-1000-word-batch"
CSV = PACKAGE / "csv"; REVIEW = PACKAGE / "review"

def read(path):
    with path.open(encoding="utf-8-sig", newline="") as f: return list(csv.DictReader(f))
def write(path, rows, fields=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = fields or list(rows[0])
    with path.open("w", encoding="utf-8", newline="") as f:
        w=csv.DictWriter(f, fieldnames=fields, extrasaction="ignore"); w.writeheader(); w.writerows(rows)

def main():
    old_register = read(REVIEW / "selection_register.csv")
    old_metadata = {r["word_key"]: r for r in read(CSV / "canonical_word_metadata.csv")}
    words = read(CSV / "canonical_words.csv")
    register=[]; morphology=[]
    for old in old_register:
        key=old["word_key"]; meta=old_metadata[key]
        register.append({
            "rank":old["rank"],"word_key":key,"word":old["word"],"display_word":old["display_word"],
            "learner_demand_selection_evidence":old["forced_learner_demand"],"curriculum_evidence":old["curriculum_evidence"],"curriculum_age":old["curriculum_age"],"aoa_median":old["aoa_median"],"wordfreq_zipf":old["wordfreq_zipf"],"frequency_band":old["frequency_band"],"bnc_frequency":old["bnc_frequency"],"starter_source_continuity":old["prior_source_continuity"],"morpholex_exact":old["morpholex_exact"],"raw_morpholex_segmentation":old["morpholex_segmentation"],"british_ipa":old["british_ipa"],"cmudict":old["cmudict"],"syllables":old["syllables"],"age_band":old["age_band"],"complexity_band":old["complexity_band"],
            "identity_review":"in_review","selection_evidence_review":"in_review","pronunciation_review":"in_review","british_english_review":"in_review","accessibility_review":"in_review","source_licence_review":"in_review","final_decision":"in_review","reviewed_by":"","reviewed_at":"","review_notes":""})
        exact=old["morpholex_exact"] == "True"
        morphology.append({"word_key":key,"raw_morpholex_segmentation":old["morpholex_segmentation"],"raw_morpholex_pos":"","morphology_parts":"[]","feature_keys":"[]","morphology_joins":"[]","transformation_notes":"","word_sum":"","analysis_status":"in_review","source_category":"open_licensed" if exact else "internal_authored","source_name":"MorphoLex-en" if exact else "No exact MorphoLex-en row","source_url":"https://github.com/hugomailhot/MorphoLex-en" if exact else "","source_licence":"CC BY-NC-SA 4.0" if exact else "","source_use_note":"Raw linguistic candidate only. Reviewer must decide structured analysis and child-facing word sum; neither is inferred from MorphoLex.","confidence":"medium" if exact else "low","review_status":"in_review","reviewed_by":"","reviewed_at":"","review_notes":"","linguistic_analysis_review":"in_review","word_sum_review":"in_review","final_decision":"in_review"})
    morph_fields=[k for k in morphology[0] if k not in {"linguistic_analysis_review","word_sum_review","final_decision"}]
    write(CSV / "canonical_word_morphology.csv", morphology, morph_fields)
    write(REVIEW / "canonical_word_review.csv", register)
    write(REVIEW / "linguistic_morphology_word_sums_review.csv", morphology)
    for stale in [CSV / "micro_skill_word_support.csv", REVIEW / "mapping_review.csv", REVIEW / "metadata_review.csv"]:
        if stale.exists(): stale.unlink()
    repairs=[{"word":w,"repair_type":"metadata_add","review_status":"in_review","reviewed_by":"","reviewed_at":"","review_notes":""} for w in ("govern","governor","tall")]
    write(REVIEW / "existing_row_repairs.csv", repairs)
    dictation=read(REVIEW / "dictation_review.csv"); sources=read(REVIEW / "source_review.csv")
    overview=[["Topic","Instruction"],["Scope","Canonical-word readiness only. No word is assigned to a micro-skill in this batch."],["Policy","Capability ready, not pre-diagnosed: a real approved correction later activates a signed-off micro-skill."],["MorphoLex","Linguistic evidence only. Do not turn its segmentation into a child-facing word sum automatically."],["Word sums","Approve a teachable word sum, mark not applicable, or reject the analysis. Never leave a morphology decision unresolved."],["Transfer selection","Future ADLE uses approved feature records and an active selector profile; authentic use comes from the learning item."],["Status","HUMAN REVIEW REQUIRED"]]
    data={"Overview & instructions":overview,"Canonical word review":[list(register[0])]+[[r[k] for k in register[0]] for r in register],"Linguistic morphology & word sums":[list(morphology[0])]+[[r[k] for k in morphology[0]] for r in morphology],"Dictation review":[list(dictation[0])]+[[r[k] for k in dictation[0]] for r in dictation],"Sources & licence":[list(sources[0])]+[[r[k] for k in sources[0]] for r in sources],"Existing word-fact repairs":[list(repairs[0])]+[[r[k] for k in repairs[0]] for r in repairs]}
    (PACKAGE / "review-workbook-data.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    manifest=json.loads((PACKAGE / "manifest.json").read_text()); manifest.update({"schemaVersion":"canonical_word_readiness_v1","batchType":"canonical_word_only","morphologyRows":1000,"supportRows":0,"existingRepairRows":3}); (PACKAGE / "manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps({"words":len(words),"morphology":len(morphology),"support_rows":0,"repairs":len(repairs)}))
if __name__ == "__main__": main()
