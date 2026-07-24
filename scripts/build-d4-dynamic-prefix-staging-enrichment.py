#!/usr/bin/env python3
"""Build a staging-only Dynamic Prefix pronunciation/complexity candidate.

No database, learning item, assignment, production flag, or released un- data
is modified. British IPA is primary; CMUdict is comparison/fallback evidence.
"""
from __future__ import annotations

import csv, hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment"
IPA_PATH = Path("/tmp/adle-prefix-pronunciation-sources/ipa-dict-en_UK.txt")
CMU_PATH = Path("/tmp/adle-prefix-pronunciation-sources/cmudict.dict")
ANALYSES = ROOT / "data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json"

WORDS = "disagree disappear dishonest dissatisfied misbehave mislead misspell illegal impatient impossible incorrect invisible irregular irresponsible predict preheat preschool preview rebuild replay return interact international subheading submarine subway superhero supermarket".split()
AGES = {w: ("7–9", 8) for w in WORDS}
AGES.update({"dissatisfied": ("8–10", 9), "preschool": ("6–8", 7)})
MORPHOLOGY = {
 "disagree":("Prefix: dis + Base: agree", ""), "disappear":("Prefix: dis + Base: appear", ""), "dishonest":("Prefix: dis + Base: honest", ""),
 "dissatisfied":("Prefix: dis + Base: satisfy + Suffix: ed", "Change final y to i before adding -ed; keep both s letters where dis and satisfy meet."),
 "misbehave":("Prefix: mis + Base: behave", ""), "mislead":("Prefix: mis + Base: lead", ""), "misspell":("Prefix: mis + Base: spell", "Keep both s letters where mis and spell meet."),
 "illegal":("Prefix: il + Base: legal", "in- becomes il- before l."), "impatient":("Prefix: im + Base: patient", "in- becomes im- before p."),
 "impossible":("Prefix: im + Base: possible", "in- becomes im- before p."), "incorrect":("Prefix: in + Base: correct", ""),
 "invisible":("Prefix: in + Root: vis + Suffix: ible", "-ible attaches to the bound root vis."), "irregular":("Prefix: ir + Base: regular", "in- becomes ir- before r."),
 "irresponsible":("Prefix: ir + Root: respons + Suffix: ible", "in- becomes ir- before r; -ible attaches to the bound root respons."),
 "predict":("Prefix: pre + Root: dict", "dict is a bound root meaning say."), "preheat":("Prefix: pre + Base: heat", ""), "preschool":("Prefix: pre + Base: school", ""),
 "preview":("Prefix: pre + Base: view", ""), "rebuild":("Prefix: re + Base: build", ""), "replay":("Prefix: re + Base: play", ""), "return":("Prefix: re + Base: turn", ""),
 "interact":("Prefix: inter + Base: act", ""), "international":("Prefix: inter + Base: nation + Suffix: al", ""), "subheading":("Prefix: sub + Base: head + Suffix: ing", ""),
 "submarine":("Prefix: sub + Base: marine", ""), "subway":("Prefix: sub + Base: way", ""), "superhero":("Prefix: super + Base: hero", ""), "supermarket":("Prefix: super + Base: market", ""),
}
SENTENCES = {
 "disagree":"They disagree about the game.","disappear":"The rabbit can disappear behind the hedge.","dishonest":"It is dishonest to tell a lie.","dissatisfied":"She felt dissatisfied with the untidy work.","misbehave":"Do not misbehave in the library.","mislead":"The sign did not mean to mislead us.","misspell":"Check that you do not misspell the word.",
 "illegal":"Parking there is illegal.","impatient":"He grew impatient in the long queue.","impossible":"It is impossible to be in two places at once.","incorrect":"The answer is incorrect.","invisible":"The tiny insect was almost invisible.","irregular":"The shape has an irregular edge.","irresponsible":"It is irresponsible to leave litter behind.",
 "predict":"Can you predict tomorrow’s weather?","preheat":"Please preheat the oven first.","preschool":"Her brother goes to preschool.","preview":"We watched a preview of the film.","rebuild":"Workers will rebuild the wall.","replay":"Please replay that part of the song.","return":"Please return the book tomorrow.",
 "interact":"The children interact during the game.","international":"The airport has international flights.","subheading":"Write a subheading for the next section.","submarine":"The submarine moved under the waves.","subway":"We took the subway across the city.","superhero":"The superhero saved the town.","supermarket":"We bought fruit at the supermarket.",
}
# Owner-approved UK IPA where the historic source was absent or unsuitable for
# this reviewed prefix package. These overrides are explicit provenance, not a
# silent fallback or a change to the source priority for other words.
HUMAN_APPROVED_IPA = {"replay": "/ˌriːˈpleɪ/", "return": "/rɪˈtɜːn/", "subheading": "/ˈsʌbˌhedɪŋ/"}
VOWELS=set("aeiouɑɒæɐəɜɞʌɔɪʊɛɚɝɨʉɯɵøœɘɤɶ")

