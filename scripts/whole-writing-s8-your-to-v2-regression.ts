import assert from "node:assert/strict";
import { analyseYourContextV2 } from "../lib/writing-engine/whole-writing/context-your-v2";
import { analyseToContextV2 } from "../lib/writing-engine/whole-writing/context-to-v2";
import { CONTEXT_YOUR_TO_CANDIDATES_V2, contextAnalyserForRelease } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { analyseDeterministicContext, CONTEXT_FAMILY_MANIFESTS, WHOLE_WRITING_CONTEXT_ANALYSER_VERSION, WHOLE_WRITING_CONTEXT_REGISTRY_VERSION, WHOLE_WRITING_CONTEXT_CORPUS_VERSION } from "../lib/writing-engine/whole-writing/context";

const examples: Array<["your" | "to", string, string, string, string | null]> = [
  ["your", "You're red book seems cold.", "You're", "UNCERTAIN", null], // unlisted modifier
  ["your", "Your careful teacher looks happy near the station.", "Your", "VALID", null],
  ["your", "You’re careful teacher looks happy near the station.", "You’re", "INVALID", "your"],
  ["your", "You're quiet enough to read a book.", "You're", "VALID", null],
  ["your", "Your quiet enough to read a book.", "Your", "INVALID", "you're"],
  ["your", "You're running seems fast.", "You're", "UNCERTAIN", null],
  ["your", "Your running seems fast.", "Your", "UNCERTAIN", null],
  ["your", "Your cold.", "Your", "UNCERTAIN", null],
  ["your", "You're teachers.", "You're", "UNCERTAIN", null],
  ["your", "Your ready enough to.", "Your", "UNCERTAIN", null],
  ["your", "Your quiet enough to read a book he went home.", "Your", "UNCERTAIN", null],
  ["your", "If your quiet enough to read a book.", "your", "UNCERTAIN", null],
  ["to", "Amelia travelled two the park before tea.", "two", "INVALID", "to"],
  ["to", "She walked to the museum.", "to", "VALID", null],
  ["to", "She walked two miles.", "two", "UNCERTAIN", null],
  ["to", "She walked too.", "too", "UNCERTAIN", null],
  ["to", "She walked two the.", "two", "UNCERTAIN", null],
  ["to", "He needs too read a book.", "too", "INVALID", "to"],
  ["to", "He wants two books.", "two", "UNCERTAIN", null],
  ["to", "He wants to.", "to", "UNCERTAIN", null],
  ["to", "He wants a turn to.", "to", "INVALID", "too"],
  ["to", "He wants a turn too.", "too", "VALID", null],
  ["to", "He wants a turn to read.", "to", "UNCERTAIN", null],
  ["to", "He wants a turn two people are waiting.", "two", "UNCERTAIN", null],
  ["to", "The coat looks two heavy for the journey.", "two", "INVALID", "too"],
  ["to", "The coat is too warm.", "too", "VALID", null],
  ["to", "The teacher is to fast before lunch.", "to", "UNCERTAIN", null],
  ["to", "The teacher is two fast for the visit.", "two", "UNCERTAIN", null],
  ["to", "The teacher is too fast for the visit.", "too", "VALID", null],
  ["to", "She walked two the park'.", "two", "UNCERTAIN", null],
  ["your", "Your quiet enough to read a book'.", "Your", "UNCERTAIN", null],
  ["to", "The coat is to hand.", "to", "UNCERTAIN", null],
  ["to", "The coat is two.", "two", "UNCERTAIN", null],
  ["to", "We have too tickets near the door.", "too", "INVALID", "two"],
  ["to", "We have two tickets near the door.", "two", "VALID", null],
  ["to", "We have to read.", "to", "UNCERTAIN", null],
  ["to", "We have too much work.", "too", "UNCERTAIN", null],
  ["to", "We have to running.", "to", "UNCERTAIN", null],
  ["to", "The missing picture decides whether to belongs here.", "to", "UNCERTAIN", null],
];
let checked = 0;
for (const [family, fieldText, word, status, alternative] of examples) {
  const startUtf16 = fieldText.indexOf(word); const input = { fieldText, startUtf16, endUtf16: startUtf16 + word.length };
  const result = (family === "your" ? analyseYourContextV2 : analyseToContextV2)(input);
  assert.equal(result?.status, status, fieldText); assert.equal(result?.alternativeMember, alternative, fieldText); checked += 1;
}
for (const candidate of CONTEXT_YOUR_TO_CANDIDATES_V2) {
  const m = candidate.manifest;
  const release = { id: m.releaseId, release_key: m.releaseKey, family_key: m.familyKey, analyser_version: m.analyserVersion, registry_version: m.registryVersion, corpus_version: m.corpusVersion, manifest_fingerprint: candidate.fingerprint };
  assert.equal(contextAnalyserForRelease(release)?.analyse, candidate.analyse);
  for (const key of Object.keys(release)) assert.equal(contextAnalyserForRelease({ ...release, [key]: "tampered" }), null, key);
  const sentence = m.familyKey === "YOUR_YOURE" ? "Youʼre quiet book seems happy." : "She walked two the park.";
  const word = m.familyKey === "YOUR_YOURE" ? "Youʼre" : "two";
  for (const quotes of [['"', '"'], ['“', '”'], ['‘', '’'], ["'", "'"]]) {
    const fieldText = `A note: ${quotes[0]}Earlier. ${sentence}${quotes[1]}`; const startUtf16 = fieldText.indexOf(word);
    assert.equal(candidate.analyse({ fieldText, startUtf16, endUtf16: startUtf16 + word.length })?.status, "UNCERTAIN");
  }
  const fieldText = `📝 Cafe\u0301. ${sentence} ${sentence}`;
  for (const startUtf16 of [fieldText.indexOf(word), fieldText.lastIndexOf(word)]) {
    assert.equal(candidate.analyse({ fieldText, startUtf16, endUtf16: startUtf16 + word.length })?.status, "INVALID");
    const joined = `x${fieldText.slice(startUtf16)}`;
    assert.equal(candidate.analyse({ fieldText: joined, startUtf16: 1, endUtf16: 1 + word.length })?.status, "UNCERTAIN");
  }
}
for (const [i, m] of CONTEXT_FAMILY_MANIFESTS.entries()) {
  const release = { id: `81000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, release_key: `s8-v1-${m.familyKey.toLowerCase().replaceAll("_", "-")}`, family_key: m.familyKey, analyser_version: WHOLE_WRITING_CONTEXT_ANALYSER_VERSION, registry_version: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION, corpus_version: WHOLE_WRITING_CONTEXT_CORPUS_VERSION, manifest_fingerprint: m.fingerprint };
  assert.equal(contextAnalyserForRelease(release)?.analyse, analyseDeterministicContext);
  for (const key of Object.keys(release)) assert.equal(contextAnalyserForRelease({ ...release, [key]: "tampered" }), null);
}
for (const apostrophe of ["'", "’", "ʼ"]) {
  const fieldText = `You${apostrophe}re quiet teacher seems happy.`;
  assert.equal(analyseYourContextV2({ fieldText, startUtf16: 0, endUtf16: 6 })?.alternativeMember, "your");
}
console.log(`S8 YOUR/TO V2: ${checked} novel construction/counterexample cases, quotation/Unicode/repetition and exact V1/V2 dispatch/tamper checks passed.`);
