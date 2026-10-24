#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const root=resolve(import.meta.dirname,"..");
const file=resolve(root,"outputs/homophone-dictionary-family-package-2026-10-24/homophone-new-bound-roots-review.csv");
const sourceHash=createHash("sha256").update(readFileSync(file)).digest("hex");
const parsed=spawnSync("python3",["-c",`import csv,json,sys
print(json.dumps(list(csv.DictReader(open(sys.argv[1],encoding='utf-8-sig',newline='')))))`,file],
  {encoding:"utf8"});
if(parsed.status!==0)throw new Error("ROOT_PACKAGE_PARSE_FAILED");
const roots=JSON.parse(parsed.stdout);
if(roots.length!==2||roots.map(r=>r.root).sort().join(",")!=="fect,ple")
  throw new Error("ROOT_PACKAGE_CHANGED");
const mode=process.argv[2];
if(!["plan","apply","verify"].includes(mode))throw new Error("Use plan, apply or verify");
let connectionString=readFileSync(resolve(root,".env.local"),"utf8").split(/\r?\n/)
  .find(x=>x.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="))?.split("=").slice(1).join("=").trim();
if(!connectionString)throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
connectionString=connectionString.replace(/^['"]|['"]$/g,"");
const target=new URL(connectionString);
if(!target.username.includes("wwohrqtunajrbwxyssjf")||!target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
const db=new pg.Client({connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:12000});
await db.connect();
try{
  await db.query(mode==="apply"?"begin isolation level serializable":"begin read only");
  await db.query("set local lock_timeout='5s'");
  const migration=(await db.query(`select count(*)::int n from supabase_migrations.schema_migrations
    where version='20261024200000'`)).rows[0].n;
  if(migration!==1)throw new Error("ROOT_METADATA_MIGRATION_NOT_VERIFIED");
  for(const r of roots){
    const f=(await db.query(`select family_key,revision,base_lemma,base_kind,review_status
      from public.canonical_teaching_dictionary_lexical_base_families
      where family_key=$1 order by revision desc limit 1`,[r.family_key])).rows[0];
    if(!f||f.base_lemma!==r.root||f.base_kind!=="bound_root"||f.review_status!=="approved")
      throw new Error(`ROOT_FAMILY_CHANGED:${r.root}`);
    const existing=(await db.query(`select * from public.canonical_teaching_dictionary_lexical_root_metadata
      where family_key=$1 and revision=$2`,[r.family_key,f.revision])).rows[0];
    if(mode==="plan"&&existing)throw new Error(`ROOT_METADATA_ALREADY_EXISTS:${r.root}`);
    if(mode==="verify"&&(!existing||existing.pronunciation_ipa!==r.pronunciation_attempt
      ||existing.root_definition!==r.root_definition||existing.root_meaning!==r.root_meaning))
      throw new Error(`ROOT_METADATA_READBACK_FAILED:${r.root}`);
    if(mode==="apply"&&!existing){
      await db.query(`insert into public.canonical_teaching_dictionary_lexical_root_metadata
        (family_key,revision,root_text,root_meaning,root_definition,origin_language,pronunciation_ipa,
          source_reference,approval_reference,reviewed_by,reviewed_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,'Katie Sanderson',now())`,
        [r.family_key,f.revision,r.root,r.root_meaning,r.root_definition,r.origin_language,
          r.pronunciation_attempt,`homophone-new-bound-roots-review.csv:${sourceHash}`,
          "Katie Sanderson approval in Codex chat, 2026-10-24: homophone Teaching Dictionary package"]);
    }
  }
  await db.query(mode==="apply"?"commit":"rollback");
  console.log(JSON.stringify({mode,target:"production",roots:roots.length,sourceHash}));
}catch(error){await db.query("rollback").catch(()=>{});throw error}finally{await db.end()}