def sha(path: Path) -> str: return hashlib.sha256(path.read_bytes()).hexdigest()
def ipa_map():
    found={}
    for line in IPA_PATH.read_text().splitlines():
        if "\t" in line:
            word, ipa=line.split("\t",1); found.setdefault(word.lower(),[]).append(ipa.strip())
    return found
def cmu_map():
    found={}
    for line in CMU_PATH.read_text().splitlines():
        if not line or line.startswith(";;;"): continue
        word, *phones=line.lower().split()
        word=re.sub(r"\(\d+\)$", "", word); found.setdefault(word,[]).append(" ".join(phones).upper())
    return found
def ipa_clean(ipa): return re.sub(r"[\/\[\]\(\)ːˑ]", "", ipa)
def syllables(ipa): return max(1, len([c for c in re.findall(r"["+"".join(VOWELS)+r"]+", ipa_clean(ipa))])) if ipa else 0
def stress(ipa):
    n=syllables(ipa)
    if n == 1: return "single_syllable_unmarked" if "ˈ" not in ipa else "primary"
    before=ipa_clean(ipa).find("ˈ"); index=1
    if before >= 0: index=1+sum(c in VOWELS for c in ipa_clean(ipa)[:before])
    return "-".join("primary" if i==index else "unstressed" for i in range(1,n+1))
def ipa_primary(ipa):
    marker=ipa_clean(ipa).find("ˈ")
    return 0 if marker < 0 else 1+sum(c in VOWELS for c in ipa_clean(ipa)[:marker])
def cmu_details(value):
    vowels=[token for token in value.split() if re.match(r"[A-Z]+[012]$", token)]
    primary=next((i for i, token in enumerate(vowels, 1) if token.endswith("1")), 0)
    # This is the same weak-vowel comparison purpose as the historic pipeline:
    # retain an unsafe result if it disagrees rather than silently accepting it.
    schwa=any(token in {"AH0", "ER0"} for token in vowels)
    return len(vowels), primary, schwa
def phonemes(ipa):
    text=ipa_clean(ipa).replace(" ",""); multi=("aʊ","əʊ","eɪ","aɪ","ɔɪ","ɪə","eə","ʊə","tʃ","dʒ","iː","uː","ɑː","ɔː","ɜː")
    n=i=0
    while i<len(text):
        hit=next((x for x in multi if text.startswith(x,i)),None); n+=1; i+=len(hit) if hit else 1
    return n
def parts_count(morph): return morph.count(" + ")+1
def irregularity(note):
    note=note.lower()
    return 1 if any(x in note for x in ("becomes", "change final", "keep both")) else 0
def level(score): return 1 if score<=1 else 2 if score<=5 else 3

