#!/usr/bin/env node
/** Read-only, bounded Production snapshot for the 173-word homophone review. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "outputs/homophone-dictionary-family-package-2026-10-24");
const manifest = JSON.parse(readFileSync(resolve(root, "data/adle/homophone/convergence-v1/manifest.json"), "utf8"));
const words = [...new Set(manifest.skills.flatMap(skill => skill.sets.flatMap(set => set.members.map(word => word.toLowerCase()))))].sort();
if (words.length !== 173) throw new Error(`EXPECTED_173_WORDS:${words.length}`);
const envLine = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
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
  await db.query("begin read only");
  await db.query("set local statement_timeout='30s'");
  const rows = (await db.query(`
    select w.id word_id,w.word_key,w.normalised_word word,w.display_word,w.frequency_band,w.age_band,w.complexity_band,
      w.review_status word_review_status,w.source_name word_source_name,
      md.syllables,md.written_syllable_breakdown,md.phoneme_hint,md.grapheme_notes,md.stress_pattern,md.has_schwa,
      md.morphemes,md.morphology_notes,md.irregularity_notes,md.review_status metadata_review_status,
      mo.id morphology_id,mo.raw_morpholex_segmentation,mo.raw_morpholex_pos,mo.word_sum,
      mo.morphology_parts,mo.morphology_joins,mo.morphology_transformations,mo.transformation_notes,
      mo.analysis_status,mo.review_status morphology_review_status,mo.source_name morphology_source_name,
      d.definition,d.id definition_version_id,d.published_at definition_published_at,
      s.dictation_sentence,s.dictation_target_token_index,s.review_status sentence_review_status,
      coalesce(lex.memberships,'[]'::jsonb) lexical_memberships
    from public.canonical_teaching_dictionary_words w
    left join public.canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active'
    left join public.canonical_teaching_dictionary_word_morphology mo on mo.canonical_word_id=w.id and mo.row_status='active'
    left join lateral (select id,definition,published_at from public.teaching_dictionary_definition_versions d
      where d.canonical_word_id=w.id and d.published_at is not null order by d.published_at desc limit 1) d on true
    left join public.canonical_teaching_dictionary_dictation_sentences s on s.canonical_word_id=w.id
      and s.row_status='active' and s.review_status='approved_for_first_exposure'
    left join lateral (select jsonb_agg(jsonb_build_object('familyKey',lm.family_key,'revision',lm.revision,
      'wordPartOfSpeech',lm.word_part_of_speech,'relationshipKind',lm.relationship_kind,
      'intendedMeaning',lm.intended_meaning,'baseLemma',f.base_lemma,'baseKind',f.base_kind,
      'baseMeaning',f.base_meaning,'canonicalBaseWordId',f.canonical_base_word_id,
      'reviewStatus',f.review_status) order by lm.family_key) memberships
      from public.canonical_teaching_dictionary_lexical_base_family_members lm
      join public.canonical_teaching_dictionary_lexical_base_families f
        on f.family_key=lm.family_key and f.revision=lm.revision where lm.canonical_word_id=w.id) lex on true
    where w.normalised_word=any($1::text[]) and w.row_status='active' and w.dialect_code='en-GB'
    order by w.normalised_word`, [words])).rows;
  if (rows.length !== 173 || new Set(rows.map(row => row.word)).size !== 173)
    throw new Error(`CANONICAL_ROSTER_MISMATCH:${rows.length}`);
  const families = (await db.query(`select family_key,revision,base_lemma,base_part_of_speech,base_kind,
    canonical_base_word_id,base_meaning,review_status,source_reference from public.canonical_teaching_dictionary_lexical_base_families
    where review_status='approved' order by family_key`)).rows;
  const anchors = [...new Set([...rows.flatMap(row => (row.morphology_parts ?? []).flatMap(part =>
    (part.kind === 'base' || part.type === 'base') ? [String(part.sourceText ?? part.text ?? '').toLowerCase()] : [])),
    'blow','hear','lead','throw','win','series'])].filter(Boolean);
  const anchorRows = (await db.query(`select w.id,w.word_key,w.normalised_word,w.row_status,w.review_status,
      w.frequency_band,w.age_band,w.complexity_band,w.source_name,w.source_url,d.definition,
      md.syllables,md.written_syllable_breakdown,md.phoneme_hint,md.stress_pattern,
      md.has_schwa,md.grapheme_notes,md.morphemes,md.morphology_notes,md.irregularity_notes,
      mo.id morphology_id,mo.word_sum,mo.morphology_parts,mo.morphology_joins,mo.analysis_status,
      s.dictation_sentence,s.dictation_target_token_index
      from public.canonical_teaching_dictionary_words w
      left join lateral (select definition from public.teaching_dictionary_definition_versions d
        where d.canonical_word_id=w.id and d.published_at is not null order by d.published_at desc limit 1) d on true
      left join public.canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active'
      left join public.canonical_teaching_dictionary_word_morphology mo on mo.canonical_word_id=w.id and mo.row_status='active'
      left join public.canonical_teaching_dictionary_dictation_sentences s on s.canonical_word_id=w.id
        and s.row_status='active' and s.review_status='approved_for_first_exposure'
      where w.normalised_word=any($1::text[]) and w.dialect_code='en-GB' and w.row_status='active'`,[anchors])).rows;
  await db.query("rollback");
  mkdirSync(output,{recursive:true});
  writeFileSync(resolve(output,"production-snapshot.json"),JSON.stringify({asOf:new Date().toISOString(),words:rows,families,anchors:anchorRows},null,2));
  console.log(JSON.stringify({target:"production",wordCount:rows.length,approvedLexicalFamilies:families.length,anchorCount:anchorRows.length}));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
