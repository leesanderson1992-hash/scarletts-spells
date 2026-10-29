#!/usr/bin/env node
/** Create two disposable staging children so each lesson has one open session. */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import pg from "pg";
process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
const parent = process.env.STAGING_ADMIN_USER_ID;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com") ||
  !/^[a-f0-9-]{36}$/i.test(parent ?? "")) throw Error("SCHWA_STAGING_TARGET_MISMATCH");
const path = ".tmp/schwa-initial-a-medial-natural-staging/children.json";
const state = existsSync(path) ? JSON.parse(readFileSync(path,"utf8")) :
  { initialA: randomUUID(), medial: randomUUID(), parentUserId: parent };
if (state.parentUserId !== parent || state.initialA === state.medial) throw Error("SCHWA_DISPOSABLE_CHILD_STATE_INVALID");
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString:url, ssl:{rejectUnauthorized:false} });
await db.connect();
try {
  await db.query("begin");
  for (const [key,name] of [["initialA","Initial A Proof"],["medial","Medial Natural Proof"]]) {
    const existing = await db.query("select parent_user_id,first_name from public.children where id=$1",[state[key]]);
    if (existing.rowCount && (existing.rows[0].parent_user_id !== parent || existing.rows[0].first_name !== name))
      throw Error(`SCHWA_DISPOSABLE_CHILD_ID_CONFLICT:${key}`);
    if (!existing.rowCount) await db.query(`insert into public.children(id,parent_user_id,first_name,notes)
      values($1,$2,$3,'Disposable Schwa staging proof 2026-10-29')`,[state[key],parent,name]);
  }
  if (apply) await db.query("commit"); else await db.query("rollback");
  if (apply) { mkdirSync(".tmp/schwa-initial-a-medial-natural-staging",{recursive:true});
    writeFileSync(path,JSON.stringify(state,null,2)); }
  console.log(JSON.stringify({environment:"staging",mode:apply?"created":"rollback_proof",children:state}));
} catch(error) { await db.query("rollback").catch(()=>undefined); throw error; }
finally { await db.end(); }
