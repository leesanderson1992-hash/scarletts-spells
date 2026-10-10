import assert from "node:assert/strict";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

const header = "tdm_export_version,canonical_word_id,normalised_word,has_schwa";
const rows = parseDictionaryCsv(`${header}\n1,id-one,renew,TRUE\n1,id-two,read,FALSE\n1,id-three,other,maybe\n`);
assert.equal(rows[0].payload.metadata.has_schwa, true);
assert.equal(rows[1].payload.metadata.has_schwa, false);
assert.equal(rows[0].error, undefined);
assert.equal(rows[1].error, undefined);
assert.match(rows[2].error ?? "", /has_schwa/);
console.log("Teaching Dictionary CSV Boolean regression passed");
