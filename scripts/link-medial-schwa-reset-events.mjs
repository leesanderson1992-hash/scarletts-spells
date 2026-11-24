/** Link the owner-authorised 23 November hold; never restore assignments. */
import fs from "node:fs";
import pg from "pg";
import assert from "node:assert/strict";
const apply = process.argv.includes("--apply");
const connection = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
assert(connection?.includes("wwohrqtunajrbwxyssjf"));
const skill = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
const source = JSON.parse(fs.readFileSync("outputs/schwa-dictionary-syllables-20261123/production-review-reset-applied.json", "utf8"));
const ids = source.pairs.filter(row => row.micro_skill_key === skill).map(row => row.canonical_word_id);
assert.equal(ids.length, 165);
const requests = ["a0504984-c34c-4fa5-a3ad-c5f35ed11566", "94b2aacd-8532-4204-a62d-ed6a1e17c113"];
const db = new pg.Client({ connectionString: connection });
await db.connect();
try {
  await db.query("begin");
  const events = (await db.query(`select e.id,e.canonical_word_id,e.request_id
    from teaching_dictionary_pair_decision_events e
    join teaching_dictionary_schwa_syllable_reviews r using(environment_key,canonical_word_id,micro_skill_key)
    join teaching_dictionary_pair_latest_decisions d on d.id=e.id
    where e.environment_key='production' and e.micro_skill_key=$1
      and e.canonical_word_id=any($2) and e.request_id=any($3)
      and e.action='deassign' and e.decided_by=$4 and r.reset_by=$4
      and r.reset_at=$5 and r.resolved_at is null and e.decided_at>=r.reset_at
    order by e.canonical_word_id`, [skill, ids, requests, source.actor, source.resetAt])).rows;
  assert.equal(events.length, 165, "Stop if a word was reviewed or deliberately removed since the audit");
  const before = (await db.query("select canonical_word_id,reset_deassignment_event_id from teaching_dictionary_schwa_syllable_reviews where environment_key='production' and micro_skill_key=$1 and canonical_word_id=any($2) for update", [skill, ids])).rows;
  for (const event of events) {
    assert([null,event.id].includes(before.find(row => row.canonical_word_id === event.canonical_word_id)?.reset_deassignment_event_id));
    await db.query("update teaching_dictionary_schwa_syllable_reviews set reset_deassignment_event_id=$1 where environment_key='production' and micro_skill_key=$2 and canonical_word_id=$3", [event.id, skill, event.canonical_word_id]);
  }
  assert.equal(Number((await db.query("select count(*) n from teaching_dictionary_pending_syllable_review_resets where environment_key='production' and micro_skill_key=$1", [skill])).rows[0].n), 165);
  if (apply) await db.query("commit"); else await db.query("rollback");
  fs.mkdirSync("outputs/medial-schwa-missing-20261124", {recursive:true});
  fs.writeFileSync(`outputs/medial-schwa-missing-20261124/provenance-${apply ? "applied" : "rehearsal"}.json`, JSON.stringify({wordCount:165,assignmentRestores:0,publicationsAdded:0,events},null,2));
  console.log({mode:apply ? "applied" : "rollback rehearsal",reviewHoldsLinked:165,assignmentRestores:0});
} catch (error) { await db.query("rollback"); throw error; }
finally { await db.end(); }
