#!/usr/bin/env node
/** Atomically replace draft lexical families with owner-approved relationships. */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const DATA = resolve(ROOT, "data/adle/homophone/convergence-v1");
const FILES = ["reconciled-lexical-families.csv", "reconciled-lexical-family-members.csv",
  "reconciled-word-family-coverage.csv", "approved-root-family-decisions.csv",
  "family-pos-tag-corrections.csv"];
const sourceHash = createHash("sha256");
for (const name of FILES) sourceHash.update(readFileSync(resolve(DATA, name)));
const sha = sourceHash.digest("hex");
const parsed = spawnSync("python3", ["-c", `import csv,json,sys
from pathlib import Path
d=Path(sys.argv[1]);print(json.dumps([[dict(r) for r in csv.DictReader((d/n).open(encoding='utf-8',newline=''))] for n in sys.argv[2:]]))`,
  DATA, ...FILES], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
if (parsed.status !== 0) throw new Error(`SOURCE_CSV_PARSE_FAILED:${parsed.stderr}`);
const [families, members, coverage, rootDecisions] = JSON.parse(parsed.stdout);
if (families.length !== 866 || members.length !== 1096 || coverage.length !== 1083 || rootDecisions.length !== 128)
  throw new Error("RECONCILED_SOURCE_COUNTS_CHANGED");
if (new Set(families.map(row => row.family_key)).size !== families.length ||
    new Set(members.map(row => `${row.word_key}|${row.family_key}`)).size !== members.length)
  throw new Error("DUPLICATE_FAMILY_OR_MEMBERSHIP");
const familyByKey = new Map(families.map(row => [row.family_key, row]));
const approvedVariants = [
  { family_key: "community_noun_base_family", word_key: "community_en_gb", source_base_text: "commune", relation_kind: "rebase_to_free_word" },
  { family_key: "respond_verb_base_family", word_key: "irresponsible_en_gb", source_base_text: "respons", relation_kind: "rebase_to_free_word" },
  { family_key: "separate_adjective_base_family", word_key: "separate_en_gb", source_base_text: "separ", relation_kind: "rebase_to_free_word" },
  { family_key: "soci_bound_root_base_family", word_key: "social_en_gb", source_base_text: "socio", relation_kind: "historical_variant" },
];
const variantSet = new Set(approvedVariants.map(v => `${v.family_key}|${v.word_key}|${v.source_base_text}`));
for (const member of members) {
  const family = familyByKey.get(member.family_key);
  if (!family) throw new Error(`UNKNOWN_FAMILY:${member.family_key}`);
  const parts = JSON.parse(member.morphology_parts_json);
  const surfaces = parts.map(part => part.surfaceText).join("").toLowerCase().replace(/[\s-]/g, "");
  if (surfaces !== member.word.toLowerCase().replace(/[\s-]/g, ""))
    throw new Error(`MORPHOLOGY_SURFACE_MISMATCH:${member.word_key}`);
  if (!parts.some(part => part.kind === "base" && (
    part.sourceText.toLowerCase() === family.base_lemma.toLowerCase() ||
    variantSet.has(`${member.family_key}|${member.word_key}|${part.sourceText.toLowerCase()}`))))
    throw new Error(`UNREVIEWED_BASE_MAPPING:${member.word_key}:${member.family_key}`);
  if (!member.word_part_of_speech || !member.intended_meaning || !member.word_sum)
    throw new Error(`INCOMPLETE_MEMBERSHIP:${member.word_key}`);
}
const mode = process.argv[2];
if (!["plan", "apply", "verify"].includes(mode)) throw new Error("Use plan, apply or verify");
const envLine = readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .find(line => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!envLine) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
let connectionString = envLine.slice(envLine.indexOf("=") + 1).trim();
if ((connectionString.startsWith("'") && connectionString.endsWith("'")) ||
    (connectionString.startsWith('"') && connectionString.endsWith('"')))
  connectionString = connectionString.slice(1, -1);
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
await db.connect();
try {
  await db.query(mode === "apply" ? "begin" : "begin read only");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='180s'");
  const baseline = (await db.query(`select
    (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_families) families,
    (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_families where review_status='approved') approved,
    (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members) members,
    (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_variants) variants,
    (select count(*)::int from public.canonical_teaching_dictionary_words where row_status='active' and dialect_code='en-GB') active_words,
    (select count(*)::int from supabase_migrations.schema_migrations where version='20261023164000') migration`)).rows[0];
  if (mode === "verify") {
    if (JSON.stringify(baseline) !== JSON.stringify({ families: 866, approved: 866, members: 1096,
      variants: 4, active_words: 2190, migration: 1 })) throw new Error(`APPROVED_REGISTRY_READBACK_MISMATCH:${JSON.stringify(baseline)}`);
    const integrity = (await db.query(`select
      count(*) filter (where m.id is null or m.row_status<>'active' or m.analysis_status<>'approved')::int stale_morphology,
      count(distinct fm.canonical_word_id)::int words,
      count(*)::int memberships
      from public.canonical_teaching_dictionary_lexical_base_family_members fm
      left join public.canonical_teaching_dictionary_word_morphology m on m.id=fm.canonical_morphology_id`)).rows[0];
    if (integrity.stale_morphology || integrity.words !== 1083 || integrity.memberships !== 1096)
      throw new Error(`REGISTRY_INTEGRITY_MISMATCH:${JSON.stringify(integrity)}`);
    const exact = (await db.query(`with expected as (select * from jsonb_to_recordset($1::jsonb)
        as r(family_key text,word_key text,word_sum text,word_part_of_speech text,relationship_kind text,intended_meaning text)),
      actual as (select fm.family_key,w.word_key,fm.word_sum,fm.word_part_of_speech,fm.relationship_kind,fm.intended_meaning
        from public.canonical_teaching_dictionary_lexical_base_family_members fm
        join public.canonical_teaching_dictionary_words w on w.id=fm.canonical_word_id)
      select count(*) filter (where e.family_key is null or a.family_key is null
        or e.word_sum is distinct from a.word_sum or e.word_part_of_speech is distinct from a.word_part_of_speech
        or e.relationship_kind is distinct from a.relationship_kind or e.intended_meaning is distinct from a.intended_meaning)::int mismatches
      from expected e full outer join actual a on a.family_key=e.family_key and a.word_key=e.word_key`,
      [JSON.stringify(members)])).rows[0];
    if (exact.mismatches) throw new Error(`REGISTRY_SOURCE_MISMATCH:${JSON.stringify(exact)}`);
    const sourceReference = `reconciled-lexical-families:${sha}`;
    const provenance = (await db.query(`select
      (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_families where source_reference<>$1) family_mismatches,
      (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members where source_reference<>$1) member_mismatches,
      (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_variants where source_reference<>$1) variant_mismatches`,
      [sourceReference])).rows[0];
    if (Object.values(provenance).some(value => value !== 0))
      throw new Error(`REGISTRY_PROVENANCE_MISMATCH:${JSON.stringify(provenance)}`);
    await db.query("rollback");
    console.log(JSON.stringify({ target: "production", mode, sourceSha256: sha, ...baseline, ...integrity,
      exactMembershipMismatches: exact.mismatches, provenanceMismatches: provenance }));
  } else {
    if (JSON.stringify(baseline) !== JSON.stringify({ families: 720, approved: 0, members: 899,
      variants: 0, active_words: 2190, migration: 1 })) throw new Error(`DRAFT_BASELINE_CHANGED:${JSON.stringify(baseline)}`);
    const projection = members.map(row => ({ word_key: row.word_key, family_key: row.family_key,
      word_sum: row.word_sum, morphology_parts: JSON.parse(row.morphology_parts_json),
      morphology_joins: JSON.parse(row.morphology_joins_json),
      morphology_transformations: JSON.parse(row.morphology_transformations_json) }));
    const preflight = (await db.query(`with incoming as (select * from jsonb_to_recordset($1::jsonb)
      as r(word_key text,family_key text,word_sum text,morphology_parts jsonb,morphology_joins jsonb,morphology_transformations jsonb))
      select count(*)::int total,
      count(*) filter (where m.word_sum is distinct from r.word_sum)::int bad_word_sum,
      count(*) filter (where m.morphology_parts is distinct from r.morphology_parts)::int bad_parts,
      count(*) filter (where m.morphology_joins is distinct from r.morphology_joins)::int bad_joins,
      count(*) filter (where m.morphology_transformations is distinct from r.morphology_transformations)::int bad_transforms,
      count(*) filter (where w.id is null or m.id is null or m.word_sum is distinct from r.word_sum
        or m.morphology_parts is distinct from r.morphology_parts
        or m.morphology_joins is distinct from r.morphology_joins
        or m.morphology_transformations is distinct from r.morphology_transformations
        or m.row_status<>'active' or m.analysis_status<>'approved'
        or m.review_status<>'approved_for_first_exposure')::int invalid,
      array_agg(r.word_key) filter (where w.id is null or m.id is null or m.word_sum is distinct from r.word_sum
        or m.morphology_parts is distinct from r.morphology_parts
        or m.morphology_joins is distinct from r.morphology_joins
        or m.morphology_transformations is distinct from r.morphology_transformations)::text[] invalid_keys
      from incoming r left join public.canonical_teaching_dictionary_words w on w.word_key=r.word_key
        and w.dialect_code='en-GB' and w.row_status='active' and w.review_status='approved_for_first_exposure'
      left join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id and m.row_status='active'`,
      [JSON.stringify(projection)])).rows[0];
    if (preflight.total !== 1096 || preflight.invalid) throw new Error(`CANONICAL_MORPHOLOGY_PREFLIGHT_FAILED:${JSON.stringify(preflight)}`);
    const anchors = (await db.query(`with incoming as (select * from jsonb_to_recordset($1::jsonb)
      as r(family_key text,base_lemma text,base_kind text,canonical_anchor_word_key text))
      select count(*) filter (where r.base_kind='free_base' and w.id is null)::int missing,
        array_agg(r.family_key) filter (where r.base_kind='free_base' and w.id is null)::text[] missing_keys
      from incoming r left join public.canonical_teaching_dictionary_words w
        on w.word_key=r.canonical_anchor_word_key and w.normalised_word=r.base_lemma
        and w.dialect_code='en-GB' and w.row_status='active' and w.review_status='approved_for_first_exposure'`,
      [JSON.stringify(families)])).rows[0];
    if (anchors.missing) throw new Error(`FREE_BASE_ANCHOR_PREFLIGHT_FAILED:${JSON.stringify(anchors)}`);
    if (mode === "plan") {
      await db.query("rollback");
      console.log(JSON.stringify({ target: "production", mode, sourceSha256: sha, baseline,
        proposed: { families: 866, members: 1096, words: 1083, reviewedVariants: 4 },
        canonicalMorphologyMatched: preflight.total }));
    } else {
      await db.query("select pg_advisory_xact_lock(hashtext('approved-lexical-family-reconciliation'))");
      await db.query("delete from public.canonical_teaching_dictionary_lexical_base_family_members where family_key in (select family_key from public.canonical_teaching_dictionary_lexical_base_families where review_status='draft')");
      await db.query("delete from public.canonical_teaching_dictionary_lexical_base_families where review_status='draft'");
      const sourceRef = `reconciled-lexical-families:${sha}`;
      const familyPayload = families.map(row => ({ ...row, source_reference: sourceRef }));
      const insertedFamilies = await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_families
        (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,base_meaning,source_reference,review_status)
        select r.family_key,1,r.base_lemma,r.base_part_of_speech,r.base_kind,w.id,r.base_meaning,r.source_reference,'draft'
        from jsonb_to_recordset($1::jsonb) as r(family_key text,base_lemma text,base_part_of_speech text,
          base_kind text,canonical_anchor_word_key text,base_meaning text,source_reference text)
        left join public.canonical_teaching_dictionary_words w on w.word_key=r.canonical_anchor_word_key
          and w.dialect_code='en-GB' and w.row_status='active' and w.review_status='approved_for_first_exposure'`,
      [JSON.stringify(familyPayload)]);
      if (insertedFamilies.rowCount !== 866) throw new Error("FAMILY_INSERT_COUNT_MISMATCH");
      const memberPayload = members.map(row => ({ ...row, morphology_parts: JSON.parse(row.morphology_parts_json),
        morphology_joins: JSON.parse(row.morphology_joins_json),
        morphology_transformations: JSON.parse(row.morphology_transformations_json), source_reference: sourceRef }));
      const insertedMembers = await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_family_members
        (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,
          word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference)
        select r.family_key,1,w.id,r.word_part_of_speech,r.relationship_kind,m.id,r.word_sum,
          r.morphology_parts,r.morphology_joins,r.morphology_transformations,r.intended_meaning,r.source_reference
        from jsonb_to_recordset($1::jsonb) as r(family_key text,word_key text,word_part_of_speech text,
          relationship_kind text,word_sum text,morphology_parts jsonb,morphology_joins jsonb,
          morphology_transformations jsonb,intended_meaning text,source_reference text)
        join public.canonical_teaching_dictionary_words w on w.word_key=r.word_key and w.row_status='active'
        join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id and m.row_status='active'`,
      [JSON.stringify(memberPayload)]);
      if (insertedMembers.rowCount !== 1096) throw new Error("MEMBER_INSERT_COUNT_MISMATCH");
      const variantPayload = approvedVariants.map(row => ({ ...row, source_reference: sourceRef,
        approval_reference: "Katie Sanderson approval in Codex chat, 2026-10-23: root-family variants and prerequisites",
        reviewed_by: "Katie Sanderson" }));
      const insertedVariants = await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_variants
        (family_key,revision,canonical_word_id,source_base_text,relation_kind,source_reference,approval_reference,reviewed_by,reviewed_at)
        select r.family_key,1,w.id,r.source_base_text,r.relation_kind,r.source_reference,r.approval_reference,r.reviewed_by,now()
        from jsonb_to_recordset($1::jsonb) as r(family_key text,word_key text,source_base_text text,
          relation_kind text,source_reference text,approval_reference text,reviewed_by text)
        join public.canonical_teaching_dictionary_words w on w.word_key=r.word_key and w.row_status='active'`,
      [JSON.stringify(variantPayload)]);
      if (insertedVariants.rowCount !== 4) throw new Error("VARIANT_INSERT_COUNT_MISMATCH");
      const approved = await db.query(`select public.approve_canonical_lexical_base_family(family_key,revision,$1,$2)
        from public.canonical_teaching_dictionary_lexical_base_families where review_status='draft' order by family_key`,
      ["Katie Sanderson", "Katie Sanderson approval in Codex chat, 2026-10-23: reviewed lexical family recommendations and prerequisites"]);
      if (approved.rowCount !== 866) throw new Error("FAMILY_APPROVAL_COUNT_MISMATCH");
      const after = (await db.query(`select
        (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_families) families,
        (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_families where review_status='approved') approved,
        (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members) members,
        (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_variants) variants,
        (select count(distinct canonical_word_id)::int from public.canonical_teaching_dictionary_lexical_base_family_members) words`)).rows[0];
      if (JSON.stringify(after) !== JSON.stringify({ families: 866, approved: 866, members: 1096, variants: 4, words: 1083 }))
        throw new Error(`APPROVAL_READBACK_MISMATCH:${JSON.stringify(after)}`);
      await db.query("commit");
      const receiptDir = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases/2026-10-23-approved-lexical-families-v1");
      mkdirSync(receiptDir, { recursive: true });
      writeFileSync(resolve(receiptDir, "production-receipt.json"), `${JSON.stringify({ target: "production",
        sourceSha256: sha, before: baseline, after, approvedBy: "Katie Sanderson",
        approvedAt: new Date().toISOString(), canonicalPrerequisiteRelease: "2026-10-23-family-prerequisite-canonical-v1" }, null, 2)}\n`);
      console.log(JSON.stringify({ target: "production", mode, sourceSha256: sha, before: baseline, after }));
    }
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
