import assert from "node:assert/strict";

import {
  boundedMigrationSqlContext,
  formatMigrationFailureDiagnostic,
} from "./lib/adle-review-migration-diagnostics";

const sql = `begin;
create table public.before_failure(id integer);
update public.daily_assignments set
  target_words = array(select distinct value order by value from unnest(target_words) value)
where id = p_daily_assignment_id;
commit;`;
const position = sql.indexOf("from unnest") + 1;
const failure = Object.assign(new Error('syntax error at or near "from"'), {
  code: "42601",
  position: String(position),
});
const message = formatMigrationFailureDiagnostic(
  "20260825140000_add_adle_review_r6_unified_session.sql",
  sql,
  failure,
);

assert.match(message, /Migration failed: 20260825140000_add_adle_review_r6_unified_session\.sql/);
assert.match(message, /Migration version: 20260825140000/);
assert.match(message, /PostgreSQL SQLSTATE: 42601/);
assert.match(message, /PostgreSQL message: syntax error at or near "from"/);
assert.match(message, new RegExp(`PostgreSQL position: ${position}`));
assert.match(message, /SQL location: line 4, column 61/);
assert.match(message, /select distinct value order by value from unnest/);

assert.deepEqual(boundedMigrationSqlContext("select 1", undefined), {
  column: null,
  context: "select 1",
  line: null,
  position: null,
});

console.log("PASS: guarded Review R6 migration failures identify file, version, SQLSTATE, position, and bounded SQL context");
