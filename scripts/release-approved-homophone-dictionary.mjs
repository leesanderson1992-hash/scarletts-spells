#!/usr/bin/env node
/** Governed, bounded Production release of the owner-approved homophone package. */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGE = resolve(ROOT, "outputs/homophone-dictionary-family-package-2026-10-24");
const FILES = ["homophone-words-review.csv", "homophone-family-memberships-review.csv",
  "homophone-family-definitions-review.csv", "homophone-additional-family-anchors-review.csv",
  "homophone-new-bound-roots-review.csv", "homophone-family-dependencies-review.csv"];
const sha = createHash("sha256");
for (const file of FILES) sha.update(readFileSync(resolve(PACKAGE, file)));
const packageHash = sha.digest("hex");
const releaseId = "2026-10-24-approved-homophone-dictionary-v1";
const actor = "Katie Sanderson";
const approval = "Katie Sanderson approval in Codex chat, 2026-10-24: homophone Teaching Dictionary resolution package";
const source = `${releaseId}:${packageHash}`;
const mode = process.argv[2];
if (!["plan", "apply", "verify"].includes(mode)) throw new Error("Use plan, apply or verify");
const parsed = spawnSync("python3", ["-c", `import csv,json,sys
from pathlib import Path
p=Path(sys.argv[1]);print(json.dumps([[dict(r) for r in csv.DictReader((p/n).open(encoding='utf-8-sig',newline=''))] for n in sys.argv[2:]]))`, PACKAGE, ...FILES],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
if (parsed.status !== 0) throw new Error(`PACKAGE_PARSE_FAILED:${parsed.stderr}`);
const [words, proposedMembers, proposedFamilies, anchors, roots, dependencies] = JSON.parse(parsed.stdout);
if (words.length !== 173 || proposedMembers.length !== 173 || proposedFamilies.length !== 164 ||
    anchors.length !== 2 || roots.length !== 2 || dependencies.length !== 13)
  throw new Error("APPROVED_PACKAGE_COUNT_CHANGED");
const wordByKey = new Map(words.map(r => [r.word_key, r]));
const familyByKey = new Map(proposedFamilies.map(r => [r.family_key, r]));
if (wordByKey.size !== 173 || familyByKey.size !== 164 ||
    new Set(proposedMembers.map(r => `${r.word_key}|${r.family_key}`)).size !== 173)
  throw new Error("APPROVED_PACKAGE_DUPLICATE");

// These corrections implement explicit family decisions recorded in the approved package.
const irregular = { blew: "blow", heard: "hear", led: "lead", threw: "throw", won: "win" };
function analysis(row) {
  let parts = JSON.parse(row.proposed_parts_json);
  let joins = JSON.parse(row.proposed_joins_json);
  let transformations = JSON.parse(row.proposed_transformations_json ?? "[]");
  let wordSum = row.approved_word_sum ?? row.word_sum;
  if (irregular[row.word]) {
    const base = irregular[row.word];
    parts = [{ id: "part_1", kind: "base", sourceText: base, surfaceText: row.word,
      gloss: parts[0].gloss }];
    joins = [];
    transformations = [{ kind: "irregular_past", sourceText: base, surfaceText: row.word }];
    wordSum = `${base} → ${row.word}`;
  } else if (row.word === "descent") {
    parts = [{ id: "part_1", kind: "base", sourceText: "descent", surfaceText: "descent",
      gloss: "a downward movement" }];
    joins = [];
    transformations = [];
    wordSum = "descent";
  } else if (row.word === "practice") {
    parts = [{ id: "part_1", kind: "base", sourceText: "practice", surfaceText: "practice",
      gloss: "repeated training to improve a skill" }];
    joins = [];
    transformations = [];
    wordSum = "practice";
  }
  // The existing lexical registry represents a bound root as its base part;
  // the linked family retains the explicit bound_root classification.
  parts = parts.map(part => part.kind === "root" ? { ...part, kind: "base" } : part);
  if (!parts.every(part => part.gloss?.trim())) throw new Error(`PART_GLOSS_MISSING:${row.word}`);
  const visible = parts.map(part => part.surfaceText).join("").toLowerCase().replace(/[\s-]/g, "");
  if (visible !== row.word.toLowerCase().replace(/[\s-]/g, ""))
    throw new Error(`MORPHOLOGY_SURFACE_MISMATCH:${row.word}`);
  return { parts, joins, transformations, wordSum };
}
const expected = new Map([...words, ...anchors.filter(r => r.word === "blow")].map(r => [r.word_key, analysis(r)]));
const series = anchors.find(r => r.word === "series");
if (!series || !anchors.some(r => r.word === "blow")) throw new Error("ANCHOR_MISSING");
expected.set(series.word_key, analysis(series));
const variants = [
  { family_key: "ceive_bound_root_base_family", word_key: "except_en_gb", source_base_text: "cept", relation_kind: "historical_variant" },
  { family_key: "series_noun_base_family", word_key: "serial_en_gb", source_base_text: "seri", relation_kind: "rebase_to_free_word" },
];
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

function rowHash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function one(sql, args = []) { return (await db.query(sql, args)).rows[0]; }
async function insertMorph(batchId, wordId, row, old) {
  const a = expected.get(row.word_key);
  const sourceMetadata = { ...(old?.source_metadata ?? {}), approvedHomophonePackage: releaseId,
    approvedPackageSha256: packageHash, approvedBy: actor, originalMorphologyId: old?.id ?? null };
  const q = await db.query(`insert into public.canonical_teaching_dictionary_word_morphology
    (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,
      raw_morpholex_segmentation,raw_morpholex_pos,morphology_parts,feature_keys,morphology_joins,
      morphology_transformations,transformation_notes,word_sum,analysis_status,source_category,source_name,
      source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at,review_notes)
    values ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'approved',
      'internal_reviewed_seed',$15,$16,null,$17,'high','approved_for_first_exposure',$18,now(),$19) returning id`,
  [batchId, wordId, "homophone-words-review.csv", 2 + [...expected.keys()].indexOf(row.word_key),
    rowHash({ key: row.word_key, a }), JSON.stringify(sourceMetadata),
    old?.raw_morpholex_segmentation ?? row.raw_morpholex_segmentation ?? null,
    row.part_of_speech, JSON.stringify(a.parts), JSON.stringify(old?.feature_keys ?? []),
    JSON.stringify(a.joins), JSON.stringify(a.transformations), old?.transformation_notes ?? null,
    a.wordSum, "Owner-approved homophone dictionary package", row.source_url || null,
    approval, actor, approval]);
  return q.rows[0].id;
}

await db.connect();
try {
  await db.query(mode === "apply" ? "begin isolation level serializable" : "begin read only");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='180s'");
  if (mode === "apply") await db.query("select pg_advisory_xact_lock(hashtext($1))", [releaseId]);
  const existingBatch = await one(`select id,batch_status,package_sha256 from public.canonical_teaching_dictionary_import_batches
    where release_id=$1 and target_environment='production'`, [releaseId]);
  if (existingBatch && (existingBatch.package_sha256 !== packageHash || existingBatch.batch_status !== "applied"))
    throw new Error("RELEASE_ID_CONFLICT");
  const allKeys = [...new Set([...words.map(r => r.word_key), "blow_en_gb", "series_en_gb"])];
  const liveWords = (await db.query(`select w.id,w.word_key,w.normalised_word,w.display_word,w.row_status,w.review_status,
      m.id metadata_id,m.written_syllable_breakdown,m.source_metadata metadata_source,m.syllables,m.phoneme_hint,
      x.id morphology_id,x.word_sum,x.morphology_parts,x.morphology_joins,x.morphology_transformations,x.raw_morpholex_pos,
      x.raw_morpholex_segmentation,x.feature_keys,x.transformation_notes,x.source_metadata morphology_source
    from public.canonical_teaching_dictionary_words w
    left join lateral (select * from public.canonical_teaching_dictionary_word_metadata
      where canonical_word_id=w.id and row_status='active' order by created_at desc,id desc limit 1) m on true
    left join lateral (select * from public.canonical_teaching_dictionary_word_morphology
      where canonical_word_id=w.id and row_status='active' order by created_at desc,id desc limit 1) x on true
    where w.word_key=any($1) and w.dialect_code='en-GB' and w.row_status='active'`, [allKeys])).rows;
  const live = new Map(liveWords.map(r => [r.word_key, r]));
  const anchorLemmas = [...new Set(proposedFamilies.filter(r => r.base_kind === "free_base")
    .map(r => r.base_lemma))];
  const anchorRows = (await db.query(`select id,normalised_word,word_key from public.canonical_teaching_dictionary_words
    where normalised_word=any($1) and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure'`, [anchorLemmas])).rows;
  const anchorByLemma = new Map(anchorRows.map(r => [r.normalised_word, r]));
  if (anchorLemmas.filter(lemma => lemma !== "series" && !anchorByLemma.has(lemma)).length)
    throw new Error(`FREE_BASE_ANCHORS_MISSING:${anchorLemmas.filter(lemma => lemma !== "series" && !anchorByLemma.has(lemma)).join(",")}`);
  if (live.size !== 174 || live.has("series_en_gb") ||
      [...wordByKey].some(([key, row]) => live.get(key)?.id !== row.canonical_word_id))
    if (!existingBatch) throw new Error("CANONICAL_BASELINE_CHANGED");
  const existingFamilies = (await db.query(`select distinct on (family_key) * from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=any($1) order by family_key,revision desc`, [[...familyByKey.keys()]])).rows;
  const familiesLive = new Map(existingFamilies.map(r => [r.family_key, r]));
  if (!existingBatch) {
    for (const row of proposedFamilies) {
      const f = familiesLive.get(row.family_key);
      if (row.review_status === "approved_production" && (!f || f.review_status !== "approved" ||
          f.base_lemma !== row.base_lemma || f.base_kind !== row.base_kind))
        throw new Error(`EXISTING_FAMILY_CHANGED:${row.family_key}`);
      if (row.review_status !== "approved_production" && f) throw new Error(`NEW_FAMILY_ALREADY_EXISTS:${row.family_key}`);
    }
  }
  if (mode === "verify" || existingBatch) {
    if (!existingBatch) throw new Error("RELEASE_NOT_APPLIED");
    const verified = await one(`with target as (select id from public.canonical_teaching_dictionary_words
      where word_key=any($1) and row_status='active'), current as (
      select distinct on (family_key) family_key,revision from public.canonical_teaching_dictionary_lexical_base_families
      where review_status='approved' order by family_key,revision desc)
      select (select count(*)::int from target) words,
      (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members m
        join current f using(family_key,revision) where m.canonical_word_id in (select id from target)) memberships,
      (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_families f
        join current c using(family_key,revision) where f.family_key=any($2)) families`,
      [words.map(r => r.word_key), [...familyByKey.keys()]]);
    if (verified.words !== 173 || verified.memberships < 173 || verified.families !== 164)
      throw new Error(`RELEASE_READBACK_FAILED:${JSON.stringify(verified)}`);
    await db.query("rollback");
    console.log(JSON.stringify({ mode, target: "production", releaseId, packageHash, ...verified, alreadyApplied: true }));
  } else if (mode === "plan") {
    const missingSplits = words.filter(r => !live.get(r.word_key)?.written_syllable_breakdown);
    const report = { mode, target: "production", releaseId, packageHash, canonicalTargets: words.length,
      newCanonicalAnchors: 1, existingAnchorsToNormalize: 1, morphologyRevisions: 174,
      newWrittenSyllableSplits: missingSplits.length, newFamilies: proposedFamilies.filter(r => !familiesLive.has(r.family_key)).length,
      revisedFamilies: existingFamilies.length, approvedVariants: variants.length };
    if (missingSplits.length !== 38 || report.newFamilies !== 63 || report.revisedFamilies !== 101)
      throw new Error(`PACKAGE_BASELINE_COUNT_CHANGED:${JSON.stringify(report)}`);
    await db.query("rollback"); console.log(JSON.stringify(report));
  } else {
    // The released package and source hash are frozen in an import batch. Existing
    // word identities, definitions, dictation and lesson snapshots are retained.
    const batch = await one(`insert into public.canonical_teaching_dictionary_import_batches
      (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,
        import_mode,batch_status,source_metadata,imported_by,imported_at,release_id,package_type,package_schema_version,
        package_sha256,target_environment,importer_version,verification_summary,verified_at)
      values($1,$2,'homophone-dictionary-family-v1',$3,$4,$5,'admin_import','applied',$6,$7,now(),$8,
        'homophone_dictionary_family','1',$2,'production','release-approved-homophone-dictionary-v1',$9,now()) returning id`,
      [PACKAGE, packageHash, JSON.stringify({ approvedBy: actor, approval }),
        JSON.stringify({ words: 173, morphologyRevisions: 174, familyDefinitions: 164 }),
        JSON.stringify({ approved: true }), JSON.stringify({ sourceFiles: FILES }), actor, releaseId,
        JSON.stringify({ pendingFamilyReadback: true })]);
    // One approved free-base anchor is absent from the canonical dictionary.
    const newWord = await one(`insert into public.canonical_teaching_dictionary_words
      (import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,word_key,
        normalised_word,display_word,dialect_code,frequency_band,age_band,complexity_band,source_category,
        source_name,source_url,source_use_note,confidence,review_status)
      values($1,'active','homophone-additional-family-anchors-review.csv',3,$2,$3,$4,$5,$6,'en-GB',
        $7,$8,$9,'internal_reviewed_seed',$10,$11,$12,'high','approved_for_first_exposure') returning id`,
      [batch.id, rowHash(series), JSON.stringify({ releaseId, packageHash, approval }), series.word_key,
        series.word, series.word, series.frequency_band, series.age_band, series.complexity_band,
        "Owner-approved homophone dictionary package", series.source_url, approval]);
    live.set(series.word_key, { id: newWord.id, word_key: series.word_key, display_word: series.word });
    anchorByLemma.set("series", { id: newWord.id, normalised_word: "series", word_key: series.word_key });
    const seriesMetadata = await one(`insert into public.canonical_teaching_dictionary_word_metadata
      (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,
        syllables,phoneme_hint,grapheme_notes,stress_pattern,has_schwa,morphemes,morphology_notes,
        irregularity_notes,written_syllable_breakdown,source_category,source_name,source_url,source_use_note,
        confidence,review_status,reviewed_by,reviewed_at)
      values($1,$2,'active','homophone-additional-family-anchors-review.csv',3,$3,$4,$5,$6,$7,$8,false,$9,$10,
        $11,$12,'internal_reviewed_seed',$13,$14,$15,'high','approved_for_first_exposure',$16,now()) returning id`,
      [batch.id,newWord.id,rowHash({ metadata: series.word }),JSON.stringify({ releaseId, packageHash,
        humanApprovedWrittenSyllableBreakdown: series.written_syllable_breakdown }),
        String(series.spoken_syllables),series.en_gb_pronunciation,series.grapheme_notes,series.stress_pattern,
        series.morphemes,series.morphology_notes,series.irregularity_notes,series.written_syllable_breakdown,
        "Owner-approved homophone dictionary package",series.source_url,approval,actor]);
    if (!seriesMetadata.id) throw new Error("SERIES_METADATA_INSERT_FAILED");
    await db.query(`insert into public.canonical_teaching_dictionary_dictation_sentences
      (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,
        dictation_sentence,dictation_target_token_index,audio_text,source_category,source_name,source_url,
        source_use_note,confidence,review_status,reviewed_by,reviewed_at)
      values($1,$2,'active','homophone-additional-family-anchors-review.csv',3,$3,$4,$5,$6,$5,
        'internal_reviewed_seed',$7,$8,$9,'high','approved_for_first_exposure',$10,now())`,
      [batch.id,newWord.id,rowHash({ sentence: series.dictation_sentence }),JSON.stringify({ releaseId, packageHash }),
        series.dictation_sentence,Number(series.dictation_target_index),
        "Owner-approved homophone dictionary package",series.source_url,approval,actor]);
    // Definition versions require a reviewed draft identity. Use the content
    // owner's latest approved draft author, retaining immutable provenance.
    const owner = await one(`select d.created_by from public.teaching_dictionary_manager_drafts d
      join public.teaching_dictionary_definition_versions v on v.draft_id=d.id
      where v.canonical_word_id=(select id from public.canonical_teaching_dictionary_words where word_key='blow_en_gb')
      order by v.published_at desc limit 1`);
    if (!owner?.created_by) throw new Error("DEFINITION_ACTOR_UNAVAILABLE");
    const draft = await one(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,'series','en-GB',$2,'csv',$3,$4) returning id`,
      [newWord.id,JSON.stringify({ displayWord: "series", definition: series.definition,
        dictationSentence: series.dictation_sentence, writtenSyllableBreakdown: series.written_syllable_breakdown,
        sourcePackageHash: packageHash }),source,owner.created_by]);
    await db.query(`insert into public.teaching_dictionary_definition_versions
      (canonical_word_id,definition,draft_id) values($1,$2,$3)`, [newWord.id,series.definition,draft.id]);
    await db.query(`insert into public.teaching_dictionary_manager_publications
      (draft_id,canonical_word_id,published_by) values($1,$2,$3)`, [draft.id,newWord.id,owner.created_by]);
    const morphIds = new Map();
    for (const row of [...words, anchors.find(r => r.word === "blow"), series]) {
      const current = live.get(row.word_key);
      const old = current.morphology_id ? await one(`select * from public.canonical_teaching_dictionary_word_morphology where id=$1`,
        [current.morphology_id]) : null;
      if (old) await db.query(`update public.canonical_teaching_dictionary_word_morphology
        set row_status='retired' where id=$1 and row_status='active'`, [old.id]);
      morphIds.set(row.word_key, await insertMorph(batch.id,current.id,row,old));
    }
    let splitCount = 0;
    for (const row of words) {
      const current = live.get(row.word_key);
      if (current.written_syllable_breakdown) continue;
      const old = await one(`select * from public.canonical_teaching_dictionary_word_metadata where id=$1`, [current.metadata_id]);
      if (!old) throw new Error(`MISSING_METADATA:${row.word_key}`);
      await db.query(`update public.canonical_teaching_dictionary_word_metadata set row_status='superseded'
        where id=$1 and row_status='active'`, [old.id]);
      await db.query(`insert into public.canonical_teaching_dictionary_word_metadata
        (import_batch_id,canonical_word_id,source_id,row_status,source_sheet,source_row_number,source_row_hash,
          source_metadata,syllables,phoneme_hint,grapheme_notes,stress_pattern,has_schwa,morphemes,morphology_notes,
          irregularity_notes,written_syllable_breakdown,source_category,source_name,source_url,source_licence,
          source_use_note,confidence,review_status,reviewed_by,reviewed_at)
        values($1,$2,$3,'active','homophone-words-review.csv',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
          $15,$16,$17,$18,$19,$20,$21,'approved_for_first_exposure',$22,now())`,
        [batch.id,current.id,old.source_id,2 + words.indexOf(row),rowHash({ key: row.word_key, split: row.written_syllable_breakdown }),
          JSON.stringify({ ...old.source_metadata, humanApprovedWrittenSyllableBreakdown: row.written_syllable_breakdown,
            approvedHomophonePackage: releaseId, approvedPackageSha256: packageHash }),old.syllables,old.phoneme_hint,
          old.grapheme_notes,old.stress_pattern,old.has_schwa,old.morphemes,old.morphology_notes,old.irregularity_notes,
          row.written_syllable_breakdown,old.source_category,old.source_name,old.source_url,old.source_licence,
          old.source_use_note,old.confidence,actor]);
      splitCount++;
    }
    if (splitCount !== 38) throw new Error(`WRITTEN_SYLLABLE_COUNT_CHANGED:${splitCount}`);
    // Revise existing families immutably, retaining all prior members and
    // approved variants, then add the approved homophone memberships.
    const allFamilyKeys = [...familyByKey.keys()];
    const oldMembers = (await db.query(`select * from public.canonical_teaching_dictionary_lexical_base_family_members
      where family_key=any($1)`, [allFamilyKeys])).rows;
    const oldVariants = (await db.query(`select * from public.canonical_teaching_dictionary_lexical_base_variants
      where family_key=any($1)`, [allFamilyKeys])).rows;
    const familyRevision = new Map();
    for (const row of proposedFamilies) {
      const old = familiesLive.get(row.family_key);
      const rev = old ? old.revision + 1 : 1;
      familyRevision.set(row.family_key, rev);
      const anchorWord = row.base_kind === "free_base" ? anchorByLemma.get(row.base_lemma) : null;
      if (row.base_kind === "free_base" && !anchorWord) throw new Error(`MISSING_FREE_BASE_ANCHOR:${row.family_key}`);
      await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_families
        (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,base_meaning,
          source_reference,review_status) values($1,$2,$3,$4,$5,$6,$7,$8,'draft')`,
        [row.family_key,rev,row.base_lemma,row.base_part_of_speech,row.base_kind,anchorWord?.id ?? null,
          row.base_meaning,source]);
    }
    const proposedByFamily = new Map();
    for (const row of proposedMembers) {
      const items = proposedByFamily.get(row.family_key) ?? [];
      items.push(row); proposedByFamily.set(row.family_key,items);
    }
    let insertedMembers = 0;
    for (const row of proposedFamilies) {
      const old = familiesLive.get(row.family_key);
      const rev = familyRevision.get(row.family_key);
      const proposals = proposedByFamily.get(row.family_key) ?? [];
      const replacedIds = new Set(proposals.map(p => live.get(p.word_key)?.id));
      for (const m of oldMembers.filter(m => m.family_key === row.family_key && m.revision === old?.revision &&
          !replacedIds.has(m.canonical_word_id))) {
        await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_family_members
          (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,
            word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [m.family_key,rev,m.canonical_word_id,m.word_part_of_speech,m.relationship_kind,m.canonical_morphology_id,
            m.word_sum,JSON.stringify(m.morphology_parts),JSON.stringify(m.morphology_joins),
            JSON.stringify(m.morphology_transformations),m.intended_meaning,source]);
        insertedMembers++;
      }
      for (const p of proposals) {
        const w = live.get(p.word_key), a = expected.get(p.word_key);
        if (!w || !a || !morphIds.has(p.word_key)) throw new Error(`MEMBER_MORPHOLOGY_MISSING:${p.word_key}`);
        await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_family_members
          (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,
            word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [p.family_key,rev,w.id,p.word_part_of_speech,p.relationship_kind,morphIds.get(p.word_key),a.wordSum,
            JSON.stringify(a.parts),JSON.stringify(a.joins),JSON.stringify(a.transformations),p.intended_meaning,source]);
        insertedMembers++;
      }
    }
    for (const v of oldVariants.filter(v => familiesLive.get(v.family_key)?.revision === v.revision))
      await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_variants
        (family_key,revision,canonical_word_id,source_base_text,relation_kind,source_reference,
          approval_reference,reviewed_by,reviewed_at) values($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [v.family_key,familyRevision.get(v.family_key),v.canonical_word_id,v.source_base_text,v.relation_kind,
          source,v.approval_reference,v.reviewed_by]);
    for (const v of variants) {
      await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_variants
        (family_key,revision,canonical_word_id,source_base_text,relation_kind,source_reference,
          approval_reference,reviewed_by,reviewed_at) values($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [v.family_key,familyRevision.get(v.family_key),live.get(v.word_key).id,v.source_base_text,
          v.relation_kind,source,approval,actor]);
    }
    for (const [key,rev] of familyRevision) await db.query(
      `select public.approve_canonical_lexical_base_family($1,$2,$3,$4)`, [key,rev,actor,approval]);
    const verify = await one(`with current as (select distinct on (family_key) family_key,revision
      from public.canonical_teaching_dictionary_lexical_base_families
      where family_key=any($1) order by family_key,revision desc)
      select count(*)::int families,count(*) filter(where f.review_status='approved')::int approved,
        (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members m
          join current c using(family_key,revision)) members
      from current c join public.canonical_teaching_dictionary_lexical_base_families f using(family_key,revision)`,
      [allFamilyKeys]);
    if (verify.families !== 164 || verify.approved !== 164 || verify.members !== insertedMembers)
      throw new Error(`FAMILY_READBACK_FAILED:${JSON.stringify(verify)}:${insertedMembers}`);
    await db.query(`update public.canonical_teaching_dictionary_import_batches
      set verification_summary=$2,verified_at=now() where id=$1`,
      [batch.id,JSON.stringify({ ...verify, targetWords: 173, morphologyRevisions: morphIds.size,
        writtenSyllableSplits: splitCount, newCanonicalWords: 1, approvedVariants: variants.length })]);
    await db.query("commit");
    const out = { target: "production",mode,releaseId,packageHash,
      canonicalTargets: 173,newCanonicalWords: 1,morphologyRevisions: morphIds.size,
      writtenSyllableSplits: splitCount, newFamilies: 63,revisedFamilies: 101,
      familyMembers: insertedMembers,approvedVariants: variants.length };
    const receipts = resolve(ROOT,"docs/implementation/seed-data/teaching-dictionary/releases",releaseId);
    mkdirSync(receipts,{ recursive:true });
    writeFileSync(resolve(receipts,"production-receipt.json"),`${JSON.stringify({ ...out,approvedBy:actor,approval,at:new Date().toISOString() },null,2)}\n`);
    console.log(JSON.stringify(out));
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
