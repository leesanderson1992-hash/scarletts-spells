#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error("Usage: node snapshot-next-teaching-dictionary-production.mjs <output.json>");
}

const connectionString =
  process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED ??
  process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION;
if (!connectionString) throw new Error("Missing production read-only database URL.");

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const protectedTables = [
  "adle_learning_items",
  "learning_items",
  "assignment_items",
  "adle_evidence_events",
  "child_word_treasures",
];

try {
  const client = await pool.connect();
  try {
    await client.query("begin read only");

    const { rows: words } = await client.query(`
      select word_key, normalised_word, display_word, frequency_band, age_band,
             complexity_band, review_status
      from public.canonical_teaching_dictionary_words
      where row_status = 'active'
      order by normalised_word
    `);

    const { rows: counts } = await client.query(`
      select
        (select count(*)::int from public.canonical_teaching_dictionary_words where row_status='active') as active_words,
        (select count(*)::int from public.canonical_teaching_dictionary_word_metadata where row_status='active') as active_metadata,
        (select count(*)::int from public.canonical_teaching_dictionary_dictation_sentences where row_status='active') as active_dictation,
        (select count(*)::int from public.canonical_teaching_dictionary_word_support where row_status='active') as active_support,
        (select count(*)::int from public.canonical_teaching_dictionary_content_versions where is_active=true) as active_content
    `);

    const { rows: learnerDemand } = await client.query(`
      with legacy as (
        select li.child_id, li.micro_skill_key,
               lower(btrim(coalesce(wi.approved_replacement, wi.suggested_replacement, ''))) as target
        from public.learning_items li
        left join public.writing_issues wi on wi.id = li.source_writing_issue_id
        where li.is_active = true
      )
      select target, micro_skill_key, count(*)::int as item_count,
             count(distinct child_id)::int as child_count
      from legacy
      where target <> ''
      group by target, micro_skill_key
      order by target, micro_skill_key
    `);

    const { rows: metadataGaps } = await client.query(`
      select w.word_key, w.normalised_word
      from public.canonical_teaching_dictionary_words w
      left join public.canonical_teaching_dictionary_word_metadata m
        on m.canonical_word_id = w.id and m.row_status = 'active'
      where w.row_status = 'active' and m.id is null
      order by w.normalised_word
    `);

    const { rows: readinessGaps } = await client.query(`
      select v.micro_skill_key, coalesce(r.readiness_state, 'missing') as readiness_state,
             coalesce(r.blockers, '[]'::jsonb) as blockers
      from public.canonical_teaching_dictionary_content_versions v
      left join public.canonical_teaching_dictionary_readiness_reports r
        on r.teaching_content_version_id = v.id
      where v.is_active = true
        and coalesce(r.readiness_state, 'missing') <> 'ready_for_first_exposure'
      order by v.micro_skill_key
    `);

    const tableCounts = {};
    for (const table of protectedTables) {
      const exists = await client.query(
        `select to_regclass($1) is not null as present`,
        [`public.${table}`],
      );
      if (!exists.rows[0].present) continue;
      const result = await client.query(`select count(*)::int as count from public.${table}`);
      tableCounts[table] = result.rows[0].count;
    }

    const snapshot = {
      schemaVersion: "next_teaching_dictionary_production_snapshot_v1",
      capturedAt: new Date().toISOString(),
      readOnly: true,
      containsChildIdentity: false,
      containsRawAttemptText: false,
      counts: counts[0],
      protectedTableCounts: tableCounts,
      activeWords: words,
      learnerDemand,
      metadataGaps,
      readinessGaps,
    };

    await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await client.query("rollback");
    console.log(JSON.stringify({ outputPath, ...snapshot.counts, learnerDemandRows: learnerDemand.length }));
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
