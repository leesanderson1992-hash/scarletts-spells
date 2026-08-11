#!/usr/bin/env node
/* Governed CW-3B-1 schema/curriculum/release publication. No activation path exists here. */
/* eslint-disable @typescript-eslint/no-explicit-any -- immutable artifacts and PostgreSQL rows are runtime-validated */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

import {
  fingerprintAdleCurriculumReleaseManifest,
  teachingDictionaryClosureV2SemanticProjection,
  validateAdleCurriculumReleaseManifestV2,
  validateAdleTeachingDictionaryClosureManifestV2,
} from "../lib/adle/curriculum-release-authority";

const ROOT=execFileSync("git",["rev-parse","--show-toplevel"],{encoding:"utf8"}).trim();
const DIR=resolve(ROOT,"docs/implementation/seed-data/teaching-dictionary/releases/2026-08-11-compound-word-v2-route-releases");
const MIGRATIONS=["20260811130000_add_general_compound_word_structure_v2.sql","20260811210000_publish_compound_word_v2_release_authority.sql"] as const;
const SKILLS=["D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS","D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED"] as const;
const PUBLISHED_BY="Katie Sanderson / Codex governed CW-3B-1";
const PROJECT_REF="wwohrqtunajrbwxyssjf";
const LOCK_KEY="compound_word_v2_2026_08_11";
const MIGRATE_CONFIRMATION="migrate:compound-word-v2:CW-1+CW-3B-1:production";
const PUBLISH_CONFIRMATION="publish:compound-word-v2:approved-14:production-dark";

