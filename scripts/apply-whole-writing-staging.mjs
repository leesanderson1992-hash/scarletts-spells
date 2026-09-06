import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REF = "jlhotktspjvffslvuyfz";
const FILES = [
  "20260906100000_add_writing_shadow_capture.sql",
  "20260906110000_add_whole_writing_occurrences.sql",
  "20260906120000_add_reviewed_word_skill_publications.sql",
  "20260906130000_add_writing_shadow_health.sql",
];
const cli = process.env.WRITING_PROOF_SUPABASE_CLI;
assert.ok(cli,"WRITING_PROOF_SUPABASE_CLI is required");
const root = await mkdtemp(join(tmpdir(),"writing-staging-migrations-"));
async function query(sql) {
  const file=join(root,"query.sql"); await writeFile(file,sql,{mode:0o600});
  const {stdout}=await promisify(execFile)(cli,["db","query","--linked","--project-ref",REF,"--output","json","--file",file],{timeout:60000,maxBuffer:4*1024*1024});
  const result=JSON.parse(stdout.slice(stdout.indexOf("{"),stdout.lastIndexOf("}")+1));
  assert.ok(Array.isArray(result.rows),"SQL response missing rows"); return result.rows;
}
try {
  const files=await Promise.all(FILES.map(async(name)=>{
    const sql=await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8");
    assert.ok(!sql.includes("$writing_migration$"));
    return {name,sql,version:name.slice(0,14),sha256:createHash("sha256").update(sql).digest("hex")};
  }));
  const versions=files.map(f=>`'${f.version}'`).join(",");
  const before=await query(`select version,name from supabase_migrations.schema_migrations where version in (${versions}) order by version;`);
  if (before.length) {
    assert.equal(before.length,4,"Partial migration state requires reconciliation");
    console.log(JSON.stringify({status:"already_applied",project:REF,versions:before}));
  } else if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({status:"ready",project:REF,files:files.map(({name,sha256})=>({name,sha256}))}));
  } else {
    const sql="begin; set local lock_timeout='5s'; set local statement_timeout='45s';\n"+
      "do $$ begin if to_regclass('public.writing_source_snapshots') is not null then raise exception 'unledgered_writing_schema'; end if; end $$;\n"+
      files.map(f=>f.sql+`\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${f.version}','${f.name.slice(15,-4)}',array[$writing_migration$${f.sql}$writing_migration$]);`).join("\n")+
      "\nnotify pgrst,'reload schema'; commit;\n"+
      `select version,name from supabase_migrations.schema_migrations where version in (${versions}) order by version;`;
    const applied=await query(sql);
    assert.equal(applied.length,4);
    console.log(JSON.stringify({status:"applied",project:REF,files:files.map(({name,sha256})=>({name,sha256})),versions:applied}));
  }
} finally {await rm(root,{recursive:true,force:true});}
