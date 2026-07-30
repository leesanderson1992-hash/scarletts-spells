import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadClosedCompoundProfiles } from "../lib/adle/morphology/closed-compound-profile-loader";
import { compileClosedCompoundLesson } from "../lib/adle/morphology/closed-compound-word-lab";

const url = process.env.STAGING_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SB_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("staging Supabase URL and service-role key are required");
assert(new URL(url).hostname.startsWith("jlhotktspjvffslvuyfz."), "refusing to audit a non-staging Supabase project");
const stagingUrl = url;
const stagingKey = key;

async function main() {
  const client = createClient(stagingUrl, stagingKey, { auth: { persistSession: false } });
  const loaded = await loadClosedCompoundProfiles(client, "00000000-0000-0000-0000-000000000000", {
    allowStagingProfiles: true,
  });
  assert.equal(loaded.profiles.length, 1, "one reviewed closed-compound profile must load");
  const profile = loaded.profiles[0];
  assert.equal(profile.wordsByCanonicalId.size, 7, "all seven approved dictionary members must be eligible");
  const payload = compileClosedCompoundLesson(profile, []);
  assert(payload, "the staging profile must compile");
  assert.equal(payload.words.lesson.length, 4, "each immutable assignment selects four words");
  assert.equal(
    new Set(payload.words.lesson.map((word) => word.dictationSentence)).size,
    4,
    "selected dictation sentences must be unique",
  );
  console.log(JSON.stringify({
    project: new URL(stagingUrl).hostname.split(".")[0],
    profileCount: loaded.profiles.length,
    eligiblePool: [...profile.wordsByCanonicalId.values()].map((word) => word.displayWord).sort(),
    selectedWords: payload.words.lesson.map((word) => word.displayWord),
    productionEnabled: profile.productionEnabled,
  }, null, 2));
}

void main();