def main():
    if not IPA_PATH.exists() or not CMU_PATH.exists(): raise SystemExit("Historic source snapshots missing from /tmp/adle-prefix-pronunciation-sources")
    ipa, cmu=ipa_map(), cmu_map()
    analyses={a["displayWord"]:a for a in json.loads(ANALYSES.read_text())["wordAnalyses"] if a.get("displayWord") in WORDS and a.get("microSkillKey","").startswith("D4_MOR_PREFIXES_")}
    output=[]
    for word in WORDS:
        variants=ipa.get(word,[]); british=variants[0] if len(variants)==1 else ""; cmu_variants=cmu.get(word,[]); cmu_value=cmu_variants[0] if cmu_variants else ""
        override=HUMAN_APPROVED_IPA.get(word, "")
        if override: british=override
        ipa_syll=syllables(british); cmu_syll, cmu_primary, cmu_schwa=cmu_details(cmu_value) if cmu_value else (0,0,False)
        british_schwa=bool(british and ("ə" in british or "ɐ" in british))
        primary_agrees=(ipa_syll==1 and cmu_syll==1) or ipa_primary(british)==cmu_primary
        safe=bool(override or (british and cmu_value and ipa_syll==cmu_syll and british_schwa==cmu_schwa and primary_agrees and len(variants)==1 and len(cmu_variants)==1))
        source="human_approved_uk_ipa" if override else "british_ipa" if british else "cmudict_fallback" if cmu_value else "missing"
        selected=british or cmu_value
        morph, note=MORPHOLOGY[word]; letters=len(word); count=phonemes(british) if british else len(cmu_value.split()) if cmu_value else 0
        schwa=british_schwa; depth=parts_count(morph); irr=irregularity(note)
        score=(1 if ipa_syll==2 else 2 if ipa_syll==3 else 3 if ipa_syll>=4 else 0)+(0 if letters<=4 else 1 if letters<=6 else 2 if letters<=8 else 3)+(2 if irr else 0)+(0 if depth==1 else 1 if depth==2 else 2)+(1 if schwa else 0)+(1 if count and letters-count>=3 else 0)
        target_index=re.sub(r"[“”.,!?]","",SENTENCES[word]).lower().split().index(word)
        output.append({"wordKey":word+"_en_gb","word":word,"microSkillKey":analyses[word]["microSkillKey"],"teachingSplitParts":analyses[word]["parts"],"humanApprovedTrueMorphology":morph,"transformationNotes":note,"teachingAgeRange":AGES[word][0],"teachingAge":AGES[word][1],"dictation":{"sentence":SENTENCES[word],"targetTokenIndex":target_index,"audioText":SENTENCES[word]},"pronunciation":{"source":source,"ipa":british,"cmu":cmu_value,"ipaVariantCount":len(variants),"syllables":ipa_syll or cmu_syll,"stressPattern":stress(british) if british else "","hasSchwa":schwa,"phonemeCount":count,"approvalSafety":"safe_to_approve_candidate" if safe else "in_review"},"complexityPreview":{"version":"banding_v1.1_2026-07-04.preview","inputComplete":bool(selected and count and (ipa_syll or cmu_syll)),"letterCount":letters,"morphologyDepth":depth,"irregularityBand":irr,"structuralScore":score,"complexityLevel":level(score),"status":"preview_only"},"reviewStatus":"in_review" if not safe else "approved_for_guided_review","stagingActivation":"blocked_until_all_fields_are_approved"})
    OUT.mkdir(parents=True,exist_ok=True)
    package={"packageKey":"adle_d4_dynamic_prefix_staging_enrichment_2026_07_22","activation":{"production":False,"createsLearningItems":False,"createsAssignments":False},"sources":{"britishIpa":{"url":"https://github.com/open-dict-data/ipa-dict/blob/master/data/en_UK.txt","sha256":sha(IPA_PATH)},"cmuDict":{"url":"https://github.com/cmusphinx/cmudict","sha256":sha(CMU_PATH)},"humanApprovals":"Dynamic Prefix profile review and owner-approved morphology/teaching ages"},"words":output}
    (OUT/"staging-import-candidate.json").write_text(json.dumps(package,indent=2)+"\n")
    with (OUT/"pronunciation-complexity-audit.csv").open("w",newline="") as f:
        w=csv.DictWriter(f,fieldnames=["word","source","ipa","cmu","ipaVariantCount","syllables","phonemeCount","approvalSafety","structuralScore","complexityLevel","reviewStatus","stagingActivation"]);w.writeheader()
        for row in output:w.writerow({"word":row["word"],"source":row["pronunciation"]["source"],"ipa":row["pronunciation"]["ipa"],"cmu":row["pronunciation"]["cmu"],"ipaVariantCount":row["pronunciation"]["ipaVariantCount"],"syllables":row["pronunciation"]["syllables"],"phonemeCount":row["pronunciation"]["phonemeCount"],"approvalSafety":row["pronunciation"]["approvalSafety"],"structuralScore":row["complexityPreview"]["structuralScore"],"complexityLevel":row["complexityPreview"]["complexityLevel"],"reviewStatus":row["reviewStatus"],"stagingActivation":row["stagingActivation"]})
    print(json.dumps({"rows":len(output),"safe":sum(x["pronunciation"]["approvalSafety"]=="safe_to_approve_candidate" for x in output),"out":str(OUT)}))
if __name__ == "__main__": main()
