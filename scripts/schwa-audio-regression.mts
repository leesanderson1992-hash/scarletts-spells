import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reviewedAudioBlockers } from '../lib/adle/weak-vowel/reviewed-audio';
import { deviceSpeechSource } from '../lib/adle/weak-vowel/audio-source';
// @ts-expect-error Build script is a JavaScript module.
import { buildReviewedAudioManifest } from './build-reviewed-audio-manifest.mjs';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const dir = await mkdtemp(path.join(os.tmpdir(), 'schwa-audio-'));
try {
  await mkdir(path.join(dir,'reviewed'));
  const bytes = Buffer.from('ID3reviewed recording'), src='/audio/reviewed/test.mp3';
  await writeFile(path.join(dir,'reviewed/test.mp3'),bytes);
  await writeFile(path.join(dir,'login.mp3'),'<html>Sign in</html>');
  let assets=await buildReviewedAudioManifest(dir);
  assert.equal(assets[src],hash(bytes)); assert.equal(assets['/audio/login.mp3'],undefined);
  const wordRecording={src,sha256:hash(bytes)}, speech=deviceSpeechSource('Test sentence.');
  const facts={wordRecording,sentenceRecording:{src:speech,sha256:hash(speech)}};
  assert.deepEqual(reviewedAudioBlockers(facts,assets),[]);
  // A protected deployment hostname must have no effect on either check.
  process.env.VERCEL_URL='protected-host.invalid';
  assert.deepEqual(reviewedAudioBlockers(facts,assets),[]);
  await writeFile(path.join(dir,'reviewed/test.mp3'),'ID3changed recording');
  assets=await buildReviewedAudioManifest(dir);
  assert.match(reviewedAudioBlockers(facts,assets).join(' '),/word audio.*changed/);
  await rm(path.join(dir,'reviewed/test.mp3'));
  assets=await buildReviewedAudioManifest(dir);
  assert.match(reviewedAudioBlockers(facts,assets).join(' '),/word audio.*missing/);
  assert.match(reviewedAudioBlockers({...facts,wordRecording:{src:'/audio/../secret.mp3',sha256:hash(bytes)}},assets).join(' '),/path is invalid/);
  assert.match(reviewedAudioBlockers({...facts,sentenceRecording:{src:speech,sha256:'0'.repeat(64)}},assets).join(' '),/sentence audio.*changed/);
  assert.equal(reviewedAudioBlockers({}).length,2);
  console.log({passed:true,realBytesChecked:true,protectedHostIgnored:true,missingChangedAndNonAudioFlagged:true,deviceSpeechVerified:true});
} finally { await rm(dir,{recursive:true,force:true}); }
