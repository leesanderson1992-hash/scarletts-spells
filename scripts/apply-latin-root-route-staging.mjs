import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
const env=parseEnv(fs.readFileSync('.env.staging.local','utf8'));
const url=env.SUPABASE_STAGING_DB_URL;assert(new URL(url).username.endsWith('.qkpjbajicacbrphthibk'));
const apply=process.argv.includes('--apply');
const names=fs.readdirSync('supabase/migrations').filter(name=>/^2026112719\d+_latin_root_/.test(name)).sort();
const db=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
try{
 await db.query('begin');await db.query("set local statement_timeout='60s'");
 const results=[];
 for(const name of names){
  const [version,...label]=name.replace(/\.sql$/,'').split('_');
  const installed=await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version]);
  if(installed.rows.length){results.push({name,alreadyInstalled:true});continue;}
  const sql=fs.readFileSync('supabase/migrations/'+name,'utf8');
  console.log({checkingMigration:name});
  await db.query(sql.replace(/^begin;\s*/m,'').replace(/commit;\s*$/,''));
  if(apply)await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,label.join('_'),[sql]]);
  results.push({name,sha256:createHash('sha256').update(sql).digest('hex'),installed:apply});
 }
 await db.query(apply?'commit':'rollback');console.log({environment:'staging',applied:apply,migrations:results});
}catch(error){await db.query('rollback');throw error}finally{await db.end()}