function fail(message:string):never{throw new Error(message)}
function parse(name:string):any{return JSON.parse(readFileSync(resolve(DIR,name),"utf8"))}
function sha(value:string|Buffer):string{return createHash("sha256").update(value).digest("hex")}
function fileSha(path:string):string{return sha(readFileSync(path))}
function canonical(value:any):string{if(value===null||value===undefined)return"null";if(typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;return`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>`${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`}
function arg(flag:string):string|undefined{const index=process.argv.indexOf(flag);return index<0?undefined:process.argv[index+1]}
function git(...args:string[]):string{return execFileSync("git",args,{cwd:ROOT,encoding:"utf8"}).trim()}
function assertMain():string{const head=git("rev-parse","HEAD"),main=git("rev-parse","origin/main");if(head!==main)fail(`exact merged main required: ${head} != ${main}`);if(git("status","--porcelain"))fail("clean worktree required");return head}
function databaseUrl():string{const value=process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED??process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION??process.env.SUPABASE_PRODUCTION_DB_URL;if(!value)fail("governed Production database URL required");const parsed=new URL(value);if(!parsed.hostname.includes(PROJECT_REF)&&!decodeURIComponent(parsed.username).includes(PROJECT_REF))fail("database is not Production");return value}
async function client<T>(fn:(db:pg.Client)=>Promise<T>):Promise<T>{const db=new pg.Client({connectionString:databaseUrl(),ssl:{rejectUnauthorized:false}});await db.connect();try{return await fn(db)}finally{await db.end()}}

function load(){const structure=parse("compound-structure-authority.json"),closure=parse("teaching-dictionary-closure-v2.json"),bindings=parse("source-bindings.json"),contents=[parse("teaching-content-closed.json"),parse("teaching-content-separated-hyphenated.json")],releases=[parse("route-release-closed.json"),parse("route-release-separated-hyphenated.json")];const closureValidation=validateAdleTeachingDictionaryClosureManifestV2(closure);if(!closureValidation.valid)fail(closureValidation.errors.join(","));for(const release of releases){const validation=validateAdleCurriculumReleaseManifestV2(release);if(!validation.valid)fail(validation.errors.join(","))}if(structure.structures.length!==14||closure.words.length!==41||bindings.length!==41||contents.length!==2||releases.length!==2)fail("package cardinality mismatch");return{structure,closure,bindings,contents,releases}}

async function protectedSnapshot(db:pg.Client):Promise<any>{const q=await db.query(`select
 (select count(*)::int from public.adle_route_activation_revisions r join public.adle_curriculum_release_manifests m on m.id=r.release_manifest_id where m.route_id='compound_word_lab') activation_revisions,
 (select count(*)::int from public.adle_route_activation_heads h join public.adle_curriculum_release_manifests m on m.id=h.release_manifest_id where m.route_id='compound_word_lab') activation_heads,
 (select count(*)::int from public.adle_learning_items where micro_skill_key=any($1::text[])) learning_items,
 (select count(*)::int from public.daily_assignments where lesson_route_id='compound_word_lab' and lesson_route_version='v2') v2_assignments,
 (select count(*)::int from public.adle_canonical_intake_candidates where micro_skill_key=any($1::text[])) intake_candidates`,[SKILLS]);return q.rows[0]}

async function migrate():Promise<any>{const mainSha=assertMain();if(arg("--confirm")!==MIGRATE_CONFIRMATION)fail(`exact confirmation required: ${MIGRATE_CONFIRMATION}`);return client(async db=>{const receipts=[];for(const name of MIGRATIONS){const version=name.slice(0,14),path=resolve(ROOT,"supabase/migrations",name),sql=readFileSync(path,"utf8"),migrationSha256=fileSha(path);const present=await db.query("select 1 from supabase_migrations.schema_migrations where version=$1",[version]);if(present.rowCount){receipts.push({version,migrationSha256,status:"already_applied"});continue}await db.query(sql);await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",[version,name.replace(`${version}_`,"").replace(/\.sql$/, ""),[sql]]);receipts.push({version,migrationSha256,status:"applied"})}return{status:"migrated",mainSha,receipts}})}

async function plan(accepted=load()):Promise<any>{return client(async db=>{const ledger=await db.query("select version from supabase_migrations.schema_migrations where version=any($1::text[]) order by version",[MIGRATIONS.map(name=>name.slice(0,14))]);if(ledger.rowCount!==2)fail("CW-1/CW-3B-1 migrations are not both applied");const before=await protectedSnapshot(db);if(before.activation_revisions!==0||before.activation_heads!==0||before.learning_items!==0||before.v2_assignments!==0)fail("Compound Word is not Production-dark");const authorities=await db.query("select id,authority_type,authority_key,semantic_fingerprint from public.adle_curriculum_dependency_authorities where authority_key=any($1::text[]) order by authority_type,authority_key",[[accepted.structure.authorityKey,accepted.closure.authorityKey,...accepted.contents.map((v:any)=>v.authorityKey)]]);const releases=await db.query("select id,release_key,release_manifest_sha256,dependency_fingerprint from public.adle_curriculum_release_manifests where release_key=any($1::text[]) order by release_key",[accepted.releases.map((v:any)=>v.releaseKey)]);if(![0,4].includes(authorities.rowCount??-1)||![0,2].includes(releases.rowCount??-1))fail("partial or conflicting Compound release authority exists");const projection={status:releases.rowCount===2?"already_published":"ready",protectedState:before,authorityRows:authorities.rows,releaseRows:releases.rows,migrationVersions:ledger.rows.map(row=>row.version)};return{...projection,planSha256:sha(canonical(projection))}})}

async function publish():Promise<any>{const mainSha=assertMain();if(arg("--confirm")!==PUBLISH_CONFIRMATION)fail(`exact confirmation required: ${PUBLISH_CONFIRMATION}`);const expected=arg("--confirm-plan-sha256")??fail("reviewed plan SHA required");const accepted=load();return client(async db=>{await db.query("begin transaction isolation level serializable");try{await db.query("select pg_advisory_xact_lock(hashtext($1))",[LOCK_KEY]);const before=await protectedSnapshot(db);const current=await db.query("select count(*)::int count from public.adle_curriculum_release_manifests where release_key=any($1::text[])",[accepted.releases.map((v:any)=>v.releaseKey)]);const preProjection={status:current.rows[0].count===2?"already_published":"ready",protectedState:before,authorityRows:[],releaseRows:[],migrationVersions:MIGRATIONS.map(name=>name.slice(0,14))};if(current.rows[0].count===0&&sha(canonical(preProjection))===expected){/* fresh compact plan */}else{await db.query("rollback");const exact=await plan(accepted);if(exact.planSha256!==expected)fail("Production plan changed");if(exact.status==="already_published")return{...exact,mutationPerformed:false};await db.query("begin transaction isolation level serializable");await db.query("select pg_advisory_xact_lock(hashtext($1))",[LOCK_KEY])}
 const structure=await db.query("select public.publish_adle_compound_word_structure_authority_v1($1::jsonb,$2,$3) id",[accepted.structure,fileSha(resolve(DIR,"compound-structure-authority.json")),PUBLISHED_BY]);
 const contentReceipts=[];for(const item of accepted.contents){const name=item.microSkillKey.endsWith("CLOSED_COMPOUNDS")?"teaching-content-closed.json":"teaching-content-separated-hyphenated.json";const row=await db.query("select public.publish_adle_teaching_content_authority_v1($1::jsonb,$2,'legacy_pre_release_ledger_projection',$3) id",[item,fileSha(resolve(DIR,name)),PUBLISHED_BY]);contentReceipts.push(row.rows[0].id)}
 const closure=await db.query("select public.publish_adle_teaching_dictionary_closure_v2($1::jsonb,$2,$3::jsonb,$4) id",[accepted.closure,fileSha(resolve(DIR,"teaching-dictionary-closure-v2.json")),accepted.bindings,PUBLISHED_BY]);
 const releaseReceipts=[];for(const item of accepted.releases){const name=item.microSkills[0].microSkillKey.endsWith("CLOSED_COMPOUNDS")?"route-release-closed.json":"route-release-separated-hyphenated.json";const row=await db.query("select public.publish_adle_curriculum_release_v2($1::jsonb,$2,$3) id",[item,fileSha(resolve(DIR,name)),PUBLISHED_BY]);releaseReceipts.push({id:row.rows[0].id,...fingerprintAdleCurriculumReleaseManifest(item)})}
 const after=await protectedSnapshot(db);if(canonical(after)!==canonical(before))fail("publication changed protected learner/activation state");await db.query("commit");return{status:"published",mainSha,structureAuthorityId:structure.rows[0].id,teachingContentAuthorityIds:contentReceipts,closureAuthorityId:closure.rows[0].id,releases:releaseReceipts,protectedState:after,closureSemanticFingerprint:sha(canonical(teachingDictionaryClosureV2SemanticProjection(accepted.closure))),mutationPerformed:true}}catch(error){await db.query("rollback").catch(()=>undefined);throw error}})}

async function verify():Promise<any>{const accepted=load();const result=await plan(accepted);if(result.status!=="already_published")fail("Compound releases not published");const fingerprints=accepted.releases.map((release:any)=>({releaseKey:release.releaseKey,...fingerprintAdleCurriculumReleaseManifest(release)}));return{status:"verified",...result,fingerprints,productionDark:true}}

async function main(){const command=process.argv[2]??"validate";if(command==="validate"){const accepted=load();console.log(JSON.stringify({status:"valid",structures:accepted.structure.structures.length,closureWords:accepted.closure.words.length,releases:accepted.releases.map((release:any)=>({releaseKey:release.releaseKey,...fingerprintAdleCurriculumReleaseManifest(release)}))},null,2));return}if(command==="migrate")console.log(JSON.stringify(await migrate(),null,2));else if(command==="plan")console.log(JSON.stringify(await plan(),null,2));else if(command==="publish")console.log(JSON.stringify(await publish(),null,2));else if(command==="verify")console.log(JSON.stringify(await verify(),null,2));else fail("expected validate, migrate, plan, publish, or verify")}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1});
