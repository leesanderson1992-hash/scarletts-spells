#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- deterministic reviewed JSON fixtures */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  fingerprintAdleCurriculumReleaseManifest,
  validateAdleCurriculumReleaseManifestV2,
  validateAdleTeachingDictionaryClosureManifestV1,
  validateAdleTeachingDictionaryClosureManifestV2,
} from "../lib/adle/curriculum-release-authority";
import { loadCanonicalPackage } from "./teaching-dictionary-release-contract";

async function main():Promise<void>{
const ROOT=resolve(import.meta.dirname,"..");
const ROUTE=resolve(ROOT,"docs/implementation/seed-data/teaching-dictionary/releases/2026-08-11-compound-word-v2-route-releases");
const CANONICAL=resolve(ROOT,"docs/implementation/seed-data/teaching-dictionary/releases/2026-08-11-compound-word-v2-canonical-v1");
const parse=(name:string)=>JSON.parse(readFileSync(resolve(ROUTE,name),"utf8"));

const structure=parse("compound-structure-authority.json");
const closure=parse("teaching-dictionary-closure-v2.json");
const bindings=parse("source-bindings.json");
const releases=[parse("route-release-closed.json"),parse("route-release-separated-hyphenated.json")];
assert.equal(structure.structures.length,14);
assert.equal(closure.words.length,41);
assert.equal(bindings.length,41);
assert.equal(validateAdleTeachingDictionaryClosureManifestV2(closure).valid,true);
for(const release of releases){assert.equal(validateAdleCurriculumReleaseManifestV2(release).valid,true);assert.equal(release.route.activationRouteKey,"compound_word_lab:v2");assert.deepEqual(release.microSkills[0].dependencies.map((item:any)=>item.authorityType),["compound_structure","teaching_content","teaching_dictionary_closure"]);assert.match(fingerprintAdleCurriculumReleaseManifest(release).releaseManifestSha256,/^[a-f0-9]{64}$/)}

const byWord=new Map<string,any>(structure.structures.map((item:any)=>[item.displayForm,item]));
for(const [word,parts,joins] of [
  ["sunflower",["sun","flower"],["none"]],
  ["ice cream",["ice","cream"],["space"]],
  ["twenty-one",["twenty","one"],["hyphen"]],
  ["mother-in-law",["mother","in","law"],["hyphen","hyphen"]],
] as const){const item:any=byWord.get(word);assert.ok(item);assert.deepEqual(item.components.map((part:any)=>part.displaySurface),parts);assert.deepEqual(item.joins,joins);assert.ok(item.components.every((part:any)=>part.canonicalWordId));assert.equal(item.dictation.exactGovernedAnswer,word)}
assert.match(byWord.get("grandmother")!.componentToWholeRelationship,/one generation further back/);
assert.match(byWord.get("mother-in-law")!.componentToWholeRelationship,/fixed expression/);
assert.match(byWord.get("well-known")!.components[0].meaning,/high degree/);
assert.equal(parse("carry-forward-audit.json").rows.length,3);

const legacy={schemaVersion:1,authorityKey:"legacy",approvalRefs:["approved"],capabilities:["canonical_word_identity_display","canonical_dictation"],words:[{wordKey:"sun_en_gb",normalisedWord:"sun",displayWord:"sun",dialectCode:"en-GB",dictationSentence:"The sun shines.",dictationTargetTokenIndex:1,audioText:"The sun shines."}]};
assert.equal(validateAdleTeachingDictionaryClosureManifestV1(legacy).valid,true,"closure v1 remains compatible");

const pkg=await loadCanonicalPackage(CANONICAL);
assert.equal(pkg.manifest.workbookSha256,"4d59997206c4faf5c05eac37f9c4dd23d5581d3600327a7a8d0ef758b4c1338f");
assert.equal(pkg.manifest.rowCounts.words,17);
assert.equal(pkg.csv["dictation_sentences.csv"].filter(row=>row.display_word.includes(" ")).every(row=>Number(row.dictation_target_end_exclusive)-Number(row.dictation_target_token_index)===2),true);

const migration=readFileSync(resolve(ROOT,"supabase/migrations/20260811210000_publish_compound_word_v2_release_authority.sql"),"utf8");
for(const token of ["compound_structure","publish_adle_compound_word_structure_authority_v1","publish_adle_teaching_dictionary_closure_v2","compound_word_lab:v2","prevent_adle_release_authority_mutation"])assert.match(migration,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
for(const forbidden of ["insert into public.adle_route_activation_revisions","insert into public.adle_learning_items","insert into public.daily_assignments"])assert.equal(migration.includes(forbidden),false);

const compatibilityMigration=readFileSync(resolve(ROOT,"supabase/migrations/20260811211000_allow_governed_compound_dictation_projection.sql"),"utf8");
for(const exactAuthority of ["adle_closed_compound_production_profile_v1","data/adle/candidates/d4-mor-remaining-profiles/v1/closed-compounds-dictionary-pool-review.json","841f13b525f6be22274ad3fa0b40957e43f9fadae72ecc873003c38b32096547"])assert.match(compatibilityMigration,new RegExp(exactAuthority.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
assert.equal(compatibilityMigration.includes("v_dict_batch.batch_status = 'validated'"),true);
for(const forbidden of ["insert into public.adle_route_activation_revisions","insert into public.adle_learning_items","insert into public.daily_assignments","update public.teaching_dictionary_dictation_sentences"])assert.equal(compatibilityMigration.includes(forbidden),false);

const fingerprintMigration=readFileSync(resolve(ROOT,"supabase/migrations/20260811212000_stabilize_compound_structure_fingerprint.sql"),"utf8");
for(const token of ['collate "C"',"adle_snapshot_json_sha256_v1","publish_adle_compound_word_structure_authority_v1"])assert.match(fingerprintMigration,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
for(const forbidden of ["insert into public.adle_route_activation_revisions","insert into public.adle_learning_items","insert into public.daily_assignments"])assert.equal(fingerprintMigration.includes(forbidden),false);

console.log(JSON.stringify({status:"passed",approvedStructures:14,newCanonicalWords:17,closureWords:41,routeReleases:2,v1Compatible:true,productionDark:true},null,2));
}

void main();
