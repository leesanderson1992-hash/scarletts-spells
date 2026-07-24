#!/usr/bin/env python3
"""Consolidate approved Dynamic Prefix staging inputs into one import package."""
from __future__ import annotations
import csv, hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment"
SOURCE = json.loads((OUT / "staging-import-candidate.json").read_text())
ANALYSES = {x["displayWord"]: x for x in json.loads((ROOT / "data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json").read_text())["wordAnalyses"]}

PROFILES = {
 "D4_MOR_PREFIXES_DIS_MIS": {"label":"dis- and mis-", "text":"mixed", "meaning":"not/opposite or wrongly/badly", "bins":[["not_or_opposite","Not or opposite","dis- means not or the opposite"],["wrongly_or_badly","Wrongly or badly","mis- means wrongly or badly"]], "choices":["dis","mis"], "reflection":"How did dis- and mis- change the meaning of the base word?"},
 "D4_MOR_PREFIXES_IN_IM_IL_IR": {"label":"in-, im-, il- and ir-", "text":"mixed", "meaning":"not", "bins":[["in_im","in-/im- form","not"],["il","il- form","not"],["ir","ir- form","not"]], "choices":["in","im","il","ir"], "reflection":"Which form of the ‘not’ prefix did each base word need?"},
 "D4_MOR_PREFIXES_RE_PRE": {"label":"re- and pre-", "text":"mixed", "meaning":"again/back or before", "bins":[["again_back","Again/back","re- means again or back"],["before","Before","pre- means before"]], "choices":["re","pre"], "reflection":"When did the prefix mean ‘again/back’, and when did it mean ‘before’?"},
 "D4_MOR_PREFIXES_SUB_INTER_SUPER": {"label":"sub-, inter- and super-", "text":"mixed", "meaning":"under, between or above/beyond", "bins":[["under","Under","sub- means under"],["between","Between","inter- means between"],["above_beyond","Above or beyond","super- means above or beyond"]], "choices":["sub","inter","super"], "reflection":"What position or amount did each longer prefix add?"},
}
def load_csv(name,key):
 with (OUT/name).open() as f: return {r[key]:r for r in csv.DictReader(f)}
def age_band(age): return "early_primary" if int(age)<=7 else "middle_primary" if int(age)<=9 else "upper_primary"
def bin_for(profile,prefix):
 return {"D4_MOR_PREFIXES_DIS_MIS":{"dis":"not_or_opposite","mis":"wrongly_or_badly"},"D4_MOR_PREFIXES_IN_IM_IL_IR":{"in":"in_im","im":"in_im","il":"il","ir":"ir"},"D4_MOR_PREFIXES_RE_PRE":{"re":"again_back","pre":"before"},"D4_MOR_PREFIXES_SUB_INTER_SUPER":{"sub":"under","inter":"between","super":"above_beyond"}}[profile][prefix]
def main():
 meanings=load_csv("base-meaning-review.csv","word"); bands=load_csv("missing-15-frequency-complexity-review.csv","word")
 existing={r["normalised_word"]:r for r in csv.DictReader((ROOT/"docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-04-complexity-banding-preview/word_complexity_banding_preview.csv").open())}
 words=[]
 for raw in SOURCE["words"]:
  word=raw["word"]; meaning=meanings[word]; analysis=ANALYSES[word]; prefix=next(p["surfaceText"] for p in analysis["parts"] if p["kind"]=="prefix")
  band=bands.get(word) or existing.get(word)
  if not band or meaning["base_meaning_review_status"]!="approved_for_guided_review" or raw["dictation"]["sentence"]!=meaning["approved_dictation_audio_text"]: raise SystemExit(f"Blocked {word}: incomplete approved input")
  words.append({"wordKey":raw["wordKey"],"word":word,"microSkillKey":raw["microSkillKey"],"canonical":{"dialect":"en-GB","frequencyBand":band.get("candidate_frequency_band",band.get("frequency_band")),"ageBand":age_band(raw["teachingAge"]),"complexityBand": {"1":"low","2":"medium","3":"high"}[str(band.get("complexity_preview_level",band.get("complexity_level")))]},"trueMorphology":{"humanApprovedText":raw["humanApprovedTrueMorphology"],"orderedParts":analysis["parts"],"joins":analysis["joins"],"transformationNotes":raw["transformationNotes"],"provenance":analysis["source"]},"teaching":{"splitParts":raw["teachingSplitParts"],"splitJoins":analysis["joins"],"prefixVariant":prefix,"cleaverBoundary":next(p["displayRange"]["end"] for p in raw["teachingSplitParts"] if p["kind"]=="prefix"),"baseOrRoot":meaning["approved_base_or_root"],"baseMeaning":meaning["approved_base_meaning"],"childFriendlyMeaning":meaning["approved_child_meaning"],"meaningBin":bin_for(raw["microSkillKey"],prefix)},"pronunciation":raw["pronunciation"],"complexityPreview":raw["complexityPreview"],"dictation":raw["dictation"],"reviews":{"status":"approved_for_guided_review"}})
 package={"packageKey":"adle_d4_dynamic_prefix_reviewed_staging_2026_07_22","activation":{"production":False,"createsLearningItems":False,"createsAssignments":False},"sources":SOURCE["sources"],"profiles":PROFILES,"words":words}
 text=json.dumps(package,indent=2)+"\n"; (OUT/"reviewed-staging-package.json").write_text(text); (OUT/"reviewed-staging-package.sha256").write_text(hashlib.sha256(text.encode()).hexdigest()+"\n")
 print(json.dumps({"words":len(words),"profiles":len(PROFILES),"sha256":hashlib.sha256(text.encode()).hexdigest()}))
if __name__ == "__main__": main()
