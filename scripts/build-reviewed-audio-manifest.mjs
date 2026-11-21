import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hash the same static files shipped by this build; never fetch a protected deployment. */
export async function buildReviewedAudioManifest(audioDirectory) {
  const entries = [];
  async function visit(directory, prefix = '/audio') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name), src = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await visit(file, src);
      else if (entry.isFile() && /\.(mp3|wav)$/i.test(entry.name)) {
        const bytes = await readFile(file);
        const audio = entry.name.toLowerCase().endsWith('.wav')
          ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE'
          : bytes.toString('ascii', 0, 3) === 'ID3' || bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
        if (audio) entries.push([src, createHash('sha256').update(bytes).digest('hex')]);
      }
    }
  }
  await visit(audioDirectory);
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b, 'en')));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const manifest = await buildReviewedAudioManifest(path.join(root, 'public/audio'));
  await writeFile(path.join(root, 'lib/adle/weak-vowel/reviewed-audio-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Verified ${Object.keys(manifest).length} bundled audio assets.`);
}
