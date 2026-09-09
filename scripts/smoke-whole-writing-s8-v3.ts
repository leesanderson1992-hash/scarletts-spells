import { analyseItsContextV3, ITS_V3_MANIFEST } from "../lib/writing-engine/whole-writing/context-its-v3";
import { analyseThereContextV3, THERE_V3_MANIFEST } from "../lib/writing-engine/whole-writing/context-there-v3";
import { analyseToContextV3, TO_V3_MANIFEST } from "../lib/writing-engine/whole-writing/context-to-v3";
import { analyseYourContextV3, YOUR_V3_MANIFEST } from "../lib/writing-engine/whole-writing/context-your-v3";

// Manual engineering example only. It is not corpus, gold, training,
// regression, approval, publication, or delivery evidence.
const source = "Their going to take the dog over there after lunch, but I think they’re leaving their coats behind. Your supposed to bring two drinks too, although you’re bag is already very heavy. The puppy wagged it’s tail while its owner tried to stop it from running to fast down the path.";
const families = [
  { manifest: THERE_V3_MANIFEST, analyse: analyseThereContextV3 },
  { manifest: YOUR_V3_MANIFEST, analyse: analyseYourContextV3 },
  { manifest: TO_V3_MANIFEST, analyse: analyseToContextV3 },
  { manifest: ITS_V3_MANIFEST, analyse: analyseItsContextV3 },
] as const;
const memberPattern = /[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*/gu;
const rows = [];
for (const match of source.matchAll(memberPattern)) {
  const family = families.find((candidate) => candidate.manifest.members.includes(match[0].normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'")));
  if (!family) continue;
  const startUtf16 = match.index!;
  const result = family.analyse({ fieldText: source, startUtf16, endUtf16: startUtf16 + match[0].length });
  rows.push({
    family: family.manifest.familyKey,
    sourceOccurrence: match[0],
    startUtf16,
    endUtf16: startUtf16 + match[0].length,
    classification: result?.status ?? "NOT_ASSESSED",
    suggestedAlternative: result?.alternativeMember ?? null,
    assessedScope: result?.assessedScope ?? null,
    reasonCode: result?.reasonCode ?? "NO_FAMILY_RESULT",
    selectedRelease: family.manifest.releaseKey,
  });
}
console.log(JSON.stringify({
  purpose: "MANUAL_ENGINEERING_SMOKE_NOT_RELEASE_EVIDENCE",
  source,
  results: rows,
  consequences: {
    databaseWrites: false,
    approval: false,
    selection: false,
    parentDelivery: false,
    proficiency: false,
    authenticUse: false,
    remediation: false,
    reward: false,
    reviewOrRetirement: false,
  },
}, null, 2));
