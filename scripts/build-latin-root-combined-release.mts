import fs from 'node:fs';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';import pg from 'pg';
import {buildLatinRootReleasePackage} from '../lib/adle/morphology/latin-root-release';
import {latinRootWordBlocker,type CanonicalLatinRootFamily,type CanonicalLatinRootWord} from '../lib/adle/morphology/latin-root-canonical';
const e=parseEnv(fs.readFileSync('.env.staging.local','utf8'));assert.equal(e.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');const d=new pg.Client({connectionString:e.SUPABASE_STAGING_DB_URL,ssl:{rejectUnauthorized:false}});await d.connect();
try{const keys=(await d.query("select family_key from teaching_dictionary_root_skill_families where micro_skill_key='D4_MOR_ROOTS_COMMON_LATIN_ROOTS'")).rows.map(r=>r.family_key);
 const facts=(await d.query('select adle_latin_root_dictionary_v1($1) facts',[keys])).rows[0].facts as {families:CanonicalLatinRootFamily[];words:CanonicalLatinRootWord[]};
 const families=facts.families.filter(family=>facts.words.filter(word=>word.familyKey===family.familyKey&&!latinRootWordBlocker(word,family)).length>=2);
 // Publish whole current family projections; incomplete facts need review,
 // rather than being silently dropped from a family's immutable closure.
 const words=facts.words.filter(word=>families.some(f=>f.familyKey===word.familyKey));
 const pkg=buildLatinRootReleasePackage({releaseKey:'latin_roots_combined_v2_2026_11_27',approvalRefs:['Owner requested combining root families into lessons of up to six words, 2026-11-27. Existing reviewed dictionary facts only.'],families,words});
 const dir='outputs/latin-root-multi-family-20261127/';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'staging-release.json',JSON.stringify(pkg,null,2));console.log({families:families.map(f=>f.root),words:words.length,activation:'inactive'});
}finally{await d.end()}
