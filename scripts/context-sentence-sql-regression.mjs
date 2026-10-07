import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { startTmpfsContextPostgres } from "./context-local-postgres.mjs";

const cluster = await startTmpfsContextPostgres("atria-pm-postgres");
let db = new pg.Client({ host: "127.0.0.1", port: cluster.port,
  user: "postgres", database: "postgres" });
try {
  await db.connect();
  await db.query("create database context_sentence_proof with encoding 'UTF8' template template0");
  await db.end();
  db = new pg.Client({ host: "127.0.0.1", port: cluster.port,
    user: "postgres", database: "context_sentence_proof" });
  await db.connect();
  await db.query(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create extension pgcrypto with schema extensions;
    create table public.writing_source_snapshots(id uuid primary key,child_id uuid,
      parent_user_id uuid,submission_id uuid,envelope jsonb);
    create table public.writing_occurrences(id text primary key,snapshot_id uuid,
      provenance text,field_path text,field_hash text,start_utf16 integer,
      end_utf16 integer,observed_text text);
    create table public.writing_issues(id uuid primary key default gen_random_uuid(),
      child_id uuid,parent_user_id uuid,task_submission_id uuid,metadata jsonb,
      source_writing_occurrence_id text,observed_text text,context_text text);
  `);
  await db.query(readFileSync(new URL("../supabase/migrations/20261007130000_persist_verified_context_sentence.sql", import.meta.url), "utf8"));
  const source = randomUUID(), child = randomUUID(), parent = randomUUID(), submission = randomUUID();
  const text = "😀 Their bag is here. Their book is there!";
  const hash = createHash("sha256").update(JSON.stringify(text)).digest("hex");
  await db.query("insert into writing_source_snapshots values($1,$2,$3,$4,$5)",
    [source,child,parent,submission,{ rawSubmissionText: text }]);
  const starts = [text.indexOf("Their"), text.lastIndexOf("Their")];
  const offsets = await db.query(`select context_char_offset_from_utf16($1,$2) as start_char,
    context_char_offset_from_utf16($1,$3) as end_char`, [text,starts[0],starts[0]+5]);
  assert.equal(offsets.rows[0].start_char, 2);
  assert.equal(offsets.rows[0].end_char, 7);
  for (let index = 0; index < starts.length; index++) {
    const id = `sentence:${index}`;
    await db.query("insert into writing_occurrences values($1,$2,'learner_response','/rawSubmissionText',$3,$4,$5,'Their')",
      [id,source,hash,starts[index],starts[index]+5]);
    const inserted = await db.query(`insert into writing_issues(child_id,parent_user_id,task_submission_id,
      metadata,source_writing_occurrence_id,observed_text,context_text)
      values($1,$2,$3,'{"source_kind":"contextual_advisory_v4"}',$4,'Their','Their')
      returning context_text`,[child,parent,submission,id]);
    assert.equal(inserted.rows[0].context_text, index === 0
      ? "😀 Their bag is here." : "Their book is there!");
  }
  await db.query("insert into writing_occurrences values('bad-span',$1,'learner_response','/rawSubmissionText',$2,4,9,'Their')",
    [source,hash]);
  await assert.rejects(db.query(`insert into writing_issues(child_id,parent_user_id,task_submission_id,
    metadata,source_writing_occurrence_id,observed_text,context_text)
    values($1,$2,$3,'{"source_kind":"contextual_advisory_v4"}','bad-span','Their','Their')`,
    [child,parent,submission]), /CONTEXT_SENTENCE_SPAN_INVALID/);
  const nestedSource = randomUUID(), nestedSubmission = randomUUID();
  const nestedText = "Try their answer. Check the next sentence.";
  const nestedHash = createHash("sha256").update(JSON.stringify(nestedText)).digest("hex");
  await db.query("insert into writing_source_snapshots values($1,$2,$3,$4,$5)",
    [nestedSource,child,parent,nestedSubmission,{ draftPayload: { __structured_lesson_response:
      { answers: [{ value: nestedText }] } } }]);
  await db.query(`insert into writing_occurrences values('nested',$1,'learner_response',
    '/draftPayload/__structured_lesson_response/answers/0/value',$2,4,9,'their')`,
  [nestedSource,nestedHash]);
  const nested = await db.query(`insert into writing_issues(child_id,parent_user_id,task_submission_id,
    metadata,source_writing_occurrence_id,observed_text,context_text)
    values($1,$2,$3,'{"source_kind":"contextual_advisory_v4"}','nested','their','their')
    returning context_text`,[child,parent,nestedSubmission]);
  assert.equal(nested.rows[0].context_text,"Try their answer.");
  console.log("Verified contextual sentence SQL: repeated words, emoji UTF-16 span, mismatch rollback.");
} finally {
  await db.end().catch(() => {});
  await cluster.close();
}
