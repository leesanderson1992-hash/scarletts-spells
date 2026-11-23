import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
const folder='outputs/dictionary-spoken-divisions-audio-20261123';
const audit=JSON.parse(fs.readFileSync(folder+'/audio-audit.json','utf8'));
const primary=JSON.parse(fs.readFileSync(folder+'/generated-coverage.json','utf8'));
const timed=JSON.parse(fs.readFileSync(folder+'/timed-generated/manifest.json','utf8'));
assert.equal(primary.length,2234);assert.equal(timed.length,79);
const approved=new Map();
for(const row of primary)if(['complete_text_match','complete_phonetic_match'].includes(row.coverageStatus))approved.set(row.key,{...row,sourceFolder:'generated'});
for(const row of timed){assert.equal(row.coverageStatus,'complete_word_timing');approved.set(row.key,{...row,sourceFolder:'timed-generated'});}
assert.equal(approved.size,2245);
const publicRoot='/audio/teaching-dictionary/google-en-gb-sentences-20261123';const assets=[];
for(const row of approved.values()){
 const bytes=fs.readFileSync(path.join(folder,row.sourceFolder,row.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 assert.equal(createHash('sha256').update(row.text).digest('hex'),row.key);
 const src=`${publicRoot}/${row.key.slice(0,20)}-${row.sha256.slice(0,16)}.mp3`;
 fs.mkdirSync(path.dirname('public'+src),{recursive:true});fs.writeFileSync('public'+src,bytes);
 assets.push({...row,src,sourceFolder:undefined});row.src=src;
}
const entries=audit.entries.flatMap(row=>{const asset=approved.get(row.textSha256);return asset?[{id:row.id,word:row.word,senseId:row.senseId,text:row.text,src:asset.src,sha256:asset.sha256,voice:asset.voice,coverageStatus:asset.coverageStatus,releaseStatus:'verified_complete_sentence'}]:[];});
assert.equal(entries.length,2290);assert.equal(audit.entries.length-entries.length,216);
const output='content/teaching-dictionary/audio/google-en-gb-sentences-20261123';fs.mkdirSync(output,{recursive:true});
const manifest={date:'2026-11-23',language:'en-GB',voices:[...new Set(assets.map(row=>row.voice))],project:'project-c4d95cbc-0b4a-4aa3-938',authority:'Owner requested British recordings for every Teaching Dictionary entry, complete sentences checked; authorised Sanderson Estates Google account.',assets,entries,exceptions:audit.blocked};
fs.writeFileSync(output+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
const report={assets:assets.length,newOrReplacementEntryRecordings:entries.length,existingVerifiedRecordings:216,totalApprovedSentenceRecordsCovered:audit.entries.length,transcriptionVerifiedAssets:assets.filter(row=>row.coverageStatus!=='complete_word_timing').length,wordTimedAssets:timed.length,mp3Bytes:assets.reduce((n,row)=>n+row.bytes,0),exceptions:audit.blocked};
fs.writeFileSync(folder+'/audio-release-package.json',JSON.stringify(report,null,2));console.log(report);
