import fs from 'node:fs';import pg from 'pg';import{parseEnv}from'node:util';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const environment=process.argv[2],apply=process.argv.includes('--apply');assert(['staging','production'].includes(environment));
const e=parseEnv(fs.readFileSync(environment==='staging'?'.env.staging.local':'.env.local','utf8'));
const url=environment==='staging'?e.SUPABASE_STAGING_DB_URL:e.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
assert(new URL(url).username.includes(environment==='staging'?'qkpjbajicacbrphthibk':'wwohrqtunajrbwxyssjf'));
const reviewed=process.argv.includes('--reviewed');
const version=reviewed?'20261127171000':'20261127170000',name=reviewed?'reviewed_root_language_assignments':'root_language_micro_skills';
const sql=fs.readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8'),hash=createHash('sha256').update(sql).digest('hex');
const db=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});await db.connect();try{await db.query('begin');await db.query("set local lock_timeout='5s'");
const existing=(await db.query('select * from supabase_migrations.schema_migrations where version=$1',[version])).rows[0];
if(existing){assert.equal(existing.name,name);assert.equal(createHash('sha256').update(existing.statements.join('')).digest('hex'),hash);}else{
const checks=(await db.query("select to_regclass('public.teaching_dictionary_lexical_family_successions') successor,to_regclass('public.teaching_dictionary_current_sense_morphology') morphology")).rows[0];assert(checks.successor&&checks.morphology);
await db.query(sql.replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,''));await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,name,[sql]]);}
await db.query(apply?'commit':'rollback');const report={environment,applied:apply,alreadyPresent:!!existing,version,sha256:hash};fs.writeFileSync(`outputs/root-micro-skills-20261127/${environment}-${version}-migration${apply?'':'-rollback'}.json`,JSON.stringify(report,null,2));console.log(report);
}catch(error){await db.query('rollback');throw error;}finally{await db.end()}
